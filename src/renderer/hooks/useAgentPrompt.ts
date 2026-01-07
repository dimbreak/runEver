import * as React from 'react';
import type { JSONContent } from '@tiptap/core';
import { dialogService } from '../services/dialogService';
import { useAgentStore } from '../state/agentStore';
import { useTabStore } from '../state/tabStore';
import { extractPromptArgKeys } from '../utils/promptArgs';
import { formatBytes } from '../utils/formatter';
import { textToDoc } from '../utils/contentUtils';
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
  const { addMessage, updateMessage, setIsPromptRunning, setRunningRequestId } =
    useAgentStore((state) => ({
      addMessage: state.addMessage,
      updateMessage: state.updateMessage,
      setIsPromptRunning: state.setIsPromptRunning,
      setRunningRequestId: state.setRunningRequestId,
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
      const assistantId = id + 1;
      const promptAttachments = attachments.slice();
      const attachmentInfos = promptAttachments.map((file) => ({
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        data: file.data,
      }));
      const respondingMessage = {
        id: assistantId,
        role: 'assistant' as const,
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
      addMessage(tabId, respondingMessage);
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
      runningAssistantMessageIdRef,
      scheduleSessionRefresh,
      setIsPromptRunning,
      setRunningRequestId,
      tabs,
      updateMessage,
    ],
  );

  const handleStop = React.useCallback(
    async (runningRequestId: number | null) => {
      if (!activeTabId) return;
      await stopPrompt(activeTabId, runningRequestId ?? undefined);
      setIsPromptRunning(false);
      setRunningRequestId(null);
      const assistantId = runningAssistantMessageIdRef.current;
      if (assistantId === null) return;
      updateMessage(activeTabId, assistantId, (message) => ({
        ...message,
        llmResponding: false,
      }));
      refreshSessionSnapshot(activeTabId);
    },
    [
      activeTabId,
      refreshSessionSnapshot,
      runningAssistantMessageIdRef,
      setIsPromptRunning,
      setRunningRequestId,
      stopPrompt,
      updateMessage,
    ],
  );

  return { handlePrompt, handleStop };
};
