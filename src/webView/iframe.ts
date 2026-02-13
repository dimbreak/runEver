import { MouseInputEvent } from 'electron';
import { MiniHtml } from './miniHtml';
import {
  ActionReq,
  FromIframeMessages,
  IframeProgressType,
  ToIframeMessagesTypes,
} from '../extensions/iframe/types';
import { ActionApi, BrowserActions, ErrElementNotSelected } from './actions';
import { EventWithDelay, ToMainIpc } from '../contracts/toMain';
import { Util } from './util';
import { dummyCursor } from './cursor/cursor';
import { WireActionWithWaitAndRec } from '../agentic/types';

if (window.top === window) {
  window.addEventListener('message', (e) => {
    if ((e.data?.type as string | undefined)?.startsWith('IFRAME_')) {
      console.log('iframe message', e.data, MiniHtml.iframeById);
      const msg = e.data as FromIframeMessages;
      const iframe = MiniHtml.iframeById[msg.frameId];
      if (iframe) {
        iframe.handleMsg(msg);
      }
    }
  });
}

export class IFrameHelper {
  url: string;
  active = false;
  static isMainFrame = false;
  constructor(
    public element: HTMLIFrameElement,
    private idVal: string = '',
    public label: string,
    public visibleVal: MiniHtml.DomVisible | null,
    public bodyDepth: number,
    public parent?: MiniHtml.MeaningfulElement,
    public nodes?: (string | MiniHtml.MeaningfulElement)[],
  ) {
    if (label.length > 32) {
      this.label = `${label.slice(0, 32)}...`;
    }
    if (idVal) {
      MiniHtml.iframeById[idVal] = this;
    }
    IFrameHelper.isMainFrame = typeof window.frameId === 'undefined';
    this.active = visibleVal?.visible === true;
    this.url = element.src;
  }
  sendMessage(message: ToIframeMessagesTypes) {
    this.element.contentWindow?.postMessage(
      { ...message, frameId: this.idVal },
      '*',
    );
  }
  get visible() {
    return this.visibleVal;
  }
  set visible(visible: MiniHtml.DomVisible | null) {
    this.visibleVal = visible;
    this.active = visible?.visible === true;
  }
  set id(id: string) {
    if (this.idVal && id !== this.idVal && MiniHtml.iframeById[this.idVal]) {
      delete MiniHtml.iframeById[this.idVal];
    }
    this.idVal = id;
    MiniHtml.iframeById[id] = this;
    this.sendMessage({ type: 'PING' });
    this.element.onload = () => {
      this.sendMessage({ type: 'PING' });
      console.log('iframe loaded', id);
      if (this.active) {
        this.pushProgress(id, 'loaded');
      }
    };
  }
  get id() {
    return this.idVal;
  }
  getVisible(): MiniHtml.DomVisible {
    if (!this.visibleVal) {
      this.visibleVal = MiniHtml.checkVisible(this.element);
    }
    return this.visibleVal;
  }

  htmlPromise: Promise<string> | undefined;
  htmlPromiseResolve: ((html: string) => void) | undefined;

  getHtml(select?: MiniHtml.Selector, outerLevel?: number): Promise<string> {
    if (!this.htmlPromise) {
      const visible = this.getVisible();
      if (visible.visible === true) {
        this.htmlPromise = new Promise((resolve) => {
          this.htmlPromiseResolve = (html: string) => {
            resolve(
              `<iframe src=${this.element.src} id=${this.idVal} label=${MiniHtml.quoteAttrVal(this.label)} xywh=${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.width)},${Math.round(visible.height)}'>${html}</iframe>`,
            );
            this.htmlPromiseResolve = undefined;
            this.htmlPromise = undefined;
          };
          this.sendMessage({
            type: 'GET_HTML',
            select,
            outerLevel,
          });
        });
      } else {
        this.htmlPromise = Promise.resolve(
          `<iframe src=${this.element.src} id=${this.idVal} label=${MiniHtml.quoteAttrVal(this.label)} ${visible.visible === false ? 'hide' : visible.visible} />`,
        );
      }
      console.log('getHtml', this.idVal);
    }
    return this.htmlPromise;
  }

  deltaHtmlPromise: Promise<string> | undefined;
  deltaHtmlPromiseResolve: ((html: string) => void) | undefined;

  getDeltaHtml(): Promise<string> {
    if (!this.deltaHtmlPromise) {
      this.deltaHtmlPromise = new Promise((resolve) => {
        this.deltaHtmlPromiseResolve = (html: string) => {
          resolve(html);
          this.deltaHtmlPromiseResolve = undefined;
          this.deltaHtmlPromise = undefined;
        };
        this.sendMessage({
          type: 'GET_DELTA_HTML',
        });
      });
    }
    return this.deltaHtmlPromise;
  }

  handleMsg(msg: FromIframeMessages) {
    switch (msg.type) {
      case 'IFRAME_HTML':
        this.htmlPromiseResolve?.(msg.html);
        break;
      case 'IFRAME_DELTA_HTML':
        this.deltaHtmlPromiseResolve?.(msg.html);
        break;
      case 'IFRAME_ACTION':
        this.handleActionEvents(msg);
        break;
      case 'IFRAME_PROGRESS':
        this.pushProgress(msg.iframeId, msg.progressType);
        break;
      case 'IFRAME_UNLOAD':
        this.pushProgress(msg.frameId, 'unload');
        break;
      case 'IFRAME_PONG':
        this.url = msg.url;
        break;
      case 'IFRAME_WAIT_DOM_DONE':
        this.checkDomPromiseResolve?.(msg.error);
        break;
      default:
        console.warn('Unknown iframe message type:', msg);
    }
  }

  pushProgress(iframeId: string, type: IframeProgressType) {
    if (IFrameHelper.isMainFrame) {
      ToMainIpc.iframeProgress.invoke({
        frameId: window.frameId!,
        type,
        iframeId,
      });
    } else {
      window.parent.postMessage(
        {
          type: 'IFRAME_PROGRESS',
          iframeId,
          progressType: type,
        },
        '*',
      );
    }
  }

  callActionId = 0;
  actionLock = Util.newLock();

  private async handleActionEvents(
    msg: ActionReq<keyof ActionApi> & {
      frameId: string;
    },
  ) {
    if (msg.action === 'dispatchEvents') {
      if (
        !(await this.adjustMouseEvents(
          (msg as ActionReq<'dispatchEvents'>).args.events,
        ))
      ) {
        // only mouse moved
        this.sendMessage({
          type: 'ACTION_RESULT',
          id: msg.id,
          actionIframeId: msg.frameId,
          result: true,
        });
        return;
      }
    } else if (msg.action === 'actionDone') {
      this.execActionPromiseResolve?.(
        (msg as ActionReq<'actionDone'>).args.argsDelta ?? {},
      );
      (msg as ActionReq<'actionDone'>).args.iframeId = this.idVal;
    } else if (msg.action === 'actionError') {
      this.execActionPromiseResolve?.(
        (msg as ActionReq<'actionError'>).args.error,
      );
      (msg as ActionReq<'actionDone'>).args.iframeId = this.idVal;
    }
    this.actionLock.lock();
    BrowserActions.callActionApi(msg)
      .then((result) => {
        this.actionLock.unlock();
        this.sendMessage({
          type: 'ACTION_RESULT',
          actionIframeId: msg.frameId,
          id: msg.id,
          result,
        });
      })
      .catch((error) => {
        this.actionLock.unlock();
        console.error(error);
      });
  }

  private async adjustMouseEvents(events: EventWithDelay[]) {
    if (events.length && events[0].type.startsWith('mouse')) {
      const mouseEv = events[0] as MouseInputEvent;
      const { x, y, width, height } = this.element.getBoundingClientRect();
      const ratioX = this.element.offsetWidth / width;
      const ratioY = this.element.offsetHeight / height;
      console.log('adjust mouse raw', mouseEv.x, mouseEv.y, ratioX, ratioY);
      mouseEv.x = mouseEv.x * ratioX + x;
      mouseEv.y = mouseEv.y * ratioY + y;
      if (
        IFrameHelper.isMainFrame &&
        (Math.abs(dummyCursor.x - mouseEv.x) > 1 ||
          Math.abs(dummyCursor.y - mouseEv.y) > 1)
      ) {
        await dummyCursor.moveToRect(
          new DOMRect(mouseEv.x, mouseEv.y, 0, 0),
          true,
        );
      }
      console.log('adjust mouse', mouseEv, x, y, ratioX, ratioY);
      if (mouseEv.type === 'mouseMove') {
        return false;
      }
      events.forEach((ev) => {
        if (ev.type.startsWith('mouse')) {
          (ev as MouseInputEvent).x = mouseEv.x;
          (ev as MouseInputEvent).y = mouseEv.y;
        }
      });

      console.log('adjust mouse events', events, x, y, ratioX, ratioY);
    }
    return true;
  }

  execActionPromise: Promise<void> | undefined;
  execActionPromiseResolve:
    | ((result: string | Record<string, string>) => void)
    | undefined;
  async exeAction(
    action: WireActionWithWaitAndRec,
    args: Record<string, string>,
  ) {
    if (this.execActionPromise) {
      await this.execActionPromise;
    }
    if (!this.active) {
      this.active = true;
    }
    this.pushProgress(this.idVal, 'action');
    this.execActionPromise = new Promise<void>((resolve, reject) => {
      this.execActionPromiseResolve = (
        val: string | Record<string, string>,
      ) => {
        this.execActionPromiseResolve = undefined;
        this.execActionPromise = undefined;
        if (typeof val === 'string') {
          reject(new Error(val));
          return;
        }
        Object.assign(args, val);
        resolve();
      };
      const { top, left } = this.getVisible();
      this.sendMessage({
        type: 'EXEC_ACTIONS',
        actions: [action],
        args,
        clientX: dummyCursor.x - left - window.scrollX,
        clientY: dummyCursor.y - top - window.scrollY,
      });
      console.log(
        'execAction',
        action,
        args,
        dummyCursor.x,
        left + window.scrollX,
        dummyCursor.y,
        top + window.scrollY,
      );
    });
    return this.execActionPromise;
  }
  checkDomPromise: Promise<void> | undefined;
  checkDomPromiseResolve: ((error?: string) => void) | undefined;
  async checkDom(selector: MiniHtml.Selector, appear = true) {
    if (this.checkDomPromise) {
      await this.checkDomPromise;
    }
    this.checkDomPromise = new Promise<void>((resolve) => {
      this.checkDomPromiseResolve = (error?: string) => {
        this.checkDomPromiseResolve = undefined;
        this.checkDomPromise = undefined;
        if (error) {
          switch (error) {
            case 'id-not-found':
              throw ErrElementNotSelected;
            case 'timeout':
              throw BrowserActions.ErrWaitTimeout;
            default:
          }
        }
        resolve();
      };
      this.sendMessage({
        type: 'WAIT_DOM',
        selector,
        appear,
      });
    });
    return this.checkDomPromise;
  }
}
