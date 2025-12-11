import { ToBackgroundMsg } from './type';

type NetworkStatus = {
  inFlight: number;
  lastActivity: number | null;
};

// Background service worker (MV3) - lightweight, no external deps
const browserApi: typeof browser | typeof chrome =
  typeof browser !== 'undefined' ? browser : chrome;

const sessionsStorage = new Map<number, Record<string, unknown>>(); // tabId -> { running-workflow-record }
const activeTabs: Record<number, NetworkStatus> = {}; // tabId -> { inFlight, lastActivity }
const networkStatusSubscriptions: Set<number> = new Set();
let openAiKey: string | null = null;

const ensureLlmKey = async () => {
  if (openAiKey) return openAiKey;
  const stored = (await browserApi.storage.local.get())['flowaway-llmkey'];
  if (stored) {
    openAiKey = stored as string;
  }
  return openAiKey;
};

const extractTextContent = (content: unknown): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (typeof c === 'object' && c) {
          if ('text' in c) return c.text || '';
          if ((c as any).type === 'text') return c.text || '';
        }
        return '';
      })
      .join('');
  }
  if (typeof content === 'object' && 'text' in content)
    return (content as any).text || '';
  return '';
};

const callLLMApi = async (
  prompt: string,
  systemPrompt: string,
  promptCacheKey: string,
  reasoningEffort: Extract<ToBackgroundMsg, { type: 'CALL_LLM' }>['reasoning'],
  requestId: string,
  tabId: number,
) => {
  const key = await ensureLlmKey();
  if (!key) {
    browserApi.tabs.sendMessage(tabId, {
      type: 'LLM_API_STREAM',
      requestId,
      error: 'NO_RETRY: no key',
    });
    return;
  }
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: systemPrompt
          ? [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ]
          : [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1200,
        // promptCacheKey and reasoningEffort unused in this minimal fetch impl
      }),
    });
    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => '');
      browserApi.tabs.sendMessage(tabId, {
        type: 'LLM_API_STREAM',
        requestId,
        error: `NO_RETRY: ${resp.status} ${resp.statusText} ${bodyText}`,
      });
      return;
    }
    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    const text = extractTextContent(msg?.content);
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      browserApi.tabs.sendMessage(tabId, {
        type: 'LLM_API_STREAM',
        requestId,
        error: `NO_RETRY: parse error ${String(e)}`,
      });
      return;
    }
    browserApi.tabs.sendMessage(tabId, {
      type: 'LLM_API_STREAM',
      requestId,
      result: parsed,
      finished: true,
    });
  } catch (e: any) {
    browserApi.tabs.sendMessage(tabId, {
      type: 'LLM_API_STREAM',
      requestId,
      error: `NO_RETRY: ${(e && e.message) || 'call error'}`,
    });
  }
};

const updateWorkflow = async (
  msg: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (resp: unknown) => void,
) => {
  const workflowRecord = sessionsStorage.get(sender.tab.id)?.[
    'running-workflow-record'
  ];
  delete msg.type;
  sessionsStorage.set(sender.tab.id, {
    'running-workflow-record': { ...workflowRecord, ...msg },
  });
  sendResponse({ success: true, tabId: sender.tab?.id });
};

const handler = async (
  msg: ToBackgroundMsg,
  sender: chrome.runtime.MessageSender,
  sendResponse: (resp: unknown) => void,
) => {
  if (!sender.tab || sender.tab.id === undefined) {
    sendResponse(null);
    return;
  }
  switch (msg.type) {
    case 'INIT_WORKFLOW':
      delete msg.type;
      sessionsStorage.set(sender.tab.id, { 'running-workflow-record': msg });
      sendResponse({ success: true, tabId: sender.tab?.id });
      break;
    case 'WORKFLOW_UPDATED':
      await updateWorkflow(msg as any, sender, sendResponse);
      break;
    case 'CHECK_WORKFLOW': {
      const workflowRecord = sessionsStorage.get(sender.tab.id)?.[
        'running-workflow-record'
      ];
      if (!workflowRecord) {
        sendResponse(null);
        break;
      }
      const tabs = await browserApi.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id === sender.tab.id) {
        (workflowRecord as any).isTabActive = true;
      }
      sendResponse(workflowRecord);
      break;
    }
    case 'SUB_NETWORK_STATUS':
      networkStatusSubscriptions.add(sender.tab.id);
      sendResponse({
        success: true,
        status: activeTabs[sender.tab.id] || {
          inFlight: 0,
          lastActivity: null,
        },
      });
      break;
    case 'UNSUB_NETWORK_STATUS':
      networkStatusSubscriptions.delete(sender.tab.id);
      sendResponse({ success: true });
      break;
    case 'SAVE_LLM_KEY':
      await browserApi.storage.local.set({
        'flowaway-llmkey': msg.key,
      });
      openAiKey = msg.key;
      sendResponse({ success: true });
      break;
    case 'GET_LLM_KEY': {
      const key = (await browserApi.storage.local.get())['flowaway-llmkey'] as
        | string
        | undefined;
      openAiKey = key || null;
      sendResponse({ success: !!key, key });
      break;
    }
    case 'CALL_LLM': {
      const requestId = String(
        Date.now() * 10 + Math.round(Math.random() * 10),
      );
      callLLMApi(
        msg.prompt,
        msg.systemPrompt,
        msg.cacheKey,
        msg.reasoning,
        requestId,
        sender.tab.id,
      );
      sendResponse({ success: true, requestId });
      break;
    }
    default:
      sendResponse(null);
  }
};

browserApi.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handler(
    msg as ToBackgroundMsg,
    sender as chrome.runtime.MessageSender,
    sendResponse,
  );
  if (sender.tab && sender.tab.id !== undefined && !activeTabs[sender.tab.id]) {
    activeTabs[sender.tab.id] = { inFlight: 0, lastActivity: null };
  }
  return true;
});

browserApi.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId, type } = details;
    if (tabId < 0) return;
    const status = activeTabs[tabId];
    if (!status) return;
    if (
      !['xmlhttprequest', 'script', 'image', 'stylesheet', 'other'].includes(
        type,
      )
    )
      return;
    status.inFlight += 1;
    status.lastActivity = Date.now();
    if (networkStatusSubscriptions.has(tabId))
      browserApi.tabs.sendMessage(tabId, {
        type: 'NETWORK_STATUS_UPDATE',
        status,
      });
  },
  { urls: ['<all_urls>'] },
);

browserApi.webRequest.onCompleted.addListener(
  (details) => {
    const { tabId, type } = details;
    if (tabId < 0) return;
    const status = activeTabs[tabId];
    if (!status) return;
    if (
      !['xmlhttprequest', 'script', 'image', 'stylesheet', 'other'].includes(
        type,
      )
    )
      return;
    status.inFlight = Math.max(0, status.inFlight - 1);
    status.lastActivity = Date.now();
    if (networkStatusSubscriptions.has(tabId))
      browserApi.tabs.sendMessage(tabId, {
        type: 'NETWORK_STATUS_UPDATE',
        status,
      });
  },
  { urls: ['<all_urls>'] },
);
/* global browser, chrome */
