import { z } from 'zod';

export const codexAuthModeSchema = z.enum(['apiKey', 'login']);

export const envSchema = z.object({
  provider: z.enum(['openai', 'google', 'zai', 'codex']),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  authMode: codexAuthModeSchema.optional(),
});

export type Env = z.infer<typeof envSchema>;

export const apiTrustEnvSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.url(),
  authBaseUrl: z.url(),
  apiUrl: z.url(),
});

export type ApiTrustEnv = z.infer<typeof apiTrustEnvSchema>;
