import { useState, useEffect } from 'react';
import { useAuth } from '@apitrust/react';

export default function ApiKeyPage() {
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState<string | undefined>(undefined);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { isAuthenticated, isLoading, login } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  const startLogin = async () => {
    try {
      setAuthError(null);
      window.localStorage.removeItem('runever_own_key_remember');
      window.sessionStorage.removeItem('runever_own_key_session');
      if ((window as any).electron?.ipcRenderer) {
        await (window as any).electron.ipcRenderer.invoke('set-auth-mode', {
          mode: 'apitrust',
        });
      }
      await login();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  useEffect(() => {
    async function load() {
      if (window.runever) {
        try {
          const res = await window.runever.getConfig('apiKey');
          console.log('API Key config:', res);
          if (res && 'config' in res && res.config) {
            const { config } = res;
            if (config.provider) setProvider(config.provider);
            if (config.apiKey) setApiKey(config.apiKey);
            if (config.apiUrl !== undefined) {
              setApiUrl(config.apiUrl);
              setUseCustomUrl(true);
            }
          }
        } catch (e) {
          console.error('Error loading config:', e);
        }
      }
      setIsLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const saveConfig = async () => {
      if (window.runever) {
        console.log('Saving API Key config:', { provider, apiKey, apiUrl });
        await window.runever.setConfig('apiKey', {
          provider,
          apiKey,
          baseUrl: useCustomUrl ? apiUrl : undefined,
        });
      }
    };
    const timer = setTimeout(() => {
      saveConfig();
    }, 500);
    return () => clearTimeout(timer);
  }, [provider, apiKey, apiUrl, useCustomUrl, isLoaded]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="mb-6">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          API Key Configuration
        </h1>
        <p className="text-sm text-slate-500">
          Select a provider and enter your API key to continue.
        </p>
      </header>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-xl space-y-6">
          <section>
            <h2 className="text-base font-semibold text-slate-900">
              Sign in with ApiTrust
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will open an in-app window to complete OAuth sign-in.
            </p>
            {authError ? (
              <p className="mt-3 text-sm text-rose-600">{authError}</p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={startLogin}
              type="button"
            >
              {/* eslint-disable-next-line no-nested-ternary */}
              {isLoading
                ? 'Loading...'
                : isAuthenticated
                  ? 'Signed In'
                  : 'Sign in'}
            </button>
          </section>

          <div className="border-t border-slate-200" />

          <section>
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Use my own key
            </h2>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Provider
                <select
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="zai">ZAi</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                API key
                <input
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Paste your API key"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={useCustomUrl}
                  onChange={(event) => setUseCustomUrl(event.target.checked)}
                />
                Use custom API url
              </label>
              <label
                className={`block text-sm font-medium text-slate-700 ${useCustomUrl ? '' : 'opacity-50'}`}
              >
                Custom API url
                <input
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none"
                  autoComplete="off"
                  value={apiUrl ?? ''}
                  disabled={!useCustomUrl}
                  onChange={(event) => setApiUrl(event.target.value)}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
