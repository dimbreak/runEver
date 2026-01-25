import { useCallback, useEffect, useMemo, useRef } from 'react';
import './App.css';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '@apitrust/react';
import { AgentPanel } from './components/AgentPanel';
import { TabBar } from './components/TabBar';
import { useLayoutStore } from './state/layoutStore';
import { HomeScreen } from './view/HomeScreen';
import { AuthStartPage } from './view/AuthStartPage';
import { AuthCallbackPage } from './view/AuthCallbackPage';
import { ToRendererIpc } from '../contracts/toRenderer';
import { ToMainIpc } from '../contracts/toMain';
import { webviewService } from './services/webviewService';

webviewService.registerTabHandler();

const AppShell = () => {
  const { isSidebarOpen, sidebarWidth, collapsedWidth, tabbarHeight } =
    useLayoutStore();
  const activeSidebarWidth = isSidebarOpen ? sidebarWidth : collapsedWidth;

  const leftWidthStyle = useMemo(
    () => ({ width: `calc(100% - ${activeSidebarWidth}px)` }),
    [activeSidebarWidth],
  );

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
          <TabBar />
        </div>
        <div className="flex-1 overflow-hidden">
          <HomeScreen />
        </div>
      </div>
      <div
        className="h-full border-l border-slate-200 bg-white shadow-inner"
        style={{ width: `${activeSidebarWidth}px` }}
      >
        <AgentPanel />
      </div>
    </div>
  );
};

const AuthGate = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/auth', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return <AppShell />;
};

const AuthDeepLinkListener = () => {
  const navigate = useNavigate();
  const lastHandledRef = useRef<string | null>(null);

  const normalizePath = (path: string) => {
    if (!path) {
      return '/';
    }
    const trimmed =
      path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  };

  const resolveDeepLinkPath = useCallback((url: URL) => {
    const hostPath = normalizePath(`/${url.host}${url.pathname}`);
    const pathOnly = normalizePath(url.pathname || '/');

    if (hostPath === '/auth/callback' || pathOnly === '/auth/callback') {
      return '/auth/callback';
    }
    if (hostPath === '/auth' || pathOnly === '/auth') {
      return '/auth';
    }
    return hostPath;
  }, []);

  const handleDeepLink = useCallback(
    (urlString: string) => {
      if (lastHandledRef.current === urlString) {
        return;
      }
      lastHandledRef.current = urlString;
      try {
        const url = new URL(urlString);
        const path = resolveDeepLinkPath(url);
        const search = url.searchParams.toString();

        if (search) {
          window.history.replaceState(
            {},
            '',
            `${window.location.pathname}?${search}#${path}`,
          );
        } else {
          window.history.replaceState(
            {},
            '',
            `${window.location.pathname}#${path}`,
          );
        }

        navigate(path, { replace: true });
      } catch (error) {
        console.error('Invalid deep link url', error);
      }
    },
    [navigate, resolveDeepLinkPath],
  );

  useEffect(() => {
    ToRendererIpc.authDeepLink.on((_event, payload) => {
      handleDeepLink(payload.url);
      ToMainIpc.clearPendingAuthDeepLink.invoke().catch(() => null);
    });

    let cancelled = false;
    const loadPending = async () => {
      try {
        const { url } = await ToMainIpc.getPendingAuthDeepLink.invoke();
        if (!cancelled && url) {
          handleDeepLink(url);
        }
      } catch (error) {
        console.error('Failed to read pending deep link', error);
      }
    };
    loadPending();

    return () => {
      cancelled = true;
    };
  }, [handleDeepLink]);

  return null;
};

export default function App() {
  return (
    <>
      <AuthDeepLinkListener />
      <Routes>
        <Route path="/auth" element={<AuthStartPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={<AuthGate />} />
      </Routes>
    </>
  );
}
