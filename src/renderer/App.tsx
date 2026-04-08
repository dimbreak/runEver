import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import { AgentPanel } from './components/AgentPanel';
import { TabBar } from './components/TabBar';
import { useLayoutStore } from './state/layoutStore';
import { webviewService } from './services/webviewService';
import { HomeScreen } from './view/HomeScreen';
import { ToMainIpc } from '../contracts/toMain';

webviewService.registerTabHandler();

const AppShell = () => {
  const { isSidebarOpen, sidebarWidth, collapsedWidth, tabbarHeight } =
    useLayoutStore();
  const [hasApiConfig, setHasApiConfig] = useState<boolean | null>(null);

  const refreshApiConfigState = useCallback(async () => {
    try {
      const state = await ToMainIpc.getUserAuthState.invoke();
      const configured = Boolean(state.hasApiKey);
      setHasApiConfig(configured);
      return configured;
    } catch (error) {
      console.error('Failed to load user auth state', error);
      setHasApiConfig(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const configured = await refreshApiConfigState();
      if (cancelled) {
        return;
      }
      setHasApiConfig(configured);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshApiConfigState]);

  const activeSidebarWidth =
    hasApiConfig && isSidebarOpen ? sidebarWidth : collapsedWidth;

  const leftWidthStyle = useMemo(
    () => ({ width: `calc(100% - ${activeSidebarWidth}px)` }),
    [activeSidebarWidth],
  );

  const handleAgentButtonClick = useCallback(async () => {
    const configured = await refreshApiConfigState();
    if (!configured) {
      return false;
    }
    return true;
  }, [refreshApiConfigState]);

  if (hasApiConfig === null) {
    return null;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50">
      <div
        className="flex flex-col"
        style={{ width: `${leftWidthStyle.width}` }}
      >
        <div
          className="flex border-b border-slate-200 bg-white"
          style={{ height: `${tabbarHeight}px` }}
        >
          <TabBar
            hasApiConfig={hasApiConfig}
            onAgentButtonClick={handleAgentButtonClick}
          />
        </div>
        <div className="flex-1 overflow-hidden">
          <HomeScreen />
        </div>
      </div>
      {hasApiConfig ? (
        <div
          className="h-full border-l border-slate-200 bg-white shadow-inner"
          style={{ width: `${activeSidebarWidth}px` }}
        >
          <AgentPanel />
        </div>
      ) : null}
    </div>
  );
};

export default function App() {
  return <AppShell />;
}
