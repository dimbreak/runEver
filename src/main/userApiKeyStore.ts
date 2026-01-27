import { app } from 'electron';
import type { Entry as KeyringEntry } from '@napi-rs/keyring';
import { z } from 'zod';
import { envSchema } from '../schema/env.schema';

// eslint-disable-next-line camelcase, no-underscore-dangle, no-undef
declare const __non_webpack_require__: typeof require | undefined;

// Use a runtime require so webpack doesn't try to bundle native .node bindings.
// eslint-disable-next-line camelcase, no-underscore-dangle
const runtimeRequire =
  // eslint-disable-next-line camelcase, no-underscore-dangle
  typeof __non_webpack_require__ === 'function'
    ? // eslint-disable-next-line camelcase, no-underscore-dangle
      __non_webpack_require__
    : require;
const { Entry } = runtimeRequire(
  '@napi-rs/keyring',
) as typeof import('@napi-rs/keyring');

const storedApiKeySchema = envSchema.pick({
  provider: true,
  apiKey: true,
  baseUrl: true,
});

export type UserApiKeyConfig = z.infer<typeof storedApiKeySchema>;

interface UserApiKeyStoreOptions {
  service?: string;
  account?: string;
}

export class UserApiKeyStore {
  private entry: KeyringEntry;

  constructor(options: UserApiKeyStoreOptions = {}) {
    const appName = app.getName();
    const service = options.service ?? `${appName}.user-api-key`;
    const account = options.account ?? 'llm-config';
    this.entry = new Entry(service, account);
  }

  async getConfig(): Promise<UserApiKeyConfig | null> {
    const raw = await this.entry.getPassword();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      const result = storedApiKeySchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch (error) {
      console.warn('Failed to parse stored API key config', error);
      return null;
    }
  }

  async setConfig(config: UserApiKeyConfig | null): Promise<void> {
    if (config && config.apiKey) {
      this.entry.setPassword(JSON.stringify(config));
      return;
    }
    this.entry.deletePassword();
  }
}
