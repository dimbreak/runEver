import { config as configDotEnv } from 'dotenv';
import {
  apiTrustEnvSchema,
  type ApiTrustEnv,
} from './env.schema';

configDotEnv();

export const apiTrustEnvVars: ApiTrustEnv = apiTrustEnvSchema.parse({
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  authBaseUrl: process.env.AUTH_BASE_URL,
  apiUrl: process.env.API_URL,
});
