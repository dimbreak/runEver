/**
 * Agent Store V2 - Zustand store for managing agent state.
 *
 * Architecture:
 * - Sessions are top-level entities that own messages and group tabs.
 * - Tabs live under sessions; switching tabs does NOT refresh the dialog.
 * - Switching sessions loads that session's message history.
 * - Prompt running status is pushed as a message with a `taskSnapshot` field
 *   and updated in-place by matching `id` against incoming `responseId`.
 */

import { create } from 'zustand';
import type {
  Message,
  AgentStateV2,
  PromptRunningStatus,
  Session,
} from './types';
import { ToRendererIpc } from '../../../contracts/toRenderer';
import { ToMainIpc } from '../../../contracts/toMain';
import { useTabStore } from '../tabStore';

const makeSession = (id: number, label: string): Session => ({
  id,
  label,
  tabIds: [],
  activeTabId: null,
  tabs: [],
});

// ---------------------------------------------------------------------------
// Test / seed data — remove when no longer needed
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

const seedMessages: Message[] = [];

// ---------------------------------------------------------------------------
const listenSessionUpdate = () => {
  ToRendererIpc.sessionsUpdate.on((event, sessions) => {
    console.log('sessionsUpdate', sessions);
    const store = useAgentStoreV2.getState();
    const sessionList = Object.values(sessions);
    if (sessionList.length === 0) return;

    if (store.activeSessionId === null) {
      const firstSession = sessionList[0];
      const newSessions: Record<number, Session> = {};
      const newMessagesBySessionId: Record<number, Message[]> = {};
      const newPromptRunningBySessionId: Record<number, PromptRunningStatus> =
        {};
      const newRunningRequestIdBySessionId: Record<number, number | null> = {};

      sessionList.forEach((s) => {
        newSessions[s.id] = {
          id: s.id,
          label: s.title || `Session ${s.id}`,
          tabIds: s.tabs.map((t) => t.id),
          activeTabId:
            s.tabs.find((t) => t.active)?.id ?? s.tabs[0]?.id ?? null,
          tabs: s.tabs,
        };
        newMessagesBySessionId[s.id] = [];
        newPromptRunningBySessionId[s.id] = s.isRunning ? 'running' : 'idle';
        newRunningRequestIdBySessionId[s.id] = null;
      });

      useAgentStoreV2.setState({
        sessions: newSessions,
        activeSessionId: firstSession.id,
        messagesBySessionId: newMessagesBySessionId,
        promptRunningStatusBySessionId: newPromptRunningBySessionId,
        runningRequestIdBySessionId: newRunningRequestIdBySessionId,
      });

      useTabStore.getState().switchSession(firstSession.tabs, firstSession.id);
    } else {
      const currentSessions = { ...store.sessions };
      const currentMessages = { ...store.messagesBySessionId };
      const currentPromptRunning = { ...store.promptRunningStatusBySessionId };
      const currentRunningRequest = { ...store.runningRequestIdBySessionId };
      let updated = false;

      sessionList.forEach((s) => {
        if (!currentSessions[s.id]) {
          currentSessions[s.id] = {
            id: s.id,
            label: s.title || `Session ${s.id}`,
            tabIds: s.tabs.map((t) => t.id),
            activeTabId:
              s.tabs.find((t) => t.active)?.id ?? s.tabs[0]?.id ?? null,
            tabs: s.tabs,
          };
          currentMessages[s.id] = currentMessages[s.id] || [];
          currentRunningRequest[s.id] = currentRunningRequest[s.id] || null;
          currentPromptRunning[s.id] =
            currentPromptRunning[s.id] || (s.isRunning ? 'running' : 'idle');
          updated = true;
        } else {
          if (
            currentSessions[s.id].label !== s.title ||
            JSON.stringify(currentSessions[s.id].tabs) !==
              JSON.stringify(s.tabs)
          ) {
            currentSessions[s.id] = {
              ...currentSessions[s.id],
              label: s.title || `Session ${s.id}`,
              tabIds: s.tabs.map((t) => t.id),
              tabs: s.tabs,
            };
            updated = true;
          }
          if (
            currentPromptRunning[s.id] !== (s.isRunning ? 'running' : 'idle')
          ) {
            currentPromptRunning[s.id] =
              currentPromptRunning[s.id] || (s.isRunning ? 'running' : 'idle');
            updated = true;
          }
        }
      });

      if (updated) {
        useAgentStoreV2.setState({
          sessions: currentSessions,
          messagesBySessionId: currentMessages,
          promptRunningStatusBySessionId: currentPromptRunning,
          runningRequestIdBySessionId: currentRunningRequest,
        });
      }
    }
  });
};

export const useAgentStoreV2 = create<AgentStateV2>((set) => {
  listenSessionUpdate();
  return {
    // ---- Initial state (seeded with test data) ----
    sessions: {},
    activeSessionId: null,
    messagesBySessionId: { 0: seedMessages },
    promptRunningStatusBySessionId: { 0: 'idle' },
    runningRequestIdBySessionId: { 0: null },

    // ---------------------------------------------------------------------------
    // Session management
    // ---------------------------------------------------------------------------

    createSession: (id, label) =>
      set((state) => {
        if (state.sessions[id]) return state;
        return {
          sessions: { ...state.sessions, [id]: makeSession(id, label) },
          messagesBySessionId: { ...state.messagesBySessionId, [id]: [] },
          promptRunningStatusBySessionId: {
            ...state.promptRunningStatusBySessionId,
            [id]: 'idle' as PromptRunningStatus,
          },
          runningRequestIdBySessionId: {
            ...state.runningRequestIdBySessionId,
            [id]: null,
          },
          // If no active session yet, activate this one
          activeSessionId: state.activeSessionId ?? id,
        };
      }),

    switchSession: (sessionId) =>
      set((state) => {
        if (!state.sessions[sessionId]) return state;
        const session = state.sessions[sessionId];
        useTabStore.getState().switchSession(session.tabs, sessionId);
        return { activeSessionId: sessionId };
      }),

    removeSession: (sessionId) =>
      set((state) => {
        ToMainIpc.closeSession.invoke(sessionId).catch(console.error);

        const next = { ...state.sessions };
        delete next[sessionId];

        const nextMessages = { ...state.messagesBySessionId };
        delete nextMessages[sessionId];

        const nextStatus = { ...state.promptRunningStatusBySessionId };
        delete nextStatus[sessionId];

        const nextRunning = { ...state.runningRequestIdBySessionId };
        delete nextRunning[sessionId];

        let nextActive = state.activeSessionId;
        if (nextActive === sessionId) {
          const remaining = Object.keys(next);
          nextActive = remaining.length > 0 ? parseInt(remaining[0], 10) : null;
        }

        return {
          sessions: next,
          activeSessionId: nextActive,
          messagesBySessionId: nextMessages,
          promptRunningStatusBySessionId: nextStatus,
          runningRequestIdBySessionId: nextRunning,
        };
      }),

    // ---------------------------------------------------------------------------
    // Tab-under-session management
    // ---------------------------------------------------------------------------

    addTabToSession: (sessionId, tabId) =>
      set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        if (session.tabIds.includes(tabId)) return state;
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              tabIds: [...session.tabIds, tabId],
              activeTabId: session.activeTabId ?? tabId,
            },
          },
        };
      }),

    removeTabFromSession: (sessionId, tabId) =>
      set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        const nextTabs = session.tabIds.filter((id) => id !== tabId);
        let nextActive = session.activeTabId;
        if (nextActive === tabId) {
          nextActive =
            nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
        }
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              tabIds: nextTabs,
              activeTabId: nextActive,
            },
          },
        };
      }),

    syncTabsToSession: (sessionId, tabs) =>
      set((state) => {
        const session = state.sessions[sessionId];
        if (!session) return state;
        const nextTabIds = tabs.map((t) => t.id);
        let nextActive = session.activeTabId;
        if (!nextTabIds.includes(nextActive ?? -1)) {
          nextActive =
            nextTabIds.length > 0 ? nextTabIds[nextTabIds.length - 1] : null;
        }
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...session,
              tabIds: nextTabIds,
              tabs,
              activeTabId: nextActive,
            },
          },
        };
      }),

    switchTab: (sessionId, tabId) =>
      set((state) => {
        const session = state.sessions[sessionId];
        if (!session || !session.tabIds.includes(tabId)) return state;
        if (session.activeTabId === tabId) return state;
        // Only update the active tab; messages stay the same (no refresh)
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: { ...session, activeTabId: tabId },
          },
        };
      }),

    // ---------------------------------------------------------------------------
    // Ensure helpers
    // ---------------------------------------------------------------------------

    ensureSession: (sessionId) =>
      set((state) => {
        if (state.sessions[sessionId]) return state;
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: makeSession(sessionId, String(sessionId)),
          },
          messagesBySessionId: {
            ...state.messagesBySessionId,
            [sessionId]: [],
          },
          promptRunningStatusBySessionId: {
            ...state.promptRunningStatusBySessionId,
            [sessionId]: 'idle' as PromptRunningStatus,
          },
          runningRequestIdBySessionId: {
            ...state.runningRequestIdBySessionId,
            [sessionId]: null,
          },
        };
      }),

    // ---------------------------------------------------------------------------
    // Message management (operates on session, not tab)
    // ---------------------------------------------------------------------------

    addMessage: (sessionId, message) =>
      set((state) => {
        const prev = state.messagesBySessionId[sessionId] ?? [];
        return {
          messagesBySessionId: {
            ...state.messagesBySessionId,
            [sessionId]: [...prev, message],
          },
        };
      }),

    updateMessage: (sessionId, messageId, updater) =>
      set((state) => {
        const prev = state.messagesBySessionId[sessionId] ?? [];
        return {
          messagesBySessionId: {
            ...state.messagesBySessionId,
            [sessionId]: prev.map((m) => (m.id === messageId ? updater(m) : m)),
          },
        };
      }),

    upsertMessage: (sessionId, message, isSnapshotAndRunning) =>
      set((state) => {
        const prev = state.messagesBySessionId[sessionId] ?? [];
        const existingIndex = prev.findIndex((m) => m.id === message.id);
        console.log(
          'upsertMessage',
          prev,
          message,
          existingIndex,
          sessionId,
          isSnapshotAndRunning,
        );
        if (existingIndex >= 0) {
          // Update in place
          const next = prev.slice();
          next[existingIndex] = { ...prev[existingIndex], ...message };
          return {
            messagesBySessionId: {
              ...state.messagesBySessionId,
              [sessionId]: next,
            },
            promptRunningStatusBySessionId:
              isSnapshotAndRunning === undefined
                ? state.promptRunningStatusBySessionId
                : {
                    ...state.promptRunningStatusBySessionId,
                    [sessionId]: isSnapshotAndRunning ? 'running' : 'idle',
                  },
          };
        }
        // Push new
        return {
          messagesBySessionId: {
            ...state.messagesBySessionId,
            [sessionId]: [...prev, message],
          },
        };
      }),

    setMessages: (sessionId, messages) =>
      set((state) => ({
        messagesBySessionId: {
          ...state.messagesBySessionId,
          [sessionId]: messages,
        },
      })),

    clearMessages: (sessionId) =>
      set((state) => ({
        messagesBySessionId: { ...state.messagesBySessionId, [sessionId]: [] },
      })),

    // ---------------------------------------------------------------------------
    // Prompt status (per session)
    // ---------------------------------------------------------------------------

    setPromptRunningStatus: (sessionId, status) =>
      set((state) => ({
        promptRunningStatusBySessionId: {
          ...state.promptRunningStatusBySessionId,
          [sessionId]: status,
        },
      })),

    setRunningRequestId: (sessionId, id) =>
      set((state) => ({
        runningRequestIdBySessionId: {
          ...state.runningRequestIdBySessionId,
          [sessionId]: id,
        },
      })),
  };
});
