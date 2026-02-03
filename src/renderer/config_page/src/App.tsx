import { useState, useMemo } from 'react';
import { DataGrid, Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { Plus, Search, Filter } from 'lucide-react';

interface ArgumentValue {
  value: string;
  isSecret: boolean;
  riskLevel: string;
  domain?: string;
}

interface Row {
  key: string;
  value: string;
  isSecret: boolean;
  riskLevel: string;
  domain: string;
}

// Mock initial data
const initialData: Record<string, ArgumentValue> = {
  api_key: {
    value: 'sk-12345',
    isSecret: true,
    riskLevel: 'high',
    domain: 'api.example.com',
  },
  theme: { value: 'dark', isSecret: false, riskLevel: 'low' },
  max_retries: {
    value: '3',
    isSecret: false,
    riskLevel: 'medium',
    domain: 'service.internal',
  },
};

function getRowsFromConfig(config: Record<string, ArgumentValue>): Row[] {
  return Object.entries(config).map(([key, val]) => ({
    key,
    value: val.value,
    isSecret: val.isSecret,
    riskLevel: val.riskLevel,
    domain: val.domain || '',
  }));
}

function TextEditor({
  row,
  column,
  onRowChange,
  onClose,
}: RenderEditCellProps<Row>) {
  return (
    <input
      className="w-full h-full bg-[#333] text-white px-2 outline-none focus:ring-1 focus:ring-blue-500"
      ref={(input) => input?.focus()}
      value={row[column.key as keyof Row] as string}
      onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value })}
      onBlur={() => onClose(true)}
    />
  );
}

function BooleanEditor({
  row,
  column,
  onRowChange,
  onClose,
}: RenderEditCellProps<Row>) {
  return (
    <div className="flex items-center justify-center h-full">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={!!row[column.key as keyof Row]}
        onChange={(e) => {
          onRowChange({ ...row, [column.key]: e.target.checked });
          onClose(true); // Close immediately on toggle? or let user click away
        }}
        onBlur={() => onClose(true)}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Record<string, ArgumentValue>>(initialData);
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('');

  const rows = useMemo(() => getRowsFromConfig(data), [data]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch = r.key.toLowerCase().includes(search.toLowerCase());
      const matchesDomain = domainFilter ? r.domain === domainFilter : true;
      return matchesSearch && matchesDomain;
    });
  }, [rows, search, domainFilter]);

  const columns: Column<Row>[] = [
    { key: 'key', name: 'Key', renderEditCell: TextEditor },
    { key: 'value', name: 'Value', renderEditCell: TextEditor },
    {
      key: 'isSecret',
      name: 'Is Secret',
      renderEditCell: BooleanEditor,
      renderCell: (props) => (
        <div className="flex items-center justify-center h-full">
          <input
            type="checkbox"
            checked={props.row.isSecret}
            readOnly
            className="h-4 w-4 accent-blue-500"
          />
        </div>
      ),
    },
    { key: 'riskLevel', name: 'Risk Level', renderEditCell: TextEditor }, // Could be a select
    { key: 'domain', name: 'Domain', renderEditCell: TextEditor },
  ];

  // Actually onRowsChange signature returns new rows.
  const onRowsChange = (
    newRows: readonly Row[],
    { indexes }: { indexes: number[] },
  ) => {
    // newRows corresponds to filteredRows with the update applied.
    // We need to sync this back to `data`.

    // Note: if filter is active, newRows is a subset.

    // We can just iterate the changed indexes.
    indexes.forEach((index) => {
      const newRow = newRows[index];
      const oldRow = filteredRows[index];

      setData((prev) => {
        const next = { ...prev };

        // If key changed
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

  const handleAdd = () => {
    const newKey = `new_arg_${Date.now()}`;
    setData((prev) => ({
      ...prev,
      [newKey]: {
        value: '',
        isSecret: false,
        riskLevel: 'low',
        domain: domainFilter || undefined, // Default to current filtering domain
      },
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">
          Argument Configuration
        </h1>
        <p className="text-sm text-gray-400">
          Manage application arguments and secrets.
        </p>
      </header>

      <div className="flex gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search arguments..."
            className="w-full bg-[#2a2a2a] border border-gray-700 rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-blue-600"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative flex-1 max-w-sm">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Filter by Domain..."
            className="w-full bg-[#2a2a2a] border border-gray-700 rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-blue-600"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Add Entry
        </button>
      </div>

      <div className="flex-1 overflow-hidden border border-gray-800 rounded-md shadow-inner bg-[#242424]">
        <DataGrid
          columns={columns}
          rows={filteredRows}
          className="rdg-dark"
          onRowsChange={onRowsChange}
          rowClass={() => 'text-sm'}
        />
      </div>
    </div>
  );
}
