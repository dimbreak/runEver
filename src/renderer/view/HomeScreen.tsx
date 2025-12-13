import * as React from 'react';

export const HomeScreen: React.FC<{}> = () => {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 font-sans">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center space-y-4">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-300">
            Agentic Browser
          </p>
          <h1 className="text-4xl font-black text-slate-900 drop-shadow-sm">
            Whatever, Whenever, Run.
          </h1>
          <p className="max-w-xl mx-auto text-slate-500">
            Start your own Agent, unified entry, converge complex work
            processes.
          </p>
        </div>
      </div>
    </div>
  );
};
