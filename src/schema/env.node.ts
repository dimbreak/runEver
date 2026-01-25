import { config as configDotEnv } from 'dotenv';
import {
  apiTrustEnvSchema,
  envSchema,
  type ApiTrustEnv,
  type Env,
} from './env.schema';

configDotEnv();

export const envVars: Env = envSchema.parse({
  provider: process.env.LLM_API_PROVIDER,
  apiKey: process.env.LLM_API_KEY,
  baseUrl: process.env.LLM_API_BASE_URL,
});

export const apiTrustEnvVars: ApiTrustEnv = apiTrustEnvSchema.parse({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  authBaseUrl: process.env.AUTH_BASE_URL,
  apiUrl: process.env.API_URL,
});
