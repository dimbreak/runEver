import { app } from 'electron';
import type { Entry as KeyringEntry } from '@napi-rs/keyring';
import {
  RunEverConfigSchema,
  type RunEverConfig,
} from '../schema/runeverConfig';

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

interface UserApiKeyStoreOptions {
  service?: string;
  account?: string;
}

export class RuneverConfigStore {
  private entry: KeyringEntry;
  private cachedConfig: RunEverConfig | undefined;

  static instance: RuneverConfigStore | null = null;
  static getInstance() {
    if (RuneverConfigStore.instance === null) {
      RuneverConfigStore.instance = new RuneverConfigStore();
    }
    return RuneverConfigStore.instance;
  }

  constructor(options: UserApiKeyStoreOptions = {}) {
    const appName = app.getName();
    const service = options.service ?? `${appName}.user-api-key`;
    const account = options.account ?? 'llm-config';
    this.entry = new Entry(service, account);
  }

  private async getAllConfig() {
    const raw = await this.entry.getPassword();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      const result = RunEverConfigSchema.safeParse(parsed);
      if (result.success) {
        this.cachedConfig = result.data;
      }
    } catch (error) {
      console.warn('Failed to parse stored config', error);
      return null;
    }
  }

  async getConfig<K extends keyof RunEverConfig>(
    key: K,
  ): Promise<RunEverConfig[K] | null> {
    if (this.cachedConfig === undefined) {
      await this.getAllConfig();
    }
    return this.cachedConfig?.[key] ?? null;
  }

  async setConfig<K extends keyof RunEverConfig>(
    key: K,
    config: RunEverConfig[K],
  ): Promise<void> {
    if (this.cachedConfig === undefined) {
      await this.getAllConfig();
    }
    if (!this.cachedConfig) {
      this.cachedConfig = { arguments: [] };
    }
    this.cachedConfig[key] = config;
    this.entry.setPassword(JSON.stringify(this.cachedConfig));
  }
}
