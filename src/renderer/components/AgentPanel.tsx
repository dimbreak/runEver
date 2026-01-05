import type { JSONContent } from '@tiptap/core';
import * as React from 'react';
import { ToMainIpc } from '../../contracts/toMain';
import { dialogService } from '../services/dialogService';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';
import { extractPromptArgKeys } from '../utils/promptArgs';
import { TiptapComposer } from './TiptapComposer';
import { TiptapContent } from './TiptapContent';

type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  text?: string;
  llmResponding?: boolean;
  tag?: string;
  image?: string; // todo multiple images? other types of files?
};

const textToDoc = (text: string): JSONContent => {
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => ({
      type: 'paragraph',
      content: paragraph.length
        ? paragraph.split('\n').flatMap((line, idx, arr) => {
            const nodes: any[] = [];
            if (line.length) nodes.push({ type: 'text', text: line });
            if (idx !== arr.length - 1) nodes.push({ type: 'hardBreak' });
            return nodes;
          })
        : [],
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
    bounds,
  } = useLayoutStore();
  const { tabs, activeTabId, stopPrompt } = useTabStore();
  const panelWidth = sidebarOpen ? sidebarWidth : collapsedWidth;
  const [isPromptRunning, setIsPromptRunning] = React.useState(false);
  const [runningRequestId, setRunningRequestId] = React.useState<number | null>(
    null,
  );
  const runningAssistantMessageIdRef = React.useRef<number | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
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

  const handlePrompt = React.useCallback(
    async (content: JSONContent) => {
      const userText =
        content.content
          ?.map((node) => node.content?.map((n) => n.text ?? '').join('') ?? '')
          .join('\n\n') ?? '';
      console.info('send prompt:', userText, tabs);

      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) return false;

      let args: Record<string, string> = {};
      const argKeys = extractPromptArgKeys(userText);
      if (argKeys.length && dialogService.hasBridge()) {
        const questions = argKeys.reduce(
          (acc, key) => ({ ...acc, [key]: { type: 'string' as const } }),
          {} as Record<string, { type: 'string' }>,
        );
        const answer = await dialogService.promptInput({
          title: 'Prompt arguments',
          message: 'Fill values to run this prompt.',
          questions,
          okText: 'Run',
          cancelText: 'Cancel',
        });
        if (answer === null) return false;
        args = answer;
      }

      const id = Date.now();
      const assistantId = id + 1;
      const respondiongMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: textToDoc(''),
        text: '',
        llmResponding: true,
      };
      runningAssistantMessageIdRef.current = assistantId;
      setIsPromptRunning(true);
      setMessages((prev) => [
        ...prev,
        { id, role: 'user', content },
        respondiongMessage,
      ]);
      try {
        const runPromise = currentTab.runPrompt(userText, args, (chunk) => {
          console.info('prompt chunk:', chunk);
          setMessages((prev) => {
            const nextText =
              (prev.find((m) => m.id === assistantId)?.text ?? '') + chunk;
            return prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    text: nextText,
                    content: textToDoc(nextText),
                  }
                : m,
            );
          });
        });
        setRunningRequestId(currentTab.lastPromptRequestId ?? null);
        await runPromise;
      } catch (err) {
        console.error('prompt error:', err);
        setMessages((prev) => {
          return prev.map((m) =>
            m.id === assistantId ? { ...m, llmResponding: false } : m,
          );
        });
      } finally {
        setIsPromptRunning(false);
        setRunningRequestId(null);
        setMessages((prev) => {
          return prev.map((m) =>
            m.id === assistantId ? { ...m, llmResponding: false } : m,
          );
        });
      }
      return true;
    },
    [activeTabId, tabs],
  );

  const handleStop = React.useCallback(async () => {
    if (!activeTabId) return;
    await stopPrompt(activeTabId, runningRequestId ?? undefined);
    setIsPromptRunning(false);
    setRunningRequestId(null);
    const assistantId = runningAssistantMessageIdRef.current;
    if (assistantId === null) return;
    setMessages((prev) => {
      return prev.map((m) =>
        m.id === assistantId ? { ...m, llmResponding: false } : m,
      );
    });
  }, [activeTabId, runningRequestId, stopPrompt]);

  const handleCapture = async () => {
    try {
      // Get the active tab
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) {
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

      // Capture screenshot using WebTab method
      const imageDataUri = await currentTab.captureScreenshot(bounds);

      if (imageDataUri) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: 'assistant',
            content: textToDoc('Captured current view.'),
            image: imageDataUri,
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
        await ToMainIpc.operateTab.invoke({
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

  const handleSubmit = React.useCallback(
    (content: JSONContent) => {
      return handlePrompt(content);
    },
    [handlePrompt],
  );

  React.useEffect(() => {
    updateWebViewLayout(sidebarOpen);
  }, [sidebarOpen, updateWebViewLayout]);

  React.useEffect(() => {
    const behavior = isPromptRunning ? 'auto' : 'smooth';
    const node = messagesEndRef.current as any;
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior, block: 'end' });
    }
  }, [isPromptRunning, messages]);

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
                {msg.role === 'assistant' && msg.text !== undefined ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-slate-800">
                    {msg.text}
                  </pre>
                ) : (
                  <TiptapContent
                    content={msg.content}
                    variant={msg.role === 'user' ? 'inverse' : 'default'}
                  />
                )}
                {msg.llmResponding && (
                  <div className="mt-1 text-xs opacity-60">...</div>
                )}
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
          <div ref={messagesEndRef} />
        </div>

        <TiptapComposer
          onSubmit={handleSubmit}
          onStop={handleStop}
          isRunning={isPromptRunning}
          placeholder="Describe what you want to automate..."
        />
      </div>
    </div>
  );
};
