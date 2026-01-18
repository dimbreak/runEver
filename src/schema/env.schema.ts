import { z } from 'zod';

export const envSchema = z.object({
  provider: z.enum(['openai', 'google']),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const apiTrustEnvSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  apiUrl: z.string().url(),
});

export type ApiTrustEnv = z.infer<typeof apiTrustEnvSchema>;
