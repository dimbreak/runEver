import * as React from 'react';
import { useAuth } from '@apitrust/react';
import { useNavigate } from 'react-router-dom';
import { ToMainIpc } from '../../../contracts/toMain';
import {
  OWN_KEY_REMEMBER_KEY,
  OWN_KEY_SESSION_KEY,
} from '../../constants/auth';
import { useTabStore } from '../../state/tabStore';

export const AgentLogoutButton: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { closeAllTabs, clearTabs } = useTabStore();

  const handleLogout = React.useCallback(async () => {
    try {
      await closeAllTabs();
    } catch (error) {
      console.error('Failed to close tabs before logout', error);
    } finally {
      clearTabs();
      logout();
      ToMainIpc.setApiTrustToken.invoke({ token: null }).catch(() => null);
      ToMainIpc.clearUserApiKey.invoke().catch(() => null);
      ToMainIpc.setAuthMode.invoke({ mode: null }).catch(() => null);
      window.localStorage.removeItem(OWN_KEY_REMEMBER_KEY);
      window.sessionStorage.removeItem(OWN_KEY_SESSION_KEY);
      navigate('/auth', { replace: true });
    }
  }, [clearTabs, closeAllTabs, logout, navigate]);

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm transition hover:bg-rose-100"
    >
      Logout
    </button>
  );
};
