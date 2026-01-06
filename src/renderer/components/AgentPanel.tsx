import type { JSONContent } from '@tiptap/core';
import { Paperclip } from 'lucide-react';
import * as React from 'react';
import { ToMainIpc } from '../../contracts/toMain';
import { useFileDropUpload } from '../hooks/useFileDropUpload';
import { dialogService } from '../services/dialogService';
import { useAgentStore, type Message } from '../state/agentStore';
import { useLayoutStore } from '../state/layoutStore';
import { useTabStore } from '../state/tabStore';
import { extractPromptArgKeys } from '../utils/promptArgs';
import { TiptapComposer } from './TiptapComposer';
import { TiptapContent } from './TiptapContent';

type Attachment = NonNullable<Message['attachments']>[number];

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

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** idx;
  let precision = 2;
  if (idx === 0) precision = 0;
  else if (value >= 10) precision = 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const buildDataUrl = (file: Attachment) => {
  const base64 = arrayBufferToBase64(file.data);
  return `data:${file.mimeType};base64,${base64}`;
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(el);
  return ok;
};

const AttachmentPreview: React.FC<{
  file: Attachment;
  variant: 'user' | 'assistant';
}> = ({ file, variant }) => {
  const isImage = file.mimeType.startsWith('image/');
  const previewUrl = React.useMemo(() => {
    if (!isImage) return null;
    return URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
  }, [file.data, file.mimeType, isImage]);

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleDownload = React.useCallback(() => {
    const blob = new Blob([file.data], { type: file.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [file.data, file.mimeType, file.name]);

  const handleCopyLink = React.useCallback(async () => {
    const dataUrl = buildDataUrl(file);
    await copyText(dataUrl);
  }, [file]);

  return (
    <div className="mt-2 space-y-2">
      {previewUrl && (
        <div
          className={`overflow-hidden rounded-xl border ${
            variant === 'user'
              ? 'border-white/40 bg-white/10'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <img
            src={previewUrl}
            alt={file.name}
            className="max-w-full h-auto block"
          />
        </div>
      )}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-[11px] ${
          variant === 'user'
            ? 'bg-white/20 text-white'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        <div className="max-w-[200px] truncate font-semibold">{file.name}</div>
        <div className="opacity-70">
          {file.mimeType} · {formatBytes(file.size)}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            variant === 'user'
              ? 'bg-white/20 text-white'
              : 'bg-white text-slate-700'
          }`}
        >
          Download
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            variant === 'user'
              ? 'bg-white/20 text-white'
              : 'bg-white text-slate-700'
          }`}
        >
          Copy Link
        </button>
      </div>
    </div>
  );
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
  const { addMessage, updateMessage, ensureTab, setSessionSnapshot } =
    useAgentStore((state) => ({
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      ensureTab: state.ensureTab,
      setSessionSnapshot: state.setSessionSnapshot,
    }));
  const messages = useAgentStore((state) =>
    activeTabId ? (state.messagesByTabId[activeTabId] ?? []) : [],
  );
  const sessionSnapshot = useAgentStore((state) =>
    activeTabId ? (state.sessionByTabId[activeTabId] ?? null) : null,
  );
  const runningAssistantMessageIdRef = React.useRef<number | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);
  const sessionRefreshTimerRef = React.useRef<number | null>(null);

  const refreshSessionSnapshot = React.useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.frameId === -1) {
        setSessionSnapshot(tabId, null);
        return;
      }
      try {
        const res = await ToMainIpc.getLlmSessionSnapshot.invoke({
          frameId: tab.frameId,
        });
        if (
          'snapshot' in res &&
          res.snapshot &&
          typeof res.snapshot === 'object'
        ) {
          setSessionSnapshot(tabId, {
            frameId: tab.frameId,
            updatedAt: Date.now(),
            ...(res.snapshot as any),
          });
          return;
        }
        setSessionSnapshot(tabId, null);
      } catch (err) {
        console.error('session snapshot error:', err);
      }
    },
    [setSessionSnapshot, tabs],
  );

  const scheduleSessionRefresh = React.useCallback(
    (tabId: string) => {
      if (sessionRefreshTimerRef.current !== null) return;
      sessionRefreshTimerRef.current = window.setTimeout(() => {
        sessionRefreshTimerRef.current = null;
        refreshSessionSnapshot(tabId);
      }, 400);
    },
    [refreshSessionSnapshot],
  );

  const {
    attachments,
    isUploading,
    isDragActive,
    pendingFiles,
    removeAttachment,
    clearAttachments,
    dropzoneProps,
  } = useFileDropUpload({
    onError: (err) => {
      console.error('upload failed:', err);
      if (!activeTabId) return;
      addMessage(activeTabId, {
        id: Date.now(),
        role: 'assistant',
        content: textToDoc(`Upload error: ${err.message}`),
        tag: 'Error',
      });
    },
  });

  const pendingUploadLabel = React.useMemo(() => {
    if (!isDragActive) return '';
    if (pendingFiles.length === 1) {
      return `Release to add ${pendingFiles[0]!.name}`;
    }
    if (pendingFiles.length > 1) {
      return `Release to add ${pendingFiles[0]!.name} +${pendingFiles.length - 1} more`;
    }
    return 'Release to add files';
  }, [isDragActive, pendingFiles]);

  const handlePrompt = React.useCallback(
    async (content: JSONContent) => {
      const userText =
        content.content
          ?.map((node) => node.content?.map((n) => n.text ?? '').join('') ?? '')
          .join('\n\n') ?? '';
      console.info('send prompt:', userText, tabs);

      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) return false;
      const tabId = currentTab.id;

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
      const promptAttachments = attachments.slice();
      const attachmentInfos = promptAttachments.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        data: file.data,
      }));
      const respondiongMessage: Message = {
        id: assistantId,
        role: 'assistant',
        content: textToDoc(''),
        text: '',
        llmResponding: true,
      };
      runningAssistantMessageIdRef.current = assistantId;
      setIsPromptRunning(true);
      addMessage(tabId, {
        id,
        role: 'user',
        content,
        attachments: attachmentInfos.length ? attachmentInfos : undefined,
      });
      addMessage(tabId, respondiongMessage);
      clearAttachments();
      const runPromptFlow = async () => {
        try {
          const attachedImages = promptAttachments.filter((a) =>
            a.mimeType.startsWith('image/'),
          );
          const attachmentNote = attachedImages.length
            ? `\n\n[attachments]\n${attachedImages
                .map(
                  (f) => `- ${f.name} (${f.mimeType}, ${formatBytes(f.size)})`,
                )
                .join(
                  '\n',
                )}\n\nUse the attached images for this prompt; do not ask the user to upload images unless absolutely required.`
            : '';

          const runPromise = currentTab.runPrompt(
            `${userText}${attachmentNote}`,
            args,
            (chunk) => {
              console.info('prompt chunk:', chunk);
              updateMessage(tabId, assistantId, (message) => {
                const nextText = (message.text ?? '') + chunk;
                return {
                  ...message,
                  text: nextText,
                  content: textToDoc(nextText),
                };
              });
              scheduleSessionRefresh(tabId);
            },
            promptAttachments,
          );
          setRunningRequestId(currentTab.lastPromptRequestId ?? null);
          await runPromise;
        } catch (err) {
          console.error('prompt error:', err);
          updateMessage(tabId, assistantId, (message) => ({
            ...message,
            llmResponding: false,
          }));
        } finally {
          setIsPromptRunning(false);
          setRunningRequestId(null);
          updateMessage(tabId, assistantId, (message) => ({
            ...message,
            llmResponding: false,
          }));
          refreshSessionSnapshot(tabId);
        }
      };
      runPromptFlow();
      return true;
    },
    [
      activeTabId,
      addMessage,
      attachments,
      clearAttachments,
      refreshSessionSnapshot,
      scheduleSessionRefresh,
      tabs,
      updateMessage,
    ],
  );

  const handleStop = React.useCallback(async () => {
    if (!activeTabId) return;
    await stopPrompt(activeTabId, runningRequestId ?? undefined);
    setIsPromptRunning(false);
    setRunningRequestId(null);
    const assistantId = runningAssistantMessageIdRef.current;
    if (assistantId === null) return;
    if (activeTabId) {
      updateMessage(activeTabId, assistantId, (message) => ({
        ...message,
        llmResponding: false,
      }));
      refreshSessionSnapshot(activeTabId);
    }
  }, [
    activeTabId,
    refreshSessionSnapshot,
    runningRequestId,
    stopPrompt,
    updateMessage,
  ]);

  const handleCapture = async () => {
    try {
      // Get the active tab
      const currentTab = tabs.find((t) => t.id === activeTabId);
      if (!currentTab) {
        if (activeTabId) {
          addMessage(activeTabId, {
            id: Date.now(),
            role: 'assistant',
            content: textToDoc('No active tab to capture.'),
            tag: 'Error',
          });
        }
        return;
      }

      // Capture screenshot using WebTab method
      const imageDataUri = await currentTab.captureScreenshot(bounds);

      if (imageDataUri) {
        addMessage(currentTab.id, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc('Captured current view.'),
          image: imageDataUri,
          tag: 'Screenshot',
        });
      } else {
        addMessage(currentTab.id, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc('Failed to capture screenshot.'),
          tag: 'Error',
        });
      }
    } catch (err) {
      if (activeTabId) {
        addMessage(activeTabId, {
          id: Date.now(),
          role: 'assistant',
          content: textToDoc(`Capture error: ${(err as Error).message}`),
          tag: 'Error',
        });
      }
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
    return () => {
      if (sessionRefreshTimerRef.current !== null) {
        window.clearTimeout(sessionRefreshTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!activeTabId) return;
    ensureTab(activeTabId);
    refreshSessionSnapshot(activeTabId);
  }, [activeTabId, ensureTab, refreshSessionSnapshot]);

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
          {sessionSnapshot && (
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-700 shadow-[0_8px_30px_-20px_rgba(15,23,42,0.35)]">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                LLM Session Snapshot
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700">
                {JSON.stringify(sessionSnapshot, null, 2)}
              </pre>
            </div>
          )}
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
                {msg.attachments &&
                  msg.attachments.map((file) => (
                    <AttachmentPreview
                      key={`${msg.id}-${file.name}-${file.size}`}
                      file={file}
                      variant={msg.role}
                    />
                  ))}
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

        <div className="relative" {...dropzoneProps}>
          {(attachments.length > 0 || isUploading || isDragActive) && (
            <div className="border-t border-slate-100 bg-white px-4 pt-3">
              <div className="flex items-center gap-3">
                <div className="text-[12px] font-semibold text-slate-600">
                  Attachments
                </div>
                {isDragActive && (
                  <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-700">
                    <Paperclip className="h-4 w-4" />
                    {pendingUploadLabel}
                  </div>
                )}
                {isUploading && (
                  <div className="flex items-center gap-2 text-[12px] text-slate-500">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
                    Uploading...
                  </div>
                )}
              </div>
              {attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 pb-2">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                      title={`${file.name} (${formatBytes(file.size)})`}
                    >
                      <div className="max-w-[240px] truncate text-[12px] font-semibold text-slate-700">
                        {file.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatBytes(file.size)}
                      </div>
                      <button
                        type="button"
                        className="ml-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-200"
                        onClick={() => removeAttachment(file.id)}
                        aria-label={`Remove ${file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <TiptapComposer
            onSubmit={handleSubmit}
            onStop={handleStop}
            isRunning={isPromptRunning}
            placeholder="Describe what you want to automate..."
            className={
              attachments.length > 0 || isUploading || isDragActive
                ? 'pt-2'
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};
