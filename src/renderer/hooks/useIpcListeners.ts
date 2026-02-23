import { useEffect } from 'react';
import { useTabStore, WebTab } from '../state/tabStore';
import { useLayoutStore } from '../state/layoutStore';
import { dialogService } from '../services/dialogService';
import { ToMainIpc } from '../../contracts/toMain';
import { useAgentStoreV2 } from '../state/agentStoreV2';
import { textToDoc } from '../utils/contentUtils';
import { ToRendererIpc } from '../../contracts/toRenderer';

export const useIpcListeners = () => {
  const { addTab, updateTabTitle, updateTabUrl, closeTab, activeTabId } =
    useTabStore();
  const { bounds } = useLayoutStore();
  const { addMessage, upsertMessage, activeSessionId, ensureSession } =
    useAgentStoreV2((state) => ({
      addMessage: state.addMessage,
      upsertMessage: state.upsertMessage,
      activeSessionId: state.activeSessionId,
      ensureSession: state.ensureSession,
    }));

  useEffect(() => {
    const ipc = window.electron?.ipcRenderer;
    if (!ipc) return;

    // Handler for opening new tabs from main process
    const handleOpenNewTab = (
      _: any,
      payload: { url: string; parentFrameId?: number },
    ) => {
      const newTab = new WebTab({
        id: -1,
        title: payload.url,
        url: payload.url,
        parentFrameId: payload.parentFrameId,
      });
      addTab(newTab, bounds);
    };

    const handleTitleUpdate = (
      _event: any,
      payload: { frameId: number; title?: string; url?: string },
    ) => {
      if (payload.title) {
        updateTabTitle(payload.frameId, payload.title);
      }
      if (payload.url) {
        updateTabUrl(payload.frameId, payload.url);
      }
    };

    const unsubscribeNewTab = ipc.on('open-new-tab', handleOpenNewTab);
    const unsubscribeTitleUpdate = ipc.on(
      'tab-title-updated',
      handleTitleUpdate,
    );
    const unsubscribeTabClosed = ipc.on(
      'tab-closed',
      async (_event: any, payload: { frameId: number }) => {
        await closeTab(payload.frameId);
      },
    );
    const unsubscribeToUser = ipc.on(
      'to-user',
      async (_event: any, payload: ToRendererIpc.ToUserMessage) => {
        if (!payload) return;
        const { sessionId } = payload;
        // Use the sessionId from the wire message, falling back to the
        // active session or a default.
        ensureSession(sessionId);

        if (payload.type === 'prompt') {
          const questions = payload.questions ?? {};
          let answer: Record<string, string> | null = null;
          try {
            answer = await dialogService.promptInput({
              title: payload.title,
              message: payload.message ?? 'Input required',
              questions,
              okText: 'OK',
              cancelText: 'Cancel',
            });
          } catch {
            answer = null;
          }
          const fallbackAnswer = Object.keys(questions).reduce(
            (acc, key) => ({ ...acc, [key]: '' }),
            {} as Record<string, string>,
          );
          await ToMainIpc.responsePromptInput.invoke({
            id: payload.responseId,
            answer: answer ?? fallbackAnswer,
          });
        } else if (payload.type === 'snapshot') {
          // Upsert: if a message with this responseId exists, update its
          // taskSnapshot; otherwise push a new snapshot message.
          upsertMessage(
            sessionId,
            {
              id: payload.responseId,
              role: 'assistant',
              content: {},
              taskSnapshot: payload.snapshot,
            },
            payload.snapshot.status === 'Thinking' ||
              payload.snapshot.status === 'Executing',
          );
        } else {
          let tag = 'Info';
          if (payload.type === 'error') {
            tag = 'Error';
          } else if (payload.type === 'warning') {
            tag = 'Warning';
          }
          const message =
            typeof payload.message === 'string' && payload.message.length
              ? payload.message
              : 'Message received.';
          addMessage(sessionId, {
            id: Date.now(),
            role: 'assistant',
            content: textToDoc(message),
            tag,
          });
        }
      },
    );
    const unsubscribeSessionSnapshot = ipc.on(
      'llm-session-snapshot',
      (
        _event: any,
        _payload: { frameId: number; snapshot: unknown | null },
      ) => {
        // V2: llm-session-snapshot from the old system is no longer
        // processed. The new flow uses 'to-user' type:'snapshot' messages
        // which are upserted as regular messages with taskSnapshot field.
      },
    );

    return () => {
      unsubscribeNewTab?.();
      unsubscribeTitleUpdate?.();
      unsubscribeTabClosed?.();
      unsubscribeToUser?.();
      unsubscribeSessionSnapshot?.();
    };
  }, [
    activeTabId,
    activeSessionId,
    addMessage,
    upsertMessage,
    ensureSession,
    addTab,
    updateTabTitle,
    updateTabUrl,
    closeTab,
    bounds,
  ]);
};
