import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type {
  BenchmarkApiPreset,
  BenchmarkCase,
  BenchmarkReportFile,
} from './types';
import { googleSearchScamTest } from './cases/v1/googleSearchScam';
import { amazonLongCtxBuyTest } from './cases/v1/amazonLongCtxBuy';
import { longTaskSplittingTest } from './cases/v1/longTaskSplitting';
import { longFormFillingTest } from './cases/v1/longFormFilling';
import { reasoningCalendarTest } from './cases/v1/reasoningCalendar';
import { webskillAddWishlistTest } from './cases/v1/webskillAddWishlist';
import { longFormWebskillTest } from './cases/v1/longFormWebskill';

dotenv.config({
  path: path.resolve(process.cwd(), 'runEverMark/benchmark/.env'),
});

export const benchmarkCases: BenchmarkCase[] = [
  googleSearchScamTest,
  amazonLongCtxBuyTest,
  longTaskSplittingTest,
  longFormFillingTest,
  reasoningCalendarTest,
  webskillAddWishlistTest,
  longFormWebskillTest,
];

const readEnv = (name: string) => process.env[name]?.trim() || '';

const env = {
  ROUND: readEnv('ROUND') || 'test',
  REPEAT: parseInt(readEnv('REPEAT') || '1', 10),
  OPENAI_API_KEY: readEnv('OPENAI_API_KEY'),
  OPENAI_BASE_URL: readEnv('OPENAI_BASE_URL'),
  GOOGLE_API_KEY: readEnv('GOOGLE_API_KEY'),
  GOOGLE_BASE_URL: readEnv('GOOGLE_BASE_URL'),
  ZAI_API_KEY: readEnv('ZAI_API_KEY'),
  ZAI_BASE_URL: readEnv('ZAI_BASE_URL'),
  ANTHROPIC_API_KEY: readEnv('ANTHROPIC_API_KEY'),
  ANTHROPIC_BASE_URL: readEnv('ANTHROPIC_BASE_URL'),
  XAI_API_KEY: readEnv('XAI_API_KEY'),
  XAI_BASE_URL: readEnv('XAI_BASE_URL'),
  XAI_420_API_KEY: readEnv('XAI_420_API_KEY'),
  XAI_420_BASE_URL: readEnv('XAI_420_BASE_URL'),
  ALIBABA_API_KEY: readEnv('ALIBABA_API_KEY'),
  ALIBABA_BASE_URL: readEnv('ALIBABA_BASE_URL'),
  ALIBABA_36_API_KEY: readEnv('ALIBABA_36_API_KEY'),
  ALIBABA_36_BASE_URL: readEnv('ALIBABA_36_BASE_URL'),
  DEEPSEEK_API_KEY: readEnv('DEEPSEEK_API_KEY'),
  DEEPSEEK_BASE_URL: readEnv('DEEPSEEK_BASE_URL'),
  MINIMAX_API_KEY: readEnv('MINIMAX_API_KEY'),
  MINIMAX_BASE_URL: readEnv('MINIMAX_BASE_URL'),
  MOONSHOT_API_KEY: readEnv('MOONSHOT_API_KEY'),
  MOONSHOT_BASE_URL: readEnv('MOONSHOT_BASE_URL'),
} as const;

const reportsRootDir = path.resolve(
  process.cwd(),
  'runEverMark/benchmark/reports',
);

const roundOutputDir = path.resolve(reportsRootDir, env.ROUND);

const readCompletedApiIds = (roundDir: string): Set<string> => {
  const summaryPath = path.join(roundDir, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    return new Set();
  }

  try {
    const summary = JSON.parse(
      fs.readFileSync(summaryPath, 'utf8'),
    ) as BenchmarkReportFile;
    return new Set(
      summary.summaries
        .map((item) => item.apiId)
        .filter((apiId): apiId is string => Boolean(apiId)),
    );
  } catch {
    return new Set();
  }
};

const completedApiIds = readCompletedApiIds(roundOutputDir);

const configuredBenchmarkApis: BenchmarkApiPreset[] = [
  {
    id: 'openai-gpt-5.4',
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'openai-gpt-5-mini',
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: 'mid',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'openai-gpt-5.4-mini',
    provider: 'openai',
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL,
    model: 'low',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'google-gemini-3.1-pro-preview',
    provider: 'google',
    apiKey: env.GOOGLE_API_KEY,
    baseUrl: env.GOOGLE_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  // {
  //   id: 'google-gemini-3-flash-preview',
  //   provider: 'google',
  //   apiKey: env.GOOGLE_API_KEY,
  //   baseUrl: env.GOOGLE_BASE_URL,
  //   model: 'mid',
  //   reasoningEffort: 'low',
  //   repeats: env.REPEAT,
  // },
  {
    id: 'google-gemini-3.1-flash-lite-preview',
    provider: 'google',
    apiKey: env.GOOGLE_API_KEY,
    baseUrl: env.GOOGLE_BASE_URL,
    model: 'low',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'anthropic-claude-opus-4-6',
    provider: 'anthropic',
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrl: env.ANTHROPIC_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'anthropic-claude-sonnet-4-6',
    provider: 'anthropic',
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrl: env.ANTHROPIC_BASE_URL,
    model: 'mid',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'x-ai/grok-4.20',
    provider: 'xai',
    apiKey: env.XAI_420_API_KEY,
    baseUrl: env.XAI_420_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'grok-4.1-fast',
    provider: 'xai',
    apiKey: env.XAI_API_KEY,
    baseUrl: env.XAI_BASE_URL,
    model: 'low',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'alibaba-qwen3.6-plus',
    provider: 'alibaba',
    apiKey: env.ALIBABA_36_API_KEY,
    baseUrl: env.ALIBABA_36_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  // {
  //   id: 'alibaba-qwen3.5-397b-a17b',
  //   provider: 'alibaba',
  //   apiKey: env.ALIBABA_API_KEY,
  //   baseUrl: env.ALIBABA_BASE_URL,
  //   model: 'mid',
  //   reasoningEffort: 'low',
  //   repeats: env.REPEAT,
  // },
  {
    id: 'deepseek-v4-pro',
    provider: 'deepseek',
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'zai-glm-5',
    provider: 'zai',
    apiKey: env.ZAI_API_KEY,
    baseUrl: env.ZAI_BASE_URL,
    model: 'hi',
    repeats: env.REPEAT,
  },
  {
    id: 'minimax-m2.7',
    provider: 'minimax',
    apiKey: env.MINIMAX_API_KEY,
    baseUrl: env.MINIMAX_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
  {
    id: 'kimi-k2.5',
    provider: 'moonshot',
    apiKey: env.MOONSHOT_API_KEY,
    baseUrl: env.MOONSHOT_BASE_URL,
    model: 'hi',
    reasoningEffort: 'low',
    repeats: env.REPEAT,
  },
];

export const benchmarkApis: BenchmarkApiPreset[] =
  configuredBenchmarkApis.filter((api) => !completedApiIds.has(api.id));

export const defaultOutputDir = roundOutputDir;
