import * as React from 'react';
import { Buffer } from 'buffer';
import { ToMianIpc } from '../../ipc/toMain';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  tag?: string;
  image?: string;
};

export const AgentPanel: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(true);
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 1,
      role: 'user',
      text: 'I want to generate a list of automated tasks to run daily sales summary.',
    },
    {
      id: 2,
      role: 'assistant',
      text: 'I will connect to the API, provide daily revenue, order count, and KPI detection.',
      tag: 'Plan',
    },
    {
      id: 3,
      role: 'user',
      text: 'Add "low-margin product" warning, and output CSV.',
    },
    {
      id: 4,
      role: 'assistant',
      text: 'Added warning, and pushed CSV to your cloud at 7am.',
      tag: 'Ready',
    },
  ]);

  const handleCapture = async () => {
    try {
      // frameId/bounds from window (set in App.tsx useEffect)
      const { lastFrameId, lastTabBounds } = window as any;
      const frameId: number | undefined = lastFrameId;
      const bounds = lastTabBounds || { width: 800, height: 600 };
      if (!frameId) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            text: 'No active tab to capture.',
            tag: 'Error',
          },
        ]);
        return;
      }

      const payload = {
        frameId,
        ttlHeight: bounds.height,
        ttlWidth: bounds.width,
        vpHeight: bounds.height,
        vpWidth: bounds.width,
        slices: [{ x: 0, y: 0 }],
      };

      const imgJpgs = await ToMianIpc.takeScreenshot.invoke(payload);
      if (Array.isArray(imgJpgs) && imgJpgs.length > 0) {
        const base64Img = Buffer.from(imgJpgs[0] as any).toString('base64');
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            text: 'Captured current view.',
            image: `data:image/jpeg;base64,${base64Img}`,
            tag: 'Screenshot',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            text: 'Failed to capture screenshot.',
            tag: 'Error',
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          text: `Capture error: ${(err as Error).message}`,
          tag: 'Error',
        },
      ]);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[430px] max-w-[92vw] h-[88vh]">
      {/* Panel card */}
      <div
        className={`flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.35)] backdrop-blur-md ${
          isOpen ? 'opacity-100' : 'hidden'
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 px-4 py-3 min-h-[88px] border-b border-slate-200 bg-blue-50">
          <div className="font-semibold text-slate-800 leading-tight">
            <div className="text-[13px] text-slate-500">Flowaway</div>
            <div className="text-[15px]">Agent</div>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={handleCapture}
              className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-amber-200/60 transition hover:-translate-y-[1px] hover:bg-amber-600"
            >
              Capture View
            </button>
            <button
              type="button"
              className="rounded-xl bg-[#3aa5ff] px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-sky-200/60 transition hover:-translate-y-[1px] hover:bg-[#1893ff]"
            >
              New Chat
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-slate-400/50 transition hover:-translate-y-[1px] hover:bg-slate-800"
            >
              Save
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-200"
          >
            Hide
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-slate-50/70 px-4 py-3 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`relative max-w-[85%] rounded-2xl px-3.5 py-3 text-sm leading-relaxed shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)] ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-sky-400 text-white'
                    : 'bg-white border border-slate-200 text-slate-800'
                }`}
              >
                {msg.tag && (
                  <span
                    className={`mb-2 inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      msg.role === 'user'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                >
                  {msg.tag}
                </span>
              )}
              <div className="whitespace-pre-line">{msg.text}</div>
              {msg.image && (
                <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={msg.image} alt="screenshot" className="max-w-full h-auto block" />
                </div>
              )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="border-t border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 shadow-inner shadow-slate-200">
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
      </div>

      {/* Toggle button */}
      {!isOpen && (
        <div className="absolute bottom-0 right-0">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
            className="group flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-sky-400 text-white shadow-2xl shadow-blue-400/40 transition hover:scale-105"
          >
            <div className="text-center leading-tight">
              <div className="text-[11px] opacity-80">Open Agent</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
