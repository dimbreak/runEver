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

const toScoreRate = (score: number, maxScore: number) => {
  if (maxScore <= 0) {
    return 0;
  }
  return Number(((score / maxScore) * 100).toFixed(2));
};

const getCaseWeight = (weight: number | undefined) => weight ?? 1;

const benchmarkRequestRetriesOnEmptyOutput = 1;
const benchmarkRequestTimeoutMs = 180_000;
const benchmarkRequestSpacingMs = 1_000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const collectBenchmarkStream = async (
  stream: AsyncIterable<string | null | undefined>,
) => {
  return Promise.race([
    LlmApi.collectStream(stream),
    sleep(benchmarkRequestTimeoutMs).then(() => {
      throw new Error(
        `Benchmark request timed out after ${benchmarkRequestTimeoutMs}ms`,
      );
    }),
  ]);
};

const isBenchmarkEmptyOutput = (measured: LlmApi.CollectedStream) =>
  measured.firstTokenMs === null && measured.text.trim() === '';

const uniqueHighlights = (runs: BenchmarkRunResult[]) => {
  return [...new Set(runs.flatMap((run) => run.highlights))];
};

const detectResultFormat = (
  result: string,
): 'empty' | 'raw_json' | 'fenced_json' | 'embedded_json' | 'text' => {
  const trimmed = result.trim();
  if (!trimmed) {
    return 'empty';
  }
  if (trimmed.startsWith('```')) {
    return 'fenced_json';
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'raw_json';
  }
  if (trimmed.includes('{"a"') || trimmed.includes('{\n  "a"')) {
    return 'embedded_json';
  }
  return 'text';
};

const buildResultPreview = (result: string, maxLength = 200) => {
  const normalized = result.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const toReportFile = (report: BenchmarkReport): BenchmarkReportFile => {
  return {
    ...report,
    summaries: report.summaries.map((summary) => ({
      ...summary,
      caseSummaries: summary.caseSummaries.map((caseSummary) => ({
        ...caseSummary,
        runs: caseSummary.runs.map(({ result, ...run }) => ({
          ...run,
          resultChars: result.length,
          resultFormat: detectResultFormat(result),
          resultPreview: buildResultPreview(result),
        })),
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
    (left, right) => right.adjustedTotalScore - left.adjustedTotalScore,
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
          let measured: LlmApi.CollectedStream | null = null;
          let lastError: unknown = null;

          for (
            let requestAttempt = 0;
            requestAttempt <= benchmarkRequestRetriesOnEmptyOutput;
            requestAttempt += 1
          ) {
            const requestAttemptNumber = requestAttempt + 1;
            const cacheKey = [
              'benchmark',
              apiConfig.id,
              benchmarkCase.id,
              attemptNumber,
              requestAttemptNumber,
              Date.now(),
            ].join(':');
            console.log(
              `[benchmark] attempt ${attemptNumber}/${apiConfig.repeats} api=${apiConfig.id} case=${benchmarkCase.id} request start try=${requestAttemptNumber}/${benchmarkRequestRetriesOnEmptyOutput + 1}`,
            );

            try {
              const stream = await client.queryLLMApi(
                benchmarkCase.userPrompt,
                benchmarkCase.systemPrompt,
                null,
                cacheKey,
                apiConfig.model,
                apiConfig.reasoningEffort,
              );
              const currentMeasured = await collectBenchmarkStream(stream);
              if (isBenchmarkEmptyOutput(currentMeasured)) {
                lastError = new Error('No output generated.');
                if (requestAttempt < benchmarkRequestRetriesOnEmptyOutput) {
                  console.warn(
                    `[benchmark] empty output api=${apiConfig.id} case=${benchmarkCase.id}; retrying request`,
                  );
                  await sleep(benchmarkRequestSpacingMs);
                  continue;
                }
                throw lastError;
              }
              measured = currentMeasured;
              break;
            } catch (error) {
              lastError = error;
              if (requestAttempt < benchmarkRequestRetriesOnEmptyOutput) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                console.warn(
                  `[benchmark] request failed api=${apiConfig.id} case=${benchmarkCase.id}; retrying request error=${errorMessage}`,
                );
                await sleep(benchmarkRequestSpacingMs);
                continue;
              }
              throw error;
            }
          }

          if (!measured) {
            throw (
              lastError instanceof Error
                ? lastError
                : new Error(String(lastError ?? 'Benchmark request failed'))
            );
          }

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

        await sleep(benchmarkRequestSpacingMs);
      }

      const caseDetailPath = path.join(casesDir, `${benchmarkCase.id}.json`);
      const caseWeight = getCaseWeight(benchmarkCase.weight);
      const caseMaxScore = Number(
        (benchmarkCase.maxScore * runs.length).toFixed(2),
      );
      const caseTotalScore = Number(
        runs.reduce((sum, run) => sum + run.score, 0).toFixed(2),
      );
      const adjustedCaseMaxScore = Number(
        (caseMaxScore * caseWeight).toFixed(2),
      );
      const adjustedCaseTotalScore = Number(
        (caseTotalScore * caseWeight).toFixed(2),
      );
      const caseSummary: BenchmarkCaseSummary = {
        caseId: benchmarkCase.id,
        caseName: benchmarkCase.name,
        runCount: runs.length,
        singleRunMaxScore: benchmarkCase.maxScore,
        maxScore: caseMaxScore,
        weight: caseWeight,
        adjustedMaxScore: adjustedCaseMaxScore,
        totalScore: caseTotalScore,
        adjustedTotalScore: adjustedCaseTotalScore,
        scoreRate: toScoreRate(caseTotalScore, caseMaxScore),
        adjustedScoreRate: toScoreRate(
          adjustedCaseTotalScore,
          adjustedCaseMaxScore,
        ),
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

      fs.mkdirSync(casesDir, { recursive: true });
      fs.writeFileSync(caseDetailPath, JSON.stringify(caseSummary, null, 2));
      console.log(
        `[benchmark] case ${benchmarkCase.id} complete score=${caseSummary.totalScore}/${caseSummary.maxScore} (${caseSummary.scoreRate}%) adjusted=${caseSummary.adjustedTotalScore}/${caseSummary.adjustedMaxScore} avgPerRun=${caseSummary.averageScore}/${caseSummary.singleRunMaxScore} avgFirst=${caseSummary.averageFirstTokenMs}ms avgTotal=${caseSummary.averageTotalTimeMs}ms detail=${caseDetailPath}`,
      );

      caseSummaries.push(caseSummary);
    }

    const totalScore = Number(
      caseSummaries
        .reduce((sum, summary) => sum + summary.totalScore, 0)
        .toFixed(2),
    );
    const maxScore = Number(
      caseSummaries
        .reduce((sum, summary) => sum + summary.maxScore, 0)
        .toFixed(2),
    );
    const adjustedTotalScore = Number(
      caseSummaries
        .reduce((sum, summary) => sum + summary.adjustedTotalScore, 0)
        .toFixed(2),
    );
    const adjustedMaxScore = Number(
      caseSummaries
        .reduce((sum, summary) => sum + summary.adjustedMaxScore, 0)
        .toFixed(2),
    );
    const detailPath = path.join(modelDir, 'details.json');
    const apiSummary: BenchmarkApiSummary = {
      apiId: apiConfig.id,
      provider: apiConfig.api,
      maxScore,
      adjustedMaxScore,
      scoreRate: toScoreRate(totalScore, maxScore),
      adjustedScoreRate: toScoreRate(adjustedTotalScore, adjustedMaxScore),
      totalScore,
      adjustedTotalScore,
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
      `[benchmark] api ${apiConfig.id} complete score=${apiSummary.totalScore}/${apiSummary.maxScore} (${apiSummary.scoreRate}%) adjusted=${apiSummary.adjustedTotalScore}/${apiSummary.adjustedMaxScore} (${apiSummary.adjustedScoreRate}%) avgPerRun=${apiSummary.averageScore} detail=${detailPath}`,
    );
    summaries.push(apiSummary);
  }

  summaries.sort(
    (left, right) => right.adjustedTotalScore - left.adjustedTotalScore,
  );

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
      `${summary.apiId}: score=${summary.totalScore}/${summary.maxScore} (${summary.scoreRate}%) first=${summary.averageFirstTokenMs}ms totalTime=${summary.averageTotalTimeMs}ms`,
    );
    lines.push(
      `  adjusted=${summary.adjustedTotalScore}/${summary.adjustedMaxScore} (${summary.adjustedScoreRate}%)`,
    );
    for (const caseSummary of summary.caseSummaries) {
      lines.push(
        `  ${caseSummary.caseId}: score=${caseSummary.totalScore}/${caseSummary.maxScore} (${caseSummary.scoreRate}%) adjusted=${caseSummary.adjustedTotalScore}/${caseSummary.adjustedMaxScore} weight=${caseSummary.weight} avgPerRun=${caseSummary.averageScore}/${caseSummary.singleRunMaxScore} first=${caseSummary.averageFirstTokenMs}ms totalTime=${caseSummary.averageTotalTimeMs}ms runs=${caseSummary.runs.length}`,
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
