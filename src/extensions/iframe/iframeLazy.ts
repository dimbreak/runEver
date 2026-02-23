import type { FromIframeMessages, ToIframeMessages } from './types.d.ts';
import { MiniHtml } from '../../webView/miniHtml';
import { dummyCursor } from '../../webView/cursor/cursor';
import { WireActionWithWaitAndRec } from '../../agentic/types';
import {
  ActionApi,
  BrowserActions,
  DEFAULT_TIMEOUT_MS,
} from '../../webView/actions';
import { type EventWithDelay, ToMainIpc } from '../../contracts/toMain';
import '../../webView/preload.d.ts';
import { Util } from '../../webView/util';
import { takeScreenshot } from '../../webView/screenshot';
import type { RunEverConfig } from '../../main/runeverConfigStore';
import { CommonUtil } from '../../utils/common';

const webViewHandler = {
  frameId: '',
  htmlParser: undefined as MiniHtml.Parser | undefined,
  getHtmlParser() {
    if (!this.htmlParser || this.htmlParser.idPrefix !== `${this.frameId}:`)
      this.htmlParser = new MiniHtml.Parser(`${this.frameId}:`);
    return this.htmlParser;
  },
  getIdFromEl(el: Element, checkChildIfNotFound = true) {
    if (!this.htmlParser || this.htmlParser.idPrefix !== `${this.frameId}:`)
      this.htmlParser = new MiniHtml.Parser(`${this.frameId}:`);
    return this.htmlParser.getIdByEl(el, checkChildIfNotFound);
  },
  getHtml(
    select: MiniHtml.Selector | null = null,
    outerLevel = 0,
    idPrefix: string = '®',
  ) {
    if (!this.htmlParser || this.htmlParser.idPrefix !== idPrefix)
      this.htmlParser = new MiniHtml.Parser(idPrefix);
    if (select) {
      return dummyCursor.hide(() =>
        this.htmlParser!.genHtmlFormId(select, outerLevel),
      );
    }
    return dummyCursor.hide(() => this.htmlParser!.genFullHtml());
  },
  getDeltaHtml(idPrefix: string) {
    if (!this.htmlParser || this.htmlParser.idPrefix !== idPrefix)
      this.htmlParser = new MiniHtml.Parser();
    return dummyCursor.hide(() => this.htmlParser!.genDeltaHtml());
  },
  getEl(select: MiniHtml.Selector) {
    if (!this.htmlParser) this.htmlParser = new MiniHtml.Parser();
    return this.htmlParser.getElementFormId(select);
  },
  async execActions(
    actions: WireActionWithWaitAndRec[],
    args: Record<string, string>,
  ) {
    if (actions.length) {
      await BrowserActions.execActions(actions, args);
    }
  },
  async screenshot() {
    await takeScreenshot('test.png');
  },
  secrets: {} as Record<string, RunEverConfig['arguments'][number]>,
  domainSecrets: {} as Record<string, RunEverConfig['arguments'][number]>,
  domainSecretArgs: {} as Record<string, string>,
  setSecret(secrets: Record<string, RunEverConfig['arguments'][number]>) {
    this.secrets = secrets;
  },
  getSecretArgs(): Record<string, string> {
    return this.domainSecretArgs;
  },
  filterSecret() {
    console.log('filterSecret', this.secrets);
    this.domainSecrets = CommonUtil.filterArgDomain(
      this.secrets,
      window.location.origin,
    );
    for (const [key, value] of Object.entries(this.domainSecrets)) {
      this.domainSecretArgs[key] = value.value;
    }
  },
};

window.webView = webViewHandler;

let actionResolverId = 0;
const actionResolvers: Record<number, (value: any) => void> = {};
const sendAction: <K extends keyof ActionApi>(
  action: K,
  args: Parameters<ActionApi[K]>[0],
) => ReturnType<ActionApi[K]> = (action, args) => {
  return new Promise((resolve) => {
    actionResolvers[actionResolverId] = resolve;
    const msg: FromIframeMessages = {
      type: 'IFRAME_ACTION',
      id: actionResolverId++,
      action,
      args,
      frameId: webViewHandler.frameId,
    };
    window.parent.postMessage(msg, '*');
  }) as ReturnType<ActionApi[typeof action]>;
};

BrowserActions.setActionApi({
  actionDone: (args: {
    actionId: number;
    argsDelta?: Record<string, string> | undefined;
  }) => {
    return sendAction('actionDone', args);
  },
  actionError: (args: { actionId: number; error: string }) => {
    return sendAction('actionError', args);
  },
  dispatchNativeKeypress: (args: {
    keyAndDelays: [ToMainIpc.NativeKeys, number][];
  }) => {
    return sendAction('dispatchNativeKeypress', args);
  },
  dispatchEvents: (args: { events: EventWithDelay[] }) => {
    console.log('dispatchEvents from iframe', args);
    return sendAction('dispatchEvents', args);
  },
  pasteInput: (args: { input: string }) => {
    return sendAction('pasteInput', args);
  },
  setInputFile: (args: { selector: string; filePaths: string[] }) => {
    return sendAction('setInputFile', args);
  },
  download: (args: { url: string; filename: string | undefined }) => {
    return sendAction('download', args);
  },
});

window.addEventListener(
  'message',
  async (event: MessageEvent<ToIframeMessages>) => {
    // console.log('got message in iframe', event.data);
    switch (event.data.type) {
      case 'GET_HTML': {
        const { frameId, select, outerLevel } = event.data;
        webViewHandler
          .getHtml(select, outerLevel, `${frameId}:`)
          .then((html) => {
            window.parent.postMessage(
              {
                type: 'IFRAME_HTML',
                html,
                frameId,
              },
              '*',
            );
          })
          .catch(console.error);
        break;
      }
      case 'GET_DELTA_HTML': {
        const { frameId } = event.data;
        webViewHandler
          .getDeltaHtml(`${frameId}:`)
          .then((html) => {
            window.parent.postMessage(
              {
                type: 'IFRAME_DELTA_HTML',
                html,
                frameId,
              },
              '*',
            );
          })
          .catch(console.error);
        break;
      }
      case 'EXEC_ACTIONS': {
        const { frameId, clientX, clientY, actions, args } = event.data;
        webViewHandler.frameId = frameId;
        dummyCursor.moveToXY(clientX, clientY);
        await webViewHandler.execActions(actions, args);
        break;
      }
      case 'ACTION_RESULT':
        if (event.data.actionIframeId === webViewHandler.frameId) {
          actionResolvers[event.data.id]?.(event.data.result);
        } else {
          MiniHtml.iframeById[event.data.actionIframeId]?.sendMessage(
            event.data,
          );
        }
        break;
      case 'WAIT_DOM': {
        const { frameId, selector, appear } = event.data;
        let waitPromise: Promise<void> | undefined;
        if (appear) {
          waitPromise = BrowserActions.checkDomAppear(selector);
        } else {
          waitPromise = BrowserActions.checkDomDisappear(selector);
        }
        let error: Extract<
          FromIframeMessages,
          { type: 'IFRAME_WAIT_DOM_DONE' }
        >['error'];
        if (
          waitPromise &&
          (await Util.awaitWithTimeout(waitPromise, DEFAULT_TIMEOUT_MS)) ===
            Util.WaitTimeout
        ) {
          error = 'timeout';
        }
        window.parent.postMessage(
          {
            type: 'IFRAME_WAIT_DOM_DONE',
            error,
            frameId,
          },
          '*',
        );
      }
      case 'PING':
        // const events = [];
        // for (const property in window) {
        //   if (property.startsWith('on')) {
        //     events.push(property);
        //     (window as any)[property] = (ev: any) => {
        //       console.log('iframe', property, ev);
        //     };
        //   }
        // }
        const { frameId } = event.data;
        webViewHandler.frameId = frameId;
        window.parent.postMessage(
          {
            type: 'IFRAME_PONG',
            frameId,
            url: window.location.href,
          },
          '*',
        );
        window.addEventListener('popstate', () => {
          window.parent.postMessage(
            {
              type: 'IFRAME_UNLOAD',
              frameId,
            },
            '*',
          );
        });
        break;
      default:
        console.warn('unknow to iframe message', event.data);
        break;
    }
  },
);
window.addEventListener('load', () => {
  window.webView.filterSecret();
});
