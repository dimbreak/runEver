import { z } from 'zod';

export const codexAuthModeSchema = z.enum(['apiKey', 'login']);

export const StoredApiKeySchema = z.object({
  provider: z.enum([
    'openai',
    'google',
    'zai',
    'minimax',
    'anthropic',
    'xai',
    'deepseek',
    'alibaba',
    'moonshot',
    'codex',
  ]),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  authMode: codexAuthModeSchema.optional(),
});

export type StoredApiKey = z.infer<typeof StoredApiKeySchema>;

export const storedArgumentSchema = z.object({
  name: z.string(),
  value: z.string(),
  isSecret: z.boolean().optional(),
  domain: z.string().optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
});

export const RunEverConfigSchema = z.object({
  apiKey: StoredApiKeySchema.optional(),
  arguments: storedArgumentSchema.array().default([]),
});

export type RunEverConfig = z.infer<typeof RunEverConfigSchema>;
