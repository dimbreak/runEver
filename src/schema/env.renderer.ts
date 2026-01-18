import { apiTrustEnvSchema, type ApiTrustEnv } from './env.schema';

export const loadApiTrustEnv = async (): Promise<ApiTrustEnv> => {
  const rawEnv = await window.electron.apiTrust.getEnv();
  console.log('rawEnv', rawEnv);
  return apiTrustEnvSchema.parse(rawEnv);
};

export const apiTrustEnv = apiTrustEnvSchema.parse(loadApiTrustEnv());
