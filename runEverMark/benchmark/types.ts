import { LlmApi } from '../../src/agentic/api';
import type { StoredApiKey } from '../../src/schema/runeverConfig';

export type BenchmarkApiPreset = {
  id: string;
  provider: StoredApiKey['provider'];
  apiKey?: string;
  baseUrl?: string;
  authMode?: StoredApiKey['authMode'];
  model?: LlmApi.LlmModelType;
  reasoningEffort?: LlmApi.ReasoningEffort;
  repeats?: number;
};

export type ResolvedBenchmarkApi = LlmApi.LlmConfig & {
  id: string;
  model: LlmApi.LlmModelType;
  reasoningEffort: LlmApi.ReasoningEffort;
  repeats: number;
};

export type BenchmarkScoreInput = {
  result: string;
  firstTokenMs: number | null;
  totalTimeMs: number;
};

export type BenchmarkScore = {
  score: number;
  highlights: string[];
};

export type BenchmarkCase = {
  id: string;
  name: string;
  maxScore: number;
  weight?: number;
  systemPrompt: string;
  userPrompt: string;
  score: (
    input: BenchmarkScoreInput,
  ) => BenchmarkScore | Promise<BenchmarkScore>;
};

export type BenchmarkRunResult = {
  attempt: number;
  firstTokenMs: number | null;
  totalTimeMs: number;
  result: string;
  score: number;
  highlights: string[];
  error?: string;
};

export type BenchmarkRunSummary = Omit<BenchmarkRunResult, 'result'> & {
  resultChars?: number;
  resultFormat?: 'empty' | 'raw_json' | 'fenced_json' | 'embedded_json' | 'text';
  resultPreview?: string;
};

export type BenchmarkCaseSummary = {
  caseId: string;
  caseName: string;
  runCount: number;
  singleRunMaxScore: number;
  maxScore: number;
  weight: number;
  adjustedMaxScore: number;
  totalScore: number;
  adjustedTotalScore: number;
  scoreRate: number;
  adjustedScoreRate: number;
  averageScore: number;
  averageFirstTokenMs: number;
  averageTotalTimeMs: number;
  highlights: string[];
  runs: BenchmarkRunResult[];
  detailPath?: string;
};

export type BenchmarkCaseSummaryFile = Omit<BenchmarkCaseSummary, 'runs'> & {
  runs: BenchmarkRunSummary[];
};

export type BenchmarkApiSummaryFile = Omit<
  BenchmarkApiSummary,
  'caseSummaries'
> & {
  caseSummaries: BenchmarkCaseSummaryFile[];
};

export type BenchmarkReportFile = Omit<BenchmarkReport, 'summaries'> & {
  summaries: BenchmarkApiSummaryFile[];
};

export type BenchmarkApiSummary = {
  apiId: string;
  provider: StoredApiKey['provider'];
  maxScore: number;
  adjustedMaxScore: number;
  scoreRate: number;
  adjustedScoreRate: number;
  averageScore: number;
  averageFirstTokenMs: number;
  averageTotalTimeMs: number;
  totalScore: number;
  adjustedTotalScore: number;
  caseSummaries: BenchmarkCaseSummary[];
  modelDir?: string;
  detailPath?: string;
};

export type BenchmarkReport = {
  startedAt: string;
  finishedAt: string;
  caseCount: number;
  repeats?: number;
  apis: string[];
  summaries: BenchmarkApiSummary[];
  skippedApis: Array<{
    id: string;
    reason: string;
  }>;
  runDirectory?: string;
  summaryPath?: string;
  mergedSummaryPath?: string;
  outputPath?: string;
};
