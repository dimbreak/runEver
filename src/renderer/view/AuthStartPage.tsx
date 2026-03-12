import { useAuth } from '@apitrust/react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ToMainIpc } from '../../contracts/toMain';
import type { Env } from '../../schema/env.schema';
import { OWN_KEY_REMEMBER_KEY, OWN_KEY_SESSION_KEY } from '../constants/auth';

type CodexAuthMode = 'apiKey' | 'login';

export const AuthStartPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [ownKeyError, setOwnKeyError] = useState<string | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [provider, setProvider] = useState<Env['provider']>('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState<string | undefined>(undefined);
  const [rememberOwnKey, setRememberOwnKey] = useState(false);
  const [codexAuthMode, setCodexAuthMode] = useState<CodexAuthMode>('apiKey');

  const isCodex = provider === 'codex';
  const usesCodexLogin = isCodex && codexAuthMode === 'login';

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const authState = await ToMainIpc.getUserAuthState.invoke();
        if (cancelled) return;
        const remembered =
          window.localStorage.getItem(OWN_KEY_REMEMBER_KEY) === 'true';
        setRememberOwnKey(remembered);
        if (authState.provider) {
          setProvider(authState.provider);
        }
        if (
          remembered &&
          authState.authMode === 'apikey' &&
          authState.hasApiKey
        ) {
          navigate('/', { replace: true });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to read auth state', err);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const startLogin = async () => {
    try {
      setError(null);
      window.localStorage.removeItem(OWN_KEY_REMEMBER_KEY);
      window.sessionStorage.removeItem(OWN_KEY_SESSION_KEY);
      await ToMainIpc.setAuthMode.invoke({ mode: 'apitrust' });
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  const handleUseOwnKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOwnKeyError(null);
    const trimmedKey = apiKey.trim();
    const requiresApiKey = provider !== 'codex' || codexAuthMode === 'apiKey';
    if (requiresApiKey && !trimmedKey) {
      setOwnKeyError('API key is required.');
      return;
    }
    setIsSavingKey(true);
    try {
      await ToMainIpc.setUserApiKey.invoke({
        provider,
        apiKey: requiresApiKey ? trimmedKey : '',
        baseUrl: usesCodexLogin ? undefined : apiUrl,
        authMode: provider === 'codex' ? codexAuthMode : undefined,
      });
      await ToMainIpc.setAuthMode.invoke({ mode: 'apikey' });
      window.sessionStorage.setItem(OWN_KEY_SESSION_KEY, 'true');
      if (rememberOwnKey) {
        window.localStorage.setItem(OWN_KEY_REMEMBER_KEY, 'true');
      } else {
        window.localStorage.removeItem(OWN_KEY_REMEMBER_KEY);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setOwnKeyError(
        err instanceof Error ? err.message : 'Failed to save provider config.',
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Choose a sign-in method
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Continue with ApiTrust OAuth or configure your own provider. Codex can
          use either an API key or your local ChatGPT login.
        </p>
        <div className="mt-6 space-y-6">
          <section>
            <h2 className="text-base font-semibold text-slate-900">
              Sign in with ApiTrust
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will open an in-app window to complete OAuth sign-in.
            </p>
            {error ? (
              <p className="mt-3 text-sm text-rose-600">{error}</p>
            ) : null}
            <button
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={startLogin}
              type="button"
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Sign in'}
            </button>
          </section>
          <div className="border-t border-slate-200" />
          <section>
            <h2 className="text-base font-semibold text-slate-900">
              Use my own provider
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Select a provider and continue with either your own API key or a
              provider-specific login.
            </p>
            <form className="mt-4 space-y-4" onSubmit={handleUseOwnKey}>
              <label className="block text-sm font-medium text-slate-700">
                Provider
                <select
                  className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as Env['provider'])
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="codex">Codex</option>
                  <option value="google">Google</option>
                  <option value="zai">ZAi</option>
                </select>
              </label>

              {isCodex ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-800">
                    Codex authentication
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="codex-auth-mode"
                        checked={codexAuthMode === 'apiKey'}
                        onChange={() => setCodexAuthMode('apiKey')}
                      />
                      Use API key
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="codex-auth-mode"
                        checked={codexAuthMode === 'login'}
                        onChange={() => setCodexAuthMode('login')}
                      />
                      Use local Codex login
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Login mode uses the local `codex` CLI credentials already
                    signed in on this machine.
                  </p>
                </div>
              ) : null}

              <label className="block text-sm font-medium text-slate-700">
                API key
                <input
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  disabled={usesCodexLogin}
                  placeholder={
                    usesCodexLogin
                      ? 'Not required for Codex login mode'
                      : 'Paste your API key'
                  }
                />
              </label>

              {usesCodexLogin ? (
                <p className="text-xs text-slate-500">
                  If you have not signed in yet, run `codex` or `codex --login`
                  once in your terminal first.
                </p>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={apiUrl !== undefined}
                  onChange={(event) =>
                    setApiUrl(event.target.checked ? '' : undefined)
                  }
                />
                Use custom API url
              </label>
              <label
                className={`block text-sm font-medium text-slate-700 ${apiUrl !== undefined ? '' : 'opacity-50'}`}
              >
                Custom API url
                <input
                  className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none"
                  autoComplete="off"
                  value={apiUrl ?? ''}
                  disabled={apiUrl === undefined || usesCodexLogin}
                  onChange={(event) => setApiUrl(event.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberOwnKey}
                  onChange={(event) => setRememberOwnKey(event.target.checked)}
                />
                Remember this choice and skip sign-in next time
              </label>
              {ownKeyError ? (
                <p className="text-sm text-rose-600">{ownKeyError}</p>
              ) : null}
              <button
                className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={isSavingKey}
              >
                {isSavingKey ? 'Saving...' : 'Save & continue'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
