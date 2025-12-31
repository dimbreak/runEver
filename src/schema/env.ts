import { z } from 'zod';

export const envSchema = z.object({
  provider: z.enum(['openai', 'google']),
  apiKey: z.string(),
});

export type Env = z.infer<typeof envSchema>;

console.log('process.env.LLM_API_PROVIDER', process.env.LLM_API_PROVIDER);
console.log('process.env.LLM_API_KEY', process.env.LLM_API_KEY);

export const envVars: Env = envSchema.parse({
  provider: process.env.LLM_API_PROVIDER,
  apiKey: process.env.LLM_API_KEY,
});
