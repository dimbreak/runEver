import type { JSONContent } from '@tiptap/core';
import { create } from 'zustand';

export type Message = {
  id: number;
  role: 'user' | 'assistant';
  content: JSONContent;
  text?: string;
  llmResponding?: boolean;
  tag?: string;
  image?: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    size: number;
    data: ArrayBuffer;
  }>;
};

export type LlmSessionSnapshot = {
  frameId: number;
  activeRequestId: number | null;
  runQueue: number[];
  runs: Array<{
    requestId: number;
    stopRequested: boolean;
    args: Record<string, any>;
    actions: Array<{
      id: number;
      intent?: string;
      risk?: string;
      done?: boolean;
      error?: string[];
      stepPrompt?: string;
      promptId?: number;
      argsDelta?: Record<string, string>;
      action?: unknown;
    }>;
    currentAction: number;
    prompts: Array<{
      id: number;
      parentId?: number;
      sessionId?: number;
      goalPrompt: string;
      subPrompt?: string;
      argsAdded?: Record<string, string> | null;
      complexity?: string;
    }>;
    breakPromptForExeErr: boolean;
    fixingAction?: { actionId: number; offset: number; promptId: number } | null;
    sessionQueue: Array<{
      id: number;
      parentId: number | null;
      promptQueue: Array<{
        id: number;
        parentId?: number;
        sessionId?: number;
        goalPrompt: string;
        subPrompt?: string;
        argsAdded?: Record<string, string> | null;
        complexity?: string;
      }>;
      subSessionQueueIds: number[];
      breakPromptForExeErr: boolean;
    }>;
    runningSessionIds: number[];
  }>;
  updatedAt: number;
};

type AgentState = {
  messagesByTabId: Record<string, Message[]>;
  sessionByTabId: Record<string, LlmSessionSnapshot | null>;
  ensureTab: (tabId: string) => void;
  addMessage: (tabId: string, message: Message) => void;
  updateMessage: (
    tabId: string,
    messageId: number,
    updater: (message: Message) => Message,
  ) => void;
  setMessages: (tabId: string, messages: Message[]) => void;
  setSessionSnapshot: (tabId: string, snapshot: LlmSessionSnapshot | null) => void;
  clearTab: (tabId: string) => void;
};

export const useAgentStore = create<AgentState>((set) => ({
  messagesByTabId: {},
  sessionByTabId: {},
  ensureTab: (tabId) =>
    set((state) => {
      if (state.messagesByTabId[tabId]) return state;
      return {
        messagesByTabId: { ...state.messagesByTabId, [tabId]: [] },
      };
    }),
  addMessage: (tabId, message) =>
    set((state) => {
      const prev = state.messagesByTabId[tabId] ?? [];
      return {
        messagesByTabId: {
          ...state.messagesByTabId,
          [tabId]: [...prev, message],
        },
      };
    }),
  updateMessage: (tabId, messageId, updater) =>
    set((state) => {
      const prev = state.messagesByTabId[tabId] ?? [];
      return {
        messagesByTabId: {
          ...state.messagesByTabId,
          [tabId]: prev.map((m) => (m.id === messageId ? updater(m) : m)),
        },
      };
    }),
  setMessages: (tabId, messages) =>
    set((state) => ({
      messagesByTabId: { ...state.messagesByTabId, [tabId]: messages },
    })),
  setSessionSnapshot: (tabId, snapshot) =>
    set((state) => ({
      sessionByTabId: { ...state.sessionByTabId, [tabId]: snapshot },
    })),
  clearTab: (tabId) =>
    set((state) => {
      const nextMessages = { ...state.messagesByTabId };
      const nextSessions = { ...state.sessionByTabId };
      delete nextMessages[tabId];
      delete nextSessions[tabId];
      return { messagesByTabId: nextMessages, sessionByTabId: nextSessions };
    }),
}));
