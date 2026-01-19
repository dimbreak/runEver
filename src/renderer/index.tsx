import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from '@apitrust/react';
import App from './App';
import { loadApiTrustEnv, loadApiTrustToken } from '../schema/env.renderer';
import type { ApiTrustEnv } from '../schema/env.schema';



const Root = () => {
  const [env, setEnv] = useState<ApiTrustEnv | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [loadedEnv, storedToken] = await Promise.all([
          loadApiTrustEnv(),
          loadApiTrustToken(),
        ]);
        if (storedToken) {
          sessionStorage.setItem('apitrust_token', storedToken);
        }
        if (!cancelled) {
          setEnv(loadedEnv);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load env.',
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-sm text-rose-600">
        {error}
      </div>
    );
  }

  if (!env) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading...
      </div>
    );
  }
  return (
    <AuthProvider
      config={{
        clientId: env.clientId,
        apiUrl: env.apiUrl,
        secret: env.clientSecret,
        redirectUri: env.redirectUri,
        authUrl: `${env.authBaseUrl}/oauth/authorize`,
        tokenUrl: "http://localhost:8081/api/oauth/token",
      }}
    >
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  );
};

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<Root />);
