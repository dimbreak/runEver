import { MouseInputEvent } from 'electron';
import { MiniHtml } from './miniHtml';
import {
  ActionReq,
  FromIframeMessages,
  ToIframeMessagesTypes,
} from '../extensions/iframe/types';
import { ActionApi, BrowserActions, ErrElementNotSelected } from './actions';
import { EventWithDelay } from '../contracts/toMain';
import { Util } from './util';
import { dummyCursor } from './cursor/cursor';
import { WireActionWithWaitAndRec } from '../agentic/types';

if (window.top === window) {
  window.addEventListener('message', (e) => {
    console.log('iframe message', e.data, MiniHtml.iframeById);
    if ((e.data?.type as string | undefined)?.startsWith('IFRAME_')) {
      const msg = e.data as FromIframeMessages;
      const iframe = MiniHtml.iframeById[msg.frameId];
      if (iframe) {
        iframe.handleMsg(msg);
      }
    }
  });
}

export class IFrameHelper {
  constructor(
    public element: HTMLIFrameElement,
    private idVal: string = '',
    public label: string,
    public visible: MiniHtml.DomVisible | null,
    public bodyDepth: number,
    public parent?: MiniHtml.MeaningfulElement,
    public nodes?: (string | MiniHtml.MeaningfulElement)[],
  ) {
    if (idVal) {
      MiniHtml.iframeById[idVal] = this;
    }
  }
  sendMessage(message: ToIframeMessagesTypes) {
    this.element.contentWindow?.postMessage(
      { ...message, frameId: this.idVal },
      '*',
    );
  }
  set id(id: string) {
    if (this.idVal && id !== this.idVal && MiniHtml.iframeById[this.idVal]) {
      delete MiniHtml.iframeById[this.idVal];
    }
    this.idVal = id;
    MiniHtml.iframeById[id] = this;
    this.sendMessage({ type: 'PING' });
  }
  get id() {
    return this.idVal;
  }
  getVisible(): MiniHtml.DomVisible {
    if (!this.visible) {
      this.visible = MiniHtml.checkVisible(this.element);
    }
    return this.visible;
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
      case 'IFRAME_WAIT_DOM_DONE':
        this.checkDomPromiseResolve?.(msg.error);
        break;
      default:
        console.warn('Unknown iframe message type:', msg);
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
          result: true,
        });
        return;
      }
    } else if (msg.action === 'actionDone') {
      this.execActionPromiseResolve?.(
        (msg as ActionReq<'actionDone'>).args.argsDelta ?? {},
      );
    }
    this.actionLock.lock();
    BrowserActions.callActionApi(msg)
      .then((result) => {
        this.actionLock.unlock();
        this.sendMessage({
          type: 'ACTION_RESULT',
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
      mouseEv.x = mouseEv.x * ratioX + x;
      mouseEv.y = mouseEv.y * ratioY + y;
      await dummyCursor.moveToRect(
        new DOMRect(mouseEv.x, mouseEv.y, 0, 0),
        true,
      );
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
    | ((result: Record<string, string>) => void)
    | undefined;
  async exeAction(
    action: WireActionWithWaitAndRec,
    args: Record<string, string>,
  ) {
    if (this.execActionPromise) {
      await this.execActionPromise;
    }
    this.execActionPromise = new Promise<void>((resolve) => {
      this.execActionPromiseResolve = (val: Record<string, string>) => {
        this.execActionPromiseResolve = undefined;
        this.execActionPromise = undefined;
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
