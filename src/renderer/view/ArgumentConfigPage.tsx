import { useState, useMemo } from 'react';

// You might want to move these types to a shared types file later
export interface ArgumentValue {
  value: string;
  isSecret: boolean;
  riskLevel: string; // 'low', 'medium', 'high', etc.
  domain?: string;
}

type ArgumentRecord = Record<string, ArgumentValue>;

const MOCK_DATA: ArgumentRecord = {
  'api.key': { value: 'sk_test_12345', isSecret: true, riskLevel: 'high', domain: 'gateway' },
  'app.theme': { value: 'dark', isSecret: false, riskLevel: 'low' }, // global
  'feature.flag.newUi': { value: 'true', isSecret: false, riskLevel: 'medium', domain: 'gateway' },
  'payment.provider': { value: 'stripe', isSecret: false, riskLevel: 'high', domain: 'pos' },
};

export const ArgumentConfigPage = () => {
  const [data, setData] = useState<ArgumentRecord>(MOCK_DATA);
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>(''); // '' means all

  // Derived state: filtered keys
  const filteredKeys = useMemo(() => {
    return Object.keys(data).filter((key) => {
      const item = data[key];
      const matchesSearch = key.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesDomain = true;
      if (domainFilter !== '') {
        if (domainFilter === 'GLOBAL_ONLY') {
          matchesDomain = item.domain === undefined;
        } else {
          matchesDomain = item.domain === domainFilter;
        }
      }

      return matchesSearch && matchesDomain;
    });
  }, [data, searchQuery, domainFilter]);

  // Unique domains for the filter dropdown
  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    Object.values(data).forEach(item => {
      if (item.domain) domains.add(item.domain);
    });
    return Array.from(domains).sort();
  }, [data]);

  const handleUpdate = (key: string, field: keyof ArgumentValue, newValue: any) => {
    setData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: newValue
      }
    }));
  };

  const handleDelete = (key: string) => {
    const next = { ...data };
    delete next[key];
    setData(next);
  };

  const handleAdd = () => {
    const newKey = `new.arg.${Date.now()}`;
    const defaultDomain = domainFilter && domainFilter !== 'GLOBAL_ONLY' ? domainFilter : undefined;

    setData(prev => ({
      ...prev,
      [newKey]: {
        value: '',
        isSecret: false,
        riskLevel: 'low',
        domain: defaultDomain
      }
    }));
  };

  const handleKeyChange = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    if (data[newKey]) {
      // eslint-disable-next-line no-alert
      window.alert('Key already exists!');
      return;
    }

    const next = { ...data };
    const value = next[oldKey];
    delete next[oldKey];
    next[newKey] = value;
    setData(next);
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 p-6 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Argument Configuration</h2>
          <p className="text-slate-500 text-sm mt-1">
            Manage application runtime arguments, secrets, and risk levels.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            className="px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white shadow-sm min-w-[240px] text-sm"
            placeholder="Search keys..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          <select
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white shadow-sm text-sm cursor-pointer"
          >
            <option value="">All Domains</option>
            <option value="GLOBAL_ONLY">Global Only</option>
            {availableDomains.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <button
            type="button"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg shadow-sm text-sm font-medium transition-colors"
            onClick={handleAdd}
          >
            + Add Configuration
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs">Key</th>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs">Value</th>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs">Domain</th>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs">Risk Level</th>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs text-center">Secret</th>
                <th className="px-5 py-3 text-slate-500 font-medium border-b border-slate-200 uppercase tracking-wider text-xs text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                    No configuration arguments found.
                  </td>
                </tr>
              ) : filteredKeys.map(key => {
                const item = data[key];
                return (
                  <tr key={key} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-5 py-3 w-1/4 align-top">
                      <input
                        type="text"
                        defaultValue={key}
                        onBlur={(e) => handleKeyChange(key, e.target.value)}
                        className="w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 bg-transparent font-medium text-slate-800 transition-all placeholder-slate-400"
                        aria-label={`Key name for ${key}`}
                      />
                    </td>
                    <td className="px-5 py-3 w-1/4 align-top">
                      <input
                        type={item.isSecret ? "password" : "text"}
                        value={item.value}
                        onChange={(e) => handleUpdate(key, 'value', e.target.value)}
                        placeholder="Value"
                        className={`w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 bg-transparent text-slate-600 transition-all ${item.isSecret ? 'font-mono' : ''}`}
                        aria-label={`Value for ${key}`}
                      />
                    </td>
                    <td className="px-5 py-3 w-1/6 align-top">
                      <input
                        type="text"
                        placeholder="Global"
                        value={item.domain || ''}
                        onChange={(e) => handleUpdate(key, 'domain', e.target.value || undefined)}
                        className={`w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 bg-transparent transition-all ${item.domain ? 'text-slate-800' : 'text-slate-400 italic'}`}
                        aria-label={`Domain for ${key}`}
                      />
                    </td>
                    <td className="px-5 py-3 w-1/6 align-top">
                      <select
                        value={item.riskLevel}
                        onChange={(e) => handleUpdate(key, 'riskLevel', e.target.value)}
                        className={`w-full px-2 py-1 rounded border border-transparent hover:border-slate-300 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 bg-transparent transition-all cursor-pointer ${
                          item.riskLevel === 'high' || item.riskLevel === 'critical' ? 'text-red-600 font-medium' : 'text-slate-600'
                        }`}
                        aria-label={`Risk level for ${key}`}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </td>
                    <td className="px-5 py-3 w-[10%] align-top text-center pt-4">
                      <input
                        type="checkbox"
                        checked={item.isSecret}
                        onChange={(e) => handleUpdate(key, 'isSecret', e.target.checked)}
                        className="w-4 h-4 text-slate-600 rounded border-gray-300 focus:ring-slate-500 cursor-pointer"
                        aria-label={`Is secret for ${key}`}
                      />
                    </td>
                    <td className="px-5 py-3 text-right align-top pt-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(key)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete configuration"
                        aria-label="Delete configuration"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
