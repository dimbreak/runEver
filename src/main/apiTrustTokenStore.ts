import { app } from 'electron';
import type { Entry as KeyringEntry } from '@napi-rs/keyring';

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

interface ApiTrustTokenStoreOptions {
  service?: string;
  account?: string;
}

export class ApiTrustTokenStore {
  private entry: KeyringEntry;

  constructor(options: ApiTrustTokenStoreOptions = {}) {
    const appName = app.getName();
    const service = options.service ?? `${appName}.apitrust`;
    const account = options.account ?? 'access-token';
    this.entry = new Entry(service, account);
  }

  async getToken(): Promise<string | null> {
    return this.entry.getPassword();
  }

  async setToken(token: string | null): Promise<void> {
    if (token && token.length > 0) {
      this.entry.setPassword(token);
      return;
    }
    this.entry.deletePassword();
  }
}
