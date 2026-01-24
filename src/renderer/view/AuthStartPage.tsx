import { useAuth } from '@apitrust/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const AuthStartPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const startLogin = async () => {
    try {
      await login();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Sign in with ApiTrust
        </h1>
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
      </div>
    </div>
  );
};
