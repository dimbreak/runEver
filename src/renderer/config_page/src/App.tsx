import { useCallback, useEffect, useState } from 'react';
import { AuthProvider } from '@apitrust/react';
import { Box, Key } from 'lucide-react';
import clsx from 'clsx';
import Argument from './Argument';
import ApiKey from './ApiKey';

type TabId = 'apikey' | 'arguments';

const DEFAULT_TAB: TabId = 'apikey';

const isTabId = (value: string | null | undefined): value is TabId =>
  value === 'apikey' || value === 'arguments';

const getTabFromLocation = (): TabId => {
  if (typeof window === 'undefined') {
    return DEFAULT_TAB;
  }

  const pathTab = window.location.pathname.replace(/^\/+/, '').split('/')[0];
  if (isTabId(pathTab)) {
    return pathTab;
  }

  const hashTab = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  if (isTabId(hashTab)) {
    return hashTab;
  }

  const queryTab = new URLSearchParams(window.location.search).get('tab');
  if (isTabId(queryTab)) {
    return queryTab;
  }

  return DEFAULT_TAB;
};

const getTabHref = (tab: TabId) => `/${tab}`;

function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  const tabs = [
    { id: 'apikey', label: 'API Key', icon: Key },
    { id: 'arguments', label: 'Arguments', icon: Box },
  ] as const;

  return (
    <div className="z-10 flex h-full w-48 shrink-0 flex-col border-l border-slate-200 bg-white py-4 shadow-sm">
      <div className="flex flex-col gap-2 px-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <a
              key={tab.id}
              href={getTabHref(tab.id)}
              onClick={(event) => {
                event.preventDefault();
                onTabChange(tab.id);
              }}
              className={clsx(
                'group relative flex items-center gap-3 rounded-xl p-3 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
              )}
              title={tab.label}
            >
              <tab.icon className="h-5 w-5 shrink-0" />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute top-1/2 -right-3 h-8 w-1 -translate-y-1/2 rounded-l-full bg-blue-600" />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(() => getTabFromLocation());
  const [env, setEnv] = useState<any>(null);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    window.history.pushState({}, '', getTabHref(tab));
  }, []);

  useEffect(() => {
    async function load() {
      if ((window as any).electron?.apiTrust) {
        try {
          const loadedEnv = await (window as any).electron.apiTrust.getEnv();
          setEnv(loadedEnv);
        } catch (e) {
          console.error('Failed to load apitrust env:', e);
          setEnv({});
        }
      } else {
        setEnv({});
      }
    }
    load();
  }, []);

  useEffect(() => {
    const handleNavigation = () => {
      setActiveTab(getTabFromLocation());
    };

    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('hashchange', handleNavigation);

    return () => {
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('hashchange', handleNavigation);
    };
  }, []);

  if (!env) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 font-sans text-slate-600">
        Loading...
      </div>
    );
  }

  return (
    <AuthProvider
      config={{
        clientId: env.clientId || 'dummy',
        apiUrl: env.apiUrl || 'http://localhost',
        secret: env.clientSecret || 'dummy',
        redirectUri: env.redirectUri || 'http://localhost/callback',
        authUrl: `${env.authBaseUrl || 'http://localhost'}/oauth/authorize`,
        tokenUrl: 'http://localhost:8081/api/oauth/token',
      }}
    >
      <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900">
        <div className="flex-1 overflow-hidden p-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            {activeTab === 'apikey' && <ApiKey />}
            {activeTab === 'arguments' && <Argument />}
          </div>
        </div>

        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </AuthProvider>
  );
}
