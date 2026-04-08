import * as React from 'react';
import type { JSONContent } from '@tiptap/core';
import { dialogService } from '../services/dialogService';
import { useAgentStoreV2 } from '../state/agentStoreV2';
import { useTabStore } from '../state/tabStore';
import { extractPromptArgKeys } from '../utils/promptArgs';
import type { UploadedAttachment } from '../services/uploadService';
import { ToMainIpc } from '../../contracts/toMain';
import type { PromptAttachment } from '../../schema/attachments';
import { docToText } from '../utils/contentUtils';

type UseAgentPromptParams = {
  attachments: UploadedAttachment[];
  clearAttachments: () => void;
  runningAssistantMessageIdRef: React.MutableRefObject<number | null>;
};

export const useAgentPrompt = ({
  attachments,
  clearAttachments,
  runningAssistantMessageIdRef,
}: UseAgentPromptParams) => {
  const { tabs, activeTabId } = useTabStore();
  const {
    addMessage,
    setPromptRunningStatus,
    setRunningRequestId,
    activeSessionId,
  } = useAgentStoreV2((state) => ({
    addMessage: state.addMessage,
    setPromptRunningStatus: state.setPromptRunningStatus,
    setRunningRequestId: state.setRunningRequestId,
    activeSessionId: state.activeSessionId,
  }));

  const handlePrompt = React.useCallback(
    async (content: JSONContent) => {
      const userText = docToText(content);
      console.info('send prompt:', userText, tabs);

      const currentTab = tabs.find((t) => t.id === activeTabId);
      console.info('currentTab:', currentTab);
      if (!currentTab) return false;

      const sessionId = activeSessionId;
      console.info('sessionId:', sessionId);
      if (sessionId === null || sessionId === -1) return false;

      let args: Record<string, string> = {};
      const argKeys = extractPromptArgKeys(userText);
      console.info('argKeys:', argKeys);
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

      // Set session-level running status
      setPromptRunningStatus(sessionId, 'planning');

      // Add user message to session
      addMessage(sessionId, {
        id,
        role: 'user',
        content,
        attachments: attachmentInfos.length ? attachmentInfos : undefined,
      });

      // Push a snapshot placeholder message – it will be updated via upsert
      // when snapshot messages arrive from the main process
      addMessage(sessionId, {
        id: requestId,
        role: 'assistant',
        content: {},
        taskSnapshot: null, // will be filled in by IPC snapshot messages
      });

      clearAttachments();

      const runPromptFlow = async () => {
        try {
          const runPromise = ToMainIpc.runPrompt.invoke({
            sessionId,
            prompt: userText,
            requestId:
              requestId ?? Date.now() * 100 + Math.floor(Math.random() * 100),
            args,
            attachments: promptAttachments.map(
              (f): PromptAttachment => ({
                name: f.name,
                mimeType: f.mimeType,
                data: f.data,
              }),
            ),
          });
          setRunningRequestId(sessionId, requestId);
          await runPromise;
          setPromptRunningStatus(sessionId, 'completed');
        } catch (err) {
          console.error('prompt error:', err);
          setPromptRunningStatus(sessionId, 'error');
        } finally {
          setRunningRequestId(sessionId, null);
        }
      };
      runPromptFlow();
      return true;
    },
    [
      activeTabId,
      activeSessionId,
      addMessage,
      attachments,
      clearAttachments,
      runningAssistantMessageIdRef,
      setPromptRunningStatus,
      setRunningRequestId,
      tabs,
    ],
  );

  const handleStop = React.useCallback(
    async (runningRequestId: number | null) => {
      const sessionId = activeSessionId!;
      const { stopped, error } = await ToMainIpc.stopPrompt.invoke({
        sessionId,
        requestId: runningRequestId!,
      });
      if (error) throw new Error(error);
      return stopped;
    },
    [activeSessionId],
  );

  return { handlePrompt, handleStop };
};
