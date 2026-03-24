import fs from 'fs';
import path from 'path';
import { LlmApi } from '../../src/agentic/api';
import { benchmarkApis, benchmarkCases, defaultOutputDir } from './config';
import type {
  BenchmarkApiSummary,
  BenchmarkCaseSummary,
  BenchmarkReport,
  BenchmarkReportFile,
  BenchmarkRunResult,
  ResolvedBenchmarkApi,
} from './types';

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const averageNullable = (values: Array<number | null>) => {
  const filtered = values.filter((value): value is number => value !== null);
  return average(filtered);
};

const uniqueHighlights = (runs: BenchmarkRunResult[]) => {
  return [...new Set(runs.flatMap((run) => run.highlights))];
};

const toReportFile = (report: BenchmarkReport): BenchmarkReportFile => {
  return {
    ...report,
    summaries: report.summaries.map((summary) => ({
      ...summary,
      caseSummaries: summary.caseSummaries.map((caseSummary) => ({
        ...caseSummary,
        runs: caseSummary.runs.map(({ result: _result, ...run }) => run),
      })),
    })),
  };
};

const readExistingReportFile = (outputRootDir: string) => {
  const summaryPath = path.join(outputRootDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as BenchmarkReportFile;
  } catch {
    return null;
  }
};

const mergeReportFiles = (
  existingReport: BenchmarkReportFile | null,
  currentReport: BenchmarkReportFile,
  outputRootDir: string,
) => {
  const summaryByApiId = new Map<string, BenchmarkReportFile['summaries'][number]>();
  const skippedByKey = new Map<string, BenchmarkReportFile['skippedApis'][number]>();

  if (existingReport) {
    existingReport.summaries.forEach((summary) => {
      summaryByApiId.set(summary.apiId, summary);
    });
    existingReport.skippedApis.forEach((item) => {
      skippedByKey.set(`${item.id}:${item.reason}`, item);
    });
  }

  currentReport.summaries.forEach((summary) => {
    summaryByApiId.set(summary.apiId, summary);
  });
  currentReport.skippedApis.forEach((item) => {
    skippedByKey.set(`${item.id}:${item.reason}`, item);
  });

  const mergedSummaries = [...summaryByApiId.values()].sort(
    (left, right) => right.totalScore - left.totalScore,
  );
  const mergedSummaryPath = path.join(outputRootDir, 'summary.json');

  return {
    startedAt:
      existingReport?.startedAt ??
      currentReport.startedAt,
    finishedAt: currentReport.finishedAt,
    caseCount: currentReport.caseCount,
    repeats: currentReport.repeats,
    apis: mergedSummaries.map((summary) => summary.apiId),
    summaries: mergedSummaries,
    skippedApis: [...skippedByKey.values()],
    runDirectory: outputRootDir,
    summaryPath: mergedSummaryPath,
    mergedSummaryPath,
    outputPath: mergedSummaryPath,
  } satisfies BenchmarkReportFile;
};

const resolveApiConfigs = (
  selectedApiIds: string[] | undefined,
  repeatOverride: number | undefined,
) => {
  const skippedApis: BenchmarkReport['skippedApis'] = [];
  const resolvedApis: ResolvedBenchmarkApi[] = [];

  for (const preset of benchmarkApis) {
    if (selectedApiIds && !selectedApiIds.includes(preset.id)) {
      continue;
    }

    const key = preset.apiKey?.trim() ?? '';
    const baseUrl = preset.baseUrl?.trim() || undefined;

    if (!key && preset.authMode !== 'login') {
      skippedApis.push({
        id: preset.id,
        reason: 'apiKey is empty',
      });
      continue;
    }

    resolvedApis.push({
      id: preset.id,
      api: preset.provider,
      key: key ?? '',
      baseUrl,
      authMode: preset.authMode,
      model: preset.model ?? 'mid',
      reasoningEffort: preset.reasoningEffort ?? 'low',
      repeats: repeatOverride ?? preset.repeats ?? 1,
    });
  }

  return {
    resolvedApis,
    skippedApis,
  };
};

export const runBenchmark = async (
  options: {
    apiIds?: string[];
    repeats?: number;
    outputDir?: string;
  } = {},
): Promise<BenchmarkReport> => {
  const startedAt = new Date().toISOString();
  const { resolvedApis, skippedApis } = resolveApiConfigs(
    options.apiIds,
    options.repeats,
  );
  const outputRootDir = options.outputDir ?? defaultOutputDir;
  const runDirectory = outputRootDir;

  fs.mkdirSync(runDirectory, { recursive: true });
  console.log(`[benchmark] run started: ${startedAt}`);
  console.log(`[benchmark] run directory: ${runDirectory}`);

  const summaries: BenchmarkApiSummary[] = [];

  if (skippedApis.length > 0) {
    skippedApis.forEach((item) => {
      console.log(`[benchmark] skip api ${item.id}: ${item.reason}`);
    });
  }

  for (const apiConfig of resolvedApis) {
    const modelDir = path.join(runDirectory, apiConfig.id);
    const promptRecordPath = path.join(modelDir, 'prompt-record');
    const casesDir = path.join(modelDir, 'cases');
    fs.mkdirSync(casesDir, { recursive: true });
    console.log(
      `[benchmark] api ${apiConfig.id} provider=${apiConfig.api} repeats=${apiConfig.repeats} model=${apiConfig.model}`,
    );
    if (apiConfig.baseUrl) {
      console.log(
        `[benchmark] api ${apiConfig.id} baseUrl=${apiConfig.baseUrl}`,
      );
    }
    console.log(`[benchmark] api ${apiConfig.id} output=${modelDir}`);

    const client = LlmApi.createClient(apiConfig, {
      recordPath: promptRecordPath,
    });
    const caseSummaries: BenchmarkCaseSummary[] = [];

    for (const benchmarkCase of benchmarkCases) {
      const runs: BenchmarkRunResult[] = [];
      console.log(
        `[benchmark] case ${benchmarkCase.id} start for api ${apiConfig.id}`,
      );

      for (let attempt = 0; attempt < apiConfig.repeats; attempt += 1) {
        const attemptNumber = attempt + 1;
        try {
          const cacheKey = [
            'benchmark',
            apiConfig.id,
            benchmarkCase.id,
            attemptNumber,
            Date.now(),
          ].join(':');
          console.log(
            `[benchmark] attempt ${attemptNumber}/${apiConfig.repeats} api=${apiConfig.id} case=${benchmarkCase.id} request start`,
          );
          const stream = await client.queryLLMApi(
            benchmarkCase.userPrompt,
            benchmarkCase.systemPrompt,
            null,
            cacheKey,
            apiConfig.model,
            apiConfig.reasoningEffort,
          );
          const measured = await LlmApi.collectStream(stream);
          const scored = await benchmarkCase.score({
            result: measured.text,
            firstTokenMs: measured.firstTokenMs,
            totalTimeMs: measured.totalTimeMs,
          });

          runs.push({
            attempt: attemptNumber,
            firstTokenMs: measured.firstTokenMs,
            totalTimeMs: measured.totalTimeMs,
            result: measured.text,
            score: scored.score,
            highlights: scored.highlights,
          });
          console.log(
            `[benchmark] attempt ${attemptNumber}/${apiConfig.repeats} api=${apiConfig.id} case=${benchmarkCase.id} done score=${scored.score} first=${measured.firstTokenMs ?? -1}ms total=${measured.totalTimeMs}ms`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          runs.push({
            attempt: attemptNumber,
            firstTokenMs: null,
            totalTimeMs: 0,
            result: '',
            score: 0,
            highlights: ['request failed'],
            error: errorMessage,
          });
          console.log(
            `[benchmark] attempt ${attemptNumber}/${apiConfig.repeats} api=${apiConfig.id} case=${benchmarkCase.id} failed error=${errorMessage}`,
          );
        }
      }

      const caseDetailPath = path.join(casesDir, `${benchmarkCase.id}.json`);
      const caseSummary: BenchmarkCaseSummary = {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        runCount: runs.length,
        averageScore: Number(average(runs.map((run) => run.score)).toFixed(2)),
        averageFirstTokenMs: Number(
          averageNullable(runs.map((run) => run.firstTokenMs)).toFixed(2),
        ),
        averageTotalTimeMs: Number(
          average(runs.map((run) => run.totalTimeMs)).toFixed(2),
        ),
        highlights: uniqueHighlights(runs),
        runs,
        detailPath: caseDetailPath,
      };

      fs.writeFileSync(caseDetailPath, JSON.stringify(caseSummary, null, 2));
      console.log(
        `[benchmark] case ${benchmarkCase.id} complete avgScore=${caseSummary.averageScore} avgFirst=${caseSummary.averageFirstTokenMs}ms avgTotal=${caseSummary.averageTotalTimeMs}ms detail=${caseDetailPath}`,
      );

      caseSummaries.push(caseSummary);
    }

    const totalScore = Number(
      caseSummaries
        .reduce((sum, summary) => sum + summary.averageScore, 0)
        .toFixed(2),
    );
    const detailPath = path.join(modelDir, 'details.json');
    const apiSummary: BenchmarkApiSummary = {
      apiId: apiConfig.id,
      provider: apiConfig.api,
      totalScore,
      averageScore: Number(
        average(caseSummaries.map((summary) => summary.averageScore)).toFixed(
          2,
        ),
      ),
      averageFirstTokenMs: Number(
        average(
          caseSummaries.map((summary) => summary.averageFirstTokenMs),
        ).toFixed(2),
      ),
      averageTotalTimeMs: Number(
        average(
          caseSummaries.map((summary) => summary.averageTotalTimeMs),
        ).toFixed(2),
      ),
      caseSummaries,
      modelDir,
      detailPath,
    };

    fs.writeFileSync(detailPath, JSON.stringify(apiSummary, null, 2));
    console.log(
      `[benchmark] api ${apiConfig.id} complete total=${apiSummary.totalScore} avg=${apiSummary.averageScore} detail=${detailPath}`,
    );
    summaries.push(apiSummary);
  }

  summaries.sort((left, right) => right.totalScore - left.totalScore);

  const finishedAt = new Date().toISOString();
  const summaryPath = path.join(runDirectory, 'summary.json');

  const report: BenchmarkReport = {
    startedAt,
    finishedAt,
    caseCount: benchmarkCases.length,
    repeats: options.repeats,
    apis: resolvedApis.map((api) => api.id),
    summaries,
    skippedApis,
    runDirectory,
    summaryPath,
    outputPath: summaryPath,
  };

  const currentReportFile = toReportFile(report);
  const existingReport = readExistingReportFile(outputRootDir);
  const mergedReportFile = mergeReportFiles(
    existingReport,
    currentReportFile,
    outputRootDir,
  );
  fs.writeFileSync(summaryPath, JSON.stringify(mergedReportFile, null, 2));

  report.mergedSummaryPath = summaryPath;
  console.log(`[benchmark] summary written: ${summaryPath}`);
  console.log(`[benchmark] merged summary written: ${summaryPath}`);
  console.log(`[benchmark] run finished: ${finishedAt}`);
  return report;
};

export const renderReportSummary = (report: BenchmarkReport) => {
  const lines: string[] = [
    `runEverMark benchmark finished at ${report.finishedAt}`,
    `cases: ${report.caseCount}`,
  ];

  if (report.skippedApis.length > 0) {
    lines.push(
      `skipped: ${report.skippedApis.map((item) => `${item.id} (${item.reason})`).join(', ')}`,
    );
  }

  if (report.summaries.length === 0) {
    lines.push('no API config was runnable');
    return lines.join('\n');
  }

  for (const summary of report.summaries) {
    lines.push(
      `${summary.apiId}: total=${summary.totalScore} avg=${summary.averageScore} first=${summary.averageFirstTokenMs}ms totalTime=${summary.averageTotalTimeMs}ms`,
    );
    for (const caseSummary of summary.caseSummaries) {
      lines.push(
        `  ${caseSummary.caseId}: avg=${caseSummary.averageScore} first=${caseSummary.averageFirstTokenMs}ms totalTime=${caseSummary.averageTotalTimeMs}ms runs=${caseSummary.runs.length}`,
      );
      if (caseSummary.highlights.length > 0) {
        lines.push(`    highlights: ${caseSummary.highlights.join(' | ')}`);
      }
    }
  }

  if (report.summaryPath) {
    lines.push(`run summary: ${report.summaryPath}`);
  }
  if (report.mergedSummaryPath) {
    lines.push(`merged summary: ${report.mergedSummaryPath}`);
  }
  if (report.runDirectory) {
    lines.push(`run dir: ${report.runDirectory}`);
  }

  return lines.join('\n');
};
