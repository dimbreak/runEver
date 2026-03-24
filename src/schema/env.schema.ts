import { z } from 'zod';

export const apiTrustEnvSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.url(),
  authBaseUrl: z.url(),
  apiUrl: z.url(),
});

export type ApiTrustEnv = z.infer<typeof apiTrustEnvSchema>;
