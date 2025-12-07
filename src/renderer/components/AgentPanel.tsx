import * as React from 'react';

export const AgentPanel: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div
      className={`fixed right-6 top-6 z-50 transition-all duration-300 ${
        isOpen
          ? 'w-[430px] max-w-[92vw] h-[88vh] opacity-100'
          : 'w-16 h-16 opacity-95'
      }`}
    >
      {isOpen ? (
        <div className="flex h-full flex-col rounded-xl overflow-clip border border-slate-200/80 bg-white/95 shadow-md">
          {/* Header */}
          <div className="flex justify-between items-center gap-3 p-4 border-b border-slate-200 bg-blue-50">
            <h1 className="text-[13px] text-slate-500">Agent</h1>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-200"
            >
              Hide
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-3 space-y-3" />

          <div className="flex items-center gap-2 border border-slate-200 p-2">
            <textarea
              className="flex-1 min-h-[44px] max-h-28 resize-none border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="Describe what you want to automate..."
              rows={1}
            />
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1893ff] text-white shadow-lg shadow-sky-200/60 transition hover:bg-[#0d7fe6]"
            >
              <span className="text-sm font-bold">Go</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-2xl shadow-blue-400/40 transition hover:scale-105"
        >
          <span className="text-sm font-bold">Panel</span>
        </button>
      )}
    </div>
  );
};
