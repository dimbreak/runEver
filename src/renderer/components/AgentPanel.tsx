import * as React from 'react';
import { Buffer } from 'buffer';
import type { JSONContent } from '@tiptap/core';
import { ToMianIpc } from '../../contracts/toMain';
import { useLayoutStore } from '../state/layoutStore';
import { TiptapComposer } from './TiptapComposer';
import { TiptapContent } from './TiptapContent';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  tag?: string;
  image?: string;
};

const textToDoc = (text: string): JSONContent => {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.length ? [{ type: 'text', text: paragraph }] : [],
    })),
  };
};

export const AgentPanel: React.FC = () => {
  const {
    isSidebarOpen: sidebarOpen,
    toggleSidebar,
    sidebarWidth,
    collapsedWidth,
    tabbarHeight,
  } = useLayoutStore();
  const panelWidth = sidebarOpen ? sidebarWidth : collapsedWidth;
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: 1,
      role: 'user',
      content: textToDoc(
        'I want to generate a list of automated tasks to run daily sales summary.',
      ),
    },
    {
      id: 2,
      role: 'assistant',
      content: textToDoc(
        'I will connect to the API, provide daily revenue, order count, and KPI detection.',
      ),
      tag: 'Plan',
    },
    {
      id: 3,
      role: 'user',
      content: textToDoc('Add "low-margin product" warning, and output CSV.'),
    },
    {
      id: 4,
      role: 'assistant',
      content: textToDoc('Added warning, and pushed CSV to your cloud at 7am.'),
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
            content: textToDoc('No active tab to capture.'),
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
            content: textToDoc('Captured current view.'),
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
            content: textToDoc('Failed to capture screenshot.'),
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
          content: textToDoc(`Capture error: ${(err as Error).message}`),
          tag: 'Error',
        },
      ]);
    }
  };

  const updateWebViewLayout = React.useCallback(
    async (isSidebarOpen: boolean) => {
      const { lastFrameId } = window as any;
      if (!lastFrameId) return;
      const width = isSidebarOpen ? sidebarWidth : collapsedWidth;
      try {
        await ToMianIpc.operateTab.invoke({
          id: lastFrameId,
          sidebarWidth: width,
          tabbarHeight,
        });
      } catch {
        // swallow layout errors to avoid blocking UI
      }
    },
    [collapsedWidth, sidebarWidth, tabbarHeight],
  );

  const handleSubmit = React.useCallback((content: JSONContent) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'user',
        content,
      },
    ]);
  }, []);

  React.useEffect(() => {
    updateWebViewLayout(sidebarOpen);
  }, [sidebarOpen, updateWebViewLayout]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden transition-[width] duration-200"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Panel card */}
      <div
        className={`flex h-full flex-col border-l border-slate-200 bg-white transition-all duration-200 ${
          sidebarOpen
            ? 'opacity-100 scale-100 translate-x-0'
            : 'opacity-0 scale-95 translate-x-4 pointer-events-none'
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
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-200"
          >
            {sidebarOpen ? 'Hide' : 'Open'}
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
                <TiptapContent
                  content={msg.content}
                  variant={msg.role === 'user' ? 'inverse' : 'default'}
                />
                {msg.image && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img
                      src={msg.image}
                      alt="screenshot"
                      className="max-w-full h-auto block"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <TiptapComposer
          onSubmit={handleSubmit}
          placeholder="Describe what you want to automate..."
        />
      </div>
    </div>
  );
};
