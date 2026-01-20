import { Entry } from '@napi-rs/keyring';
import { app } from 'electron';

type ApiTrustTokenStoreOptions = {
  service?: string;
  account?: string;
};

export class ApiTrustTokenStore {
  private entry: Entry;

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
