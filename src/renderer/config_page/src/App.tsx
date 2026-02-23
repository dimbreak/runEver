import { useState, useEffect } from 'react';
import { AuthProvider } from '@apitrust/react';
import { Box, Key } from 'lucide-react';
import clsx from 'clsx';
import Argument from './Argument';
import ApiKey from './ApiKey';

type TabId = 'apikey' | 'arguments';

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
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('apikey');
  const [env, setEnv] = useState<any>(null);

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
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col">
            {activeTab === 'apikey' && <ApiKey />}
            {activeTab === 'arguments' && <Argument />}
          </div>
        </div>

        {/* Right Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </AuthProvider>
  );
}
