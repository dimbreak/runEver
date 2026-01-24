import * as React from 'react';
import { useAuth } from '@apitrust/react';
import { ToMainIpc } from '../../../contracts/toMain';
import { useTabStore } from '../../state/tabStore';

export const AgentLogoutButton: React.FC = () => {
  const { logout } = useAuth();
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
    }
  }, [clearTabs, closeAllTabs, logout]);

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
