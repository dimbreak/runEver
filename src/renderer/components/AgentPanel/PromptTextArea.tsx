import type { JSONContent } from '@tiptap/core';
import { Paperclip } from 'lucide-react';
import * as React from 'react';
import { useAgentStoreV2 } from '../../state/agentStoreV2';
import { useTabStore } from '../../state/tabStore';
import { useAgentPrompt } from '../../hooks/useAgentPrompt';
import { useFileDropUpload } from '../../hooks/useFileDropUpload';
import { formatBytes } from '../../utils/formatter';
import { textToDoc } from '../../utils/contentUtils';
import { TiptapEditor } from './TiptapEditor';
import { cn } from '../../utils/cn';

type PromptTextAreaProps = {
  runningAssistantMessageIdRef: React.MutableRefObject<number | null>;
  placeholder?: string;
};

export const PromptTextArea: React.FC<PromptTextAreaProps> = ({
  runningAssistantMessageIdRef,
  placeholder = 'Describe what you want to automate...',
}) => {
  const { addMessage, activeSessionId, promptRunningStatus, runningRequestId } =
    useAgentStoreV2((state) => {
      const sessionId = state.activeSessionId;
      return {
        addMessage: state.addMessage,
        activeSessionId: sessionId,
        promptRunningStatus:
          sessionId === null
            ? ('idle' as const)
            : (state.promptRunningStatusBySessionId[sessionId] ?? 'idle'),
        runningRequestId:
          sessionId === null
            ? null
            : (state.runningRequestIdBySessionId[sessionId] ?? null),
      };
    });

  // File upload handling
  const {
    attachments,
    isUploading,
    isDragActive,
    pendingFiles,
    addFiles,
    removeAttachment,
    clearAttachments,
    dropzoneProps,
  } = useFileDropUpload({
    onError: (err) => {
      console.error('upload failed:', err);
      if (!activeSessionId) return;
      addMessage(activeSessionId, {
        id: Date.now(),
        role: 'assistant',
        content: textToDoc(`Upload error: ${err.message}`),
        tag: 'Error',
      });
    },
  });
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const showAttachments = attachments.length > 0 || isUploading || isDragActive;

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

  const { handlePrompt, handleStop } = useAgentPrompt({
    attachments,
    clearAttachments,
    runningAssistantMessageIdRef,
  });

  const handleSubmit = React.useCallback(
    (content: JSONContent) => {
      return handlePrompt(content);
    },
    [handlePrompt],
  );

  const handleStopClick = React.useCallback(() => {
    handleStop(runningRequestId).catch((err) => {
      console.error('Error stopping prompt:', err);
      if (!activeSessionId) return;
      const rawMessage = err instanceof Error ? err.message : String(err ?? '');
      const trimmedMessage =
        rawMessage.length > 400
          ? `${rawMessage.slice(0, 400)}...`
          : rawMessage || 'Unknown error.';
      addMessage(activeSessionId, {
        id: Date.now(),
        role: 'assistant',
        content: textToDoc(`Stop error: ${trimmedMessage}`),
        tag: 'Error',
      });
    });
  }, [activeSessionId, addMessage, handleStop, runningRequestId]);

  const handleUploadClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      addFiles(files);
      event.target.value = '';
    },
    [addFiles],
  );

  const isRunning =
    promptRunningStatus === 'planning' ||
    promptRunningStatus === 'thinking' ||
    promptRunningStatus === 'running';

  return (
    <div className="relative" {...dropzoneProps}>
      {showAttachments && (
        <div className="space-y-2 border-t border-slate-100 bg-white p-2">
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
            <div className="flex flex-wrap gap-2">
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

      <div className="px-2 pb-2">
        <TiptapEditor
          onSubmit={handleSubmit}
          onStop={handleStopClick}
          isRunning={isRunning}
          placeholder={placeholder}
          className="border-t-0"
        />
        <div
          className={cn('flex items-center justify-start bg-white py-1', {
            'border-t border-slate-100': showAttachments,
          })}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInputChange}
          />
          <button
            type="button"
            onClick={handleUploadClick}
            aria-label="Upload file"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
