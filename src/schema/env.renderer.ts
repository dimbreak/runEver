import { apiTrustEnvSchema, type ApiTrustEnv } from './env.schema';

export const loadApiTrustEnv = async (): Promise<ApiTrustEnv> => {
  const rawEnv = await window.electron.apiTrust.getEnv();
  console.log('rawEnv', rawEnv);
  return apiTrustEnvSchema.parse(rawEnv);
};

export const loadApiTrustToken = async (): Promise<string | null> => {
  const { token } = await window.electron.apiTrust.getToken();
  return typeof token === 'string' && token.length > 0 ? token : null;
};
