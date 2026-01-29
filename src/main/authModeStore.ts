import settings from 'electron-settings';
import { authModeSchema, type AuthMode } from '../schema/auth.schema';

const AUTH_MODE_KEY = 'authMode';

export const getAuthMode = (): AuthMode | null => {
  const raw = settings.getSync(AUTH_MODE_KEY);
  const parsed = authModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

export const setAuthMode = (mode: AuthMode | null): void => {
  settings.setSync(AUTH_MODE_KEY, mode ?? null);
};
