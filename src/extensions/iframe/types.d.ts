import type { MiniHtml } from '../../webView/miniHtml';
import type { WireActionWithWaitAndRec } from '../../agentic/types';
import { ActionApi, ActionApiCallingReq } from '../../webView/actions';

export type ActionReq<K extends keyof ActionApi> = {
  type: 'IFRAME_ACTION';
  id: number;
} & ActionApiCallingReq<K>;

export type FromIframeMessages = (
  | {
      type: 'IFRAME_WAIT_DOM_DONE';
      error?: 'timeout';
    }
  | {
      type: 'IFRAME_HTML';
      html: string;
    }
  | { type: 'IFRAME_DELTA_HTML'; html: string }
  | ActionReq<keyof ActionApi>
) & {
  frameId: string;
};

export type ToIframeMessagesTypes =
  | {
      type: 'GET_HTML';
      select?: MiniHtml.Selector;
      outerLevel?: number;
    }
  | {
      type: 'GET_DELTA_HTML';
    }
  | {
      type: 'EXEC_ACTIONS';
      actions: WireActionWithWaitAndRec[];
      args: Record<string, string>;
      clientX: number;
      clientY: number;
    }
  | {
      type: 'ACTION_RESULT';
      id: number;
      result: any;
    }
  | {
      type: 'WAIT_DOM';
      selector: MiniHtml.Selector;
      appear: boolean;
    }
  | {
      type: 'PING';
    };

export type ToIframeMessages = ToIframeMessagesTypes & { frameId: string };

export {};
