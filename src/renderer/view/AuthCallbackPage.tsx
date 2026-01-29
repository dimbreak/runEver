import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@apitrust/react';
import { ToMainIpc } from '../../contracts/toMain';
import {
  OWN_KEY_REMEMBER_KEY,
  OWN_KEY_SESSION_KEY,
} from '../constants/auth';

const getCallbackParams = () => {
  if (window.location.search) {
    return new URLSearchParams(window.location.search);
  }

  const hash = window.location.hash;
  const hashQueryIndex = hash.indexOf('?');
  if (hashQueryIndex === -1) {
    return new URLSearchParams();
  }

  const search = hash.slice(hashQueryIndex + 1);
  const hashPath = hash.slice(0, hashQueryIndex);
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?${search}${hashPath}`,
  );

  return new URLSearchParams(search);
};

export const AuthCallbackPage = () => {
  const [status, setStatus] = useState('Waiting for callback...');
  const [error, setError] = useState<string | null>(null);
  const [callbackComplete, setCallbackComplete] = useState(false);
  const sentTokenRef = useRef(false);
  const navigate = useNavigate();
  const { handleCallback, token, isLoading } = useAuth();
  const params = useMemo(() => getCallbackParams(), []);
  const code = params.get('code');
  const callbackError = params.get('error');

  useEffect(() => {
    if (callbackError) {
      setStatus(`Auth error: ${callbackError}`);
      return;
    }

    if (!code) {
      setStatus('Missing authorization code.');
      return;
    }

    setStatus('Exchanging token...');
    handleCallback()
      .then(() => {
        setCallbackComplete(true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Token exchange failed.');
      });
  }, [callbackError, code, handleCallback]);

  useEffect(() => {
    if (sentTokenRef.current || !callbackComplete || !token || isLoading) {
      return;
    }
    sentTokenRef.current = true;
    ToMainIpc.setApiTrustToken.invoke({ token }).catch(() => null);
    ToMainIpc.setAuthMode.invoke({ mode: 'apitrust' }).catch(() => null);
    window.localStorage.removeItem(OWN_KEY_REMEMBER_KEY);
    window.sessionStorage.removeItem(OWN_KEY_SESSION_KEY);
    setStatus('Signed in. Redirecting...');
    navigate('/', { replace: true });
  }, [callbackComplete, isLoading, navigate, token]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Finishing sign-in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {error ? `Auth error: ${error}` : status}
        </p>
        {code ? (
          <p className="mt-4 break-all text-xs text-slate-500">
            code: {code}
          </p>
        ) : null}
      </div>
    </div>
  );
};
