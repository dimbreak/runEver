import * as React from 'react';
import type { JSONContent } from '@tiptap/core';
import { dialogService } from '../services/dialogService';
import { useAgentStore } from '../state/agentStore';
import { useTabStore } from '../state/tabStore';
import { extractPromptArgKeys } from '../utils/promptArgs';
import { formatBytes } from '../utils/formatter';
import type { UploadedAttachment } from '../services/uploadService';

type UseAgentPromptParams = {
  attachments: UploadedAttachment[];
  clearAttachments: () => void;
  runningAssistantMessageIdRef: React.MutableRefObject<number | null>;
  scheduleSessionRefresh: (tabId: string) => void;
  refreshSessionSnapshot: (tabId: string) => Promise<void>;
};

export const useAgentPrompt = ({
  attachments,
  clearAttachments,
  runningAssistantMessageIdRef,
  scheduleSessionRefresh,
  refreshSessionSnapshot,
}: UseAgentPromptParams) => {
  const { tabs, activeTabId, stopPrompt } = useTabStore();
  const {
    addMessage,
    setIsPromptRunning,
    setRunningRequestId,
    startThinking,
    appendPlanningOutput,
    finishPlanning,
    startActionThinking,
    markThinkingError,
    addPromptRun,
    setPromptRunStatus,
  } = useAgentStore((state) => ({
    addMessage: state.addMessage,
    setIsPromptRunning: state.setIsPromptRunning,
    setRunningRequestId: state.setRunningRequestId,
    startThinking: state.startThinking,
    appendPlanningOutput: state.appendPlanningOutput,
    finishPlanning: state.finishPlanning,
    startActionThinking: state.startActionThinking,
    markThinkingError: state.markThinkingError,
    addPromptRun: state.addPromptRun,
    setPromptRunStatus: state.setPromptRunStatus,
  }));

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
      const requestId = Date.now() * 100 + Math.floor(Math.random() * 100);
      const promptAttachments = attachments.slice();
      const attachmentInfos = promptAttachments.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        data: file.data,
      }));
      runningAssistantMessageIdRef.current = null;
      setIsPromptRunning(true);
      addPromptRun(tabId, requestId, id);
      startThinking(tabId, requestId);
      addMessage(tabId, {
        id,
        role: 'user',
        content,
        attachments: attachmentInfos.length ? attachmentInfos : undefined,
      });
      clearAttachments();
      const runPromptFlow = async () => {
        let promptFailed = false;
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
              appendPlanningOutput(tabId, requestId, chunk);
              scheduleSessionRefresh(tabId);
            },
            promptAttachments,
            requestId,
          );
          setRunningRequestId(requestId);
          await runPromise;
          finishPlanning(tabId, requestId);
          setPromptRunStatus(tabId, requestId, 'planned');
          startActionThinking(tabId, requestId);
        } catch (err) {
          console.error('prompt error:', err);
          promptFailed = true;
          markThinkingError(tabId, requestId);
          finishPlanning(tabId, requestId);
          setPromptRunStatus(tabId, requestId, 'error');
        } finally {
          setIsPromptRunning(false);
          setRunningRequestId(null);
          if (promptFailed) {
            setPromptRunStatus(tabId, requestId, 'error');
          }
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
      appendPlanningOutput,
      clearAttachments,
      finishPlanning,
      markThinkingError,
      refreshSessionSnapshot,
      runningAssistantMessageIdRef,
      scheduleSessionRefresh,
      setIsPromptRunning,
      setRunningRequestId,
      addPromptRun,
      setPromptRunStatus,
      startActionThinking,
      startThinking,
      tabs,
    ],
  );

  const handleStop = React.useCallback(
    async (runningRequestId: number | null) => {
      if (!activeTabId) return;
      await stopPrompt(activeTabId, runningRequestId ?? undefined);
      setIsPromptRunning(false);
      setRunningRequestId(null);
      if (runningRequestId !== null) {
        markThinkingError(activeTabId, runningRequestId);
        setPromptRunStatus(activeTabId, runningRequestId, 'error');
      }
      refreshSessionSnapshot(activeTabId);
    },
    [
      activeTabId,
      markThinkingError,
      refreshSessionSnapshot,
      setIsPromptRunning,
      setRunningRequestId,
      setPromptRunStatus,
      stopPrompt,
    ],
  );

  return { handlePrompt, handleStop };
};
