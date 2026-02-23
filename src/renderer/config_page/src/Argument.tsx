import { useState, useMemo, useEffect } from 'react';
import { DataGrid, Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { Plus, Search, Filter } from 'lucide-react';

// --- Types ---

interface ArgumentValue {
  value: string;
  isSecret: boolean;
  riskLevel: string;
  domain?: string;
}

declare global {
  interface Window {
    runever?: {
      getConfig: (key: string) => Promise<{ config: any } | { error: string }>;
      setConfig: (key: string, config: any) => Promise<{ error?: string }>;
    };
  }
}

interface Row {
  key: string;
  value: string;
  isSecret: boolean;
  riskLevel: string;
  domain: string;
}

// --- Editors ---

function TextEditor({
  row,
  column,
  onRowChange,
  onClose,
}: RenderEditCellProps<Row>) {
  return (
    <input
      className="h-full w-full bg-white px-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      ref={(input) => input?.focus()}
      value={row[column.key as keyof Row] as string}
      onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value })}
      onBlur={() => onClose(true)}
    />
  );
}
//
// function BooleanEditor({
//   row,
//   column,
//   onRowChange,
//   onClose,
// }: RenderEditCellProps<Row>) {
//   return (
//     <div className="flex h-full items-center justify-center bg-white">
//       <input
//         type="checkbox"
//         className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
//         checked={!!row[column.key as keyof Row]}
//         onChange={(e) => {
//           onRowChange({ ...row, [column.key]: e.target.checked });
//           onClose(true);
//         }}
//         onBlur={() => onClose(true)}
//         // eslint-disable-next-line jsx-a11y/no-autofocus
//         autoFocus
//       />
//     </div>
//   );
// }

// function RiskEditor({ row, onRowChange, onClose }: RenderEditCellProps<Row>) {
//   return (
//     <select
//       className="h-full w-full bg-white px-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
//       value={row.riskLevel}
//       onChange={(e) => {
//         console.log(e.target.value);
//         onRowChange({ ...row, riskLevel: e.target.value });
//         onClose(true);
//       }}
//       onBlur={() => onClose(true)}
//       // eslint-disable-next-line jsx-a11y/no-autofocus
//       autoFocus
//     >
//       <option value="low">Low</option>
//       <option value="medium">Medium</option>
//       <option value="high">High</option>
//     </select>
//   );
// }

// --- Utils ---

function getRowsFromConfig(config: Record<string, ArgumentValue>): Row[] {
  return Object.entries(config).map(([key, val]) => ({
    key,
    value: val.value,
    isSecret: val.isSecret,
    riskLevel: val.riskLevel,
    domain: val.domain || '',
  }));
}

// --- Components ---

function ArgumentsPage() {
  const [data, setData] = useState<Record<string, ArgumentValue>>({});
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (window.runever) {
        try {
          const res = await window.runever.getConfig('arguments');
          console.log('Loading args...', res);
          if ('config' in res && Array.isArray(res.config)) {
            const loadedData: Record<string, ArgumentValue> = {};
            res.config.forEach((arg: any) => {
              loadedData[arg.name] = {
                value: arg.value,
                isSecret: arg.isSecret ?? false,
                riskLevel: arg.risk ?? 'low',
                domain: arg.domain,
              };
            });
            setData(loadedData);
          } else if ('error' in res) {
            console.error('Failed to load args:', res.error);
          }
        } catch (e) {
          console.error('Error loading config:', e);
        }
      }
      setIsLoaded(true);
    }
    load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const saveConfig = async () => {
      const argsArray = Object.entries(data).map(([name, val]) => ({
        name,
        value: val.value,
        isSecret: val.isSecret,
        risk: val.riskLevel,
        domain: val.domain,
      }));
      if (window.runever) {
        await window.runever.setConfig('arguments', argsArray);
      }
    };

    const timer = setTimeout(() => {
      saveConfig();
    }, 500);
    return () => clearTimeout(timer);
  }, [data, isLoaded]);

  const rows = useMemo(() => getRowsFromConfig(data), [data]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch = r.key.toLowerCase().includes(search.toLowerCase());
      const matchesDomain = domainFilter ? r.domain === domainFilter : true;
      return matchesSearch && matchesDomain;
    });
  }, [rows, search, domainFilter]);

  const onRowsChange = (
    newRows: readonly Row[],
    { indexes }: { indexes: number[] },
  ) => {
    indexes.forEach((index) => {
      const newRow = newRows[index];
      const oldRow = filteredRows[index];

      setData((prev) => {
        const next = { ...prev };
        console.log('Updating row:', oldRow, newRow);
        if (oldRow.key !== newRow.key) {
          if (next[oldRow.key]) {
            delete next[oldRow.key];
          }
        }
        next[newRow.key] = {
          value: newRow.value,
          isSecret: newRow.isSecret,
          riskLevel: newRow.riskLevel,
          domain: newRow.domain || undefined,
        };
        return next;
      });
    });
  };

  const columns: Column<Row>[] = [
    { key: 'key', name: 'Key', renderEditCell: TextEditor },
    { key: 'value', name: 'Value', renderEditCell: TextEditor },
    {
      key: 'isSecret',
      name: 'Is Secret',
      renderCell: (props) => (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
        <div
          className="flex h-full items-center justify-center"
          onClick={() => {
            const newRows = rows.slice();
            newRows[props.rowIdx].isSecret = !newRows[props.rowIdx].isSecret;
            onRowsChange(newRows, {
              indexes: [props.rowIdx],
            });
          }}
        >
          <input
            type="checkbox"
            checked={props.row.isSecret}
            className="pointer-events-none h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
      ),
    },
    {
      key: 'riskLevel',
      name: 'Risk Level',
      editable: true,
      renderCell: (props) => {
        return (
          <select
            className="h-full w-full bg-white px-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
            value={props.row.riskLevel}
            onChange={(e) => {
              const newRows = rows.slice();
              newRows[props.rowIdx].riskLevel = e.target.value;
              onRowsChange(newRows, {
                indexes: [props.rowIdx],
              });
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        );
      },
    },
    { key: 'domain', name: 'Domain', renderEditCell: TextEditor },
  ];

  const handleAdd = () => {
    const newKey = `new_arg_${Date.now()}`;
    setData((prev) => ({
      ...prev,
      [newKey]: {
        value: '',
        isSecret: false,
        riskLevel: 'low',
        domain: domainFilter || undefined,
      },
    }));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="mb-6">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">
          Argument Configuration
        </h1>
        <p className="text-sm text-slate-500">
          Manage application arguments and secrets.
        </p>
      </header>

      <div className="mb-4 flex gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search arguments..."
            className="w-full rounded-md border border-slate-200 bg-white py-2 pr-4 pl-9 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative max-w-sm flex-1">
          <Filter className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Filter by Domain..."
            className="w-full rounded-md border border-slate-200 bg-white py-2 pr-4 pl-9 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Add Entry
        </button>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <DataGrid
          columns={columns}
          rows={filteredRows}
          className="rdg-light h-full"
          onRowsChange={onRowsChange}
          rowClass={() => 'text-sm'}
        />
      </div>
    </div>
  );
}

export default ArgumentsPage;
