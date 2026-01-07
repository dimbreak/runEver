import type { JSONContent } from '@tiptap/core';
import { Paperclip } from 'lucide-react';
import * as React from 'react';
import { useAgentStore } from '../../state/agentStore';
import { useTabStore } from '../../state/tabStore';
import { useAgentPrompt } from '../../hooks/useAgentPrompt';
import { useFileDropUpload } from '../../hooks/useFileDropUpload';
import { formatBytes } from '../../utils/formatter';
import { textToDoc } from '../../utils/contentUtils';
import { TiptapEditor } from './TiptapEditor';

type PromptTextAreaProps = {
  scheduleSessionRefresh: (tabId: string) => void;
  refreshSessionSnapshot: (tabId: string) => Promise<void>;
  runningAssistantMessageIdRef: React.MutableRefObject<number | null>;
  placeholder?: string;
};

export const PromptTextArea: React.FC<PromptTextAreaProps> = ({
  scheduleSessionRefresh,
  refreshSessionSnapshot,
  runningAssistantMessageIdRef,
  placeholder = 'Describe what you want to automate...',
}) => {
  const { activeTabId } = useTabStore();
  const { addMessage, isPromptRunning, runningRequestId } = useAgentStore(
    (state) => ({
      addMessage: state.addMessage,
      isPromptRunning: state.isPromptRunning,
      runningRequestId: state.runningRequestId,
    }),
  );

  // File upload handling
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

  // Pending upload label
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

  // Agent prompt handling
  const { handlePrompt, handleStop } = useAgentPrompt({
    attachments,
    clearAttachments,
    runningAssistantMessageIdRef,
    scheduleSessionRefresh,
    refreshSessionSnapshot,
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
    });
  }, [handleStop, runningRequestId]);

  return (
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

      <TiptapEditor
        onSubmit={handleSubmit}
        onStop={handleStopClick}
        isRunning={isPromptRunning}
        placeholder={placeholder}
        className={
          attachments.length > 0 || isUploading || isDragActive
            ? 'pt-2'
            : undefined
        }
      />
    </div>
  );
};
