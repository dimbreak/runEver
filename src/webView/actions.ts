import { getUniqueSelector } from './selector';
import { dummyCursor } from './cursor/cursor';
import type { EventWithDelay, ToMainIpc } from '../contracts/toMain';
import { BrowserActionRisk } from '../main/llm/roles/system/planner.schema';
import { Util } from './util';
import { Network } from './network';
import { WireAction, WireWait } from '../agentic/execution.schema';
import { WireActionWithWaitAndRec } from '../agentic/types';
import { MiniHtml } from './miniHtml';
import { SliderProfile } from '../agentic/profile/widget/slider.webView';
import { IFrameHelper } from './iframe';
import { CommonUtil } from '../utils/common';
import { takeScreenshot } from './screenshot';

export const ErrElementNotSelected = new Error('No element found');
export const ErrMultipleElementsSelectedForHighRisk = new Error(
  'High risk action only accept selector for unique element',
);

//
// const getElement = (
//   selector: string,
//   risk: BrowserActionRisk,
//   args: Record<string, string> = {},
// ) => {
//   const els = querySelectAll(selector, args);
//   if (els.length === 0) {
//     throw ErrElementNotSelected;
//   } else if (els.length > 1 && risk === 'h') {
//     throw ErrMultipleElementsSelectedForHighRisk;
//   }
//   return els[0] as HTMLElement;
// };

export type ActionApi = {
  actionDone: (args: {
    actionId: number;
    argsDelta?: Record<string, string>;
    iframeId?: string;
  }) => Promise<boolean>;
  actionError: (args: {
    actionId: number;
    error: string;
    iframeId?: string;
  }) => Promise<boolean>;
  dispatchNativeKeypress: (args: {
    keyAndDelays: [ToMainIpc.NativeKeys, number][];
  }) => Promise<boolean>;
  dispatchEvents: (args: { events: EventWithDelay[] }) => Promise<boolean>;
  pasteInput: (args: { input: string }) => Promise<boolean>;
  setInputFile: (args: {
    selector: string;
    filePaths: string[];
  }) => Promise<{ error?: string }>;
  download: (args: {
    url: string;
    filename: string | undefined;
  }) => Promise<{ error?: string }>;
};

export type ActionApiCallingReq<K extends keyof ActionApi> = {
  action: K;
  args: Parameters<ActionApi[K]>[0];
};

export type WireActionToExec = WireAction & { el?: Element };

const TypingDelayMsHalf = 40;

const SAFE_KEYPRESS_RE = /^[a-zA-Z0-9 `~!@#$%^&*()\-_=+[\]{};:'",.<>/?]*$/;

export const DEFAULT_TIMEOUT_MS = 10000;

export namespace BrowserActions {
  let actionApiResolver: (value: ActionApi) => void;
  const actionApi: Promise<ActionApi> = new Promise((resolve) => {
    actionApiResolver = resolve;
  });
  export const setActionApi: (value: ActionApi) => void = (value) => {
    actionApiResolver!(value);
  };
  export const callActionApi = async <K extends keyof ActionApi>(
    req: ActionApiCallingReq<K>,
  ) => {
    return (await actionApi)[req.action](req.args as any) as any;
  };
  export const ErrWaitTimeout = new Error('Run action wait timeout');
  let runningActionSet: WireActionWithWaitAndRec[] | null = null;
  export const checkDomDisappear = async (selector: MiniHtml.Selector) => {
    let el = window.webView.getEl(selector);
    if (el instanceof IFrameHelper) {
      return el.checkDom(selector, false);
    }
    while (true) {
      if (
        !el.element ||
        el.element.getBoundingClientRect().height === 0 ||
        window.getComputedStyle(el.element).opacity === '0'
      ) {
        return;
      }
      await Util.sleep(100);
      el = window.webView.getEl(selector);
    }
  };
  export const getElementById = (
    selector: MiniHtml.Selector,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = window.webView.getEl(selector);
    if (el instanceof IFrameHelper) {
      throw ErrElementNotSelected;
    }
    if (!el?.element) {
      throw ErrElementNotSelected;
    }
    return el.element;
  };
  export const checkDom = async (
    t: 'childAdd', // Extract<WireWait, { t: 'domLongTime' }>['a'],
    toMonitor: MiniHtml.Selector,
  ) => {
    const el =
      toMonitor instanceof Element
        ? toMonitor
        : window.webView.getEl(toMonitor)?.element;
    if (el) {
      const started = Date.now();
      let to: any = null;
      await new Promise<void>((resolve) => {
        const observer = new MutationObserver((mutations) => {
          console.log('waitMsg', mutations);
          for (const mutation of mutations) {
            switch (t) {
              // case 'attr':
              //   if (mutation.type === 'attributes') {
              //     r();
              //     return;
              //   }
              //   break;
              // case 'childRm':
              //   if (mutation.removedNodes.length) {
              //     r();
              //     return;
              //   }
              //   break;
              case 'childAdd':
                if (mutation.addedNodes.length) {
                  if (to) {
                    clearTimeout(to);
                  }
                  if (Date.now() - started < 500) {
                    console.log('waitMsg suspect self message', toMonitor);
                    // may comes from user themselves, but shorten timeout avoid false negative
                    to = setTimeout(() => {
                      console.log('waitMsg suspect self message to', toMonitor);
                      r();
                    }, 30000);
                    return;
                  }
                  console.log('waitMsg complete', toMonitor);
                  r();
                  return;
                }
                break;
              // case 'txt':
              //   if (mutation.type === 'characterData') {
              //     r();
              //     return;
              //   }
              //   break;
              // case 'any':
              //   r();
              //   return;
            }
          }
        });
        const r = () => {
          resolve();
          observer.disconnect();
        };
        observer.observe(el, {
          attributes: true,
          childList: true,
          characterData: true,
        });
      });
    }
  };
  export const checkDomAppear = async (selector: MiniHtml.Selector) => {
    let el = window.webView.getEl(selector);
    if (el instanceof IFrameHelper) {
      return el.checkDom(selector);
    }
    while (true) {
      if (
        el.element &&
        el.element.getBoundingClientRect().height > 0 &&
        window.getComputedStyle(el.element).opacity !== '0'
      ) {
        return;
      }
      await Util.sleep(100);
      if (!el) {
        el = window.webView.getEl(selector);
      }
    }
  };
  const waitAction = async (
    wait: WireWait,
    args: Record<string, string>,
    argDelta: [string, string][],
  ) => {
    let waitPromise;
    let waitTime = DEFAULT_TIMEOUT_MS;
    switch (wait.t) {
      case 'time':
        await Util.sleep(wait.ms);
        break;
      case 'network':
        if (wait.a === 'idle0') {
          waitPromise = Network.waitForNetworkIdle0();
        } else if (wait.a === 'idle2') {
          waitPromise = Network.networkIdle2.wait;
        }
        break;
      case 'waitMsg':
        argDelta.push(
          ['waitMsg1stId', wait.id1st],
          ['waitMsgLastId', wait.idLast],
        );
        args.waitMsg1stId = wait.id1st;
        args.waitMsgLastId = wait.idLast;

        waitPromise = checkDom('childAdd', wait.q);
        waitTime = 300000; // wait for longer
        break;
      // case 'domLongTime':
      //   waitPromise = checkDom(wait.a, wait.q);
      //   waitTime = 300000; // wait for longer
      //   break;
      case 'appear':
        waitPromise = checkDomAppear(wait.q);
        break;
      case 'disappear':
        waitPromise = checkDomDisappear(wait.q);
        break;
      case 'navigation':
        if (wait.url === window.location.href) {
          return; // let it re-push after navigation
        }
        break;
    }
    console.log('wait', wait, waitPromise, waitTime);
    if (
      waitPromise &&
      (await Util.awaitWithTimeout(waitPromise, wait.to ?? waitTime)) ===
        Util.WaitTimeout
    ) {
      throw ErrWaitTimeout;
    }
  };
  const execInIframeOrEl = async (
    action: WireActionWithWaitAndRec & { action: WireActionToExec },
    selector: MiniHtml.Selector,
    args: Record<string, string>,
  ) => {
    const el = window.webView.getEl(selector);
    if (el instanceof IFrameHelper) {
      await el.exeAction(action, args);
      return true;
    }
    action.action.el = el.element;
    return false;
  };
  export const execActions = async (
    actions: WireActionWithWaitAndRec[],
    args: Record<string, string>,
  ) => {
    if (runningActionSet?.length) {
      const lastId = runningActionSet[runningActionSet.length - 1].id;
      const toAdd = actions.filter((a) => a.id > lastId);
      console.log('actions added', actions.length, toAdd);
      runningActionSet.push(...toAdd);
      return;
    }
    window.webView.getHtmlParser(); // make sure html parser is ready before actions start
    runningActionSet = actions;

    let canContinue = true;
    let lastPopedActionId = -1;
    const popAction = async (
      actionId: number,
      argsDeltaEntries?: [string, string][],
    ) => {
      if (lastPopedActionId === actionId) return;
      lastPopedActionId = actionId;
      const argsDelta = argsDeltaEntries?.reduce(
        (acc, e) => {
          acc[e[0]] = e[1];
          return acc;
        },
        {} as Record<string, string>,
      );
      return (await actionApi).actionDone({
        actionId,
        argsDelta,
      });
    };
    const onbeforeunload = (i: number) => () => {
      canContinue = false;
      popAction(i);
    };
    let rec: WireActionWithWaitAndRec;
    let action: WireActionToExec;
    let argsDelta: [string, string][];
    let execFn: (
      action: any,
      risk: BrowserActionRisk,
      args?: Record<string, string>,
    ) => Promise<void> = async () => {};
    for (let i = 0, c = actions.length; i < c; i++) {
      if (!canContinue) {
        console.log('actions not continue');
        break;
      }
      rec = actions[i];
      action = rec.action;
      argsDelta = [];
      console.log('actions continue', action);
      try {
        switch (action.k) {
          case 'url':
            execFn = navigate;
            break;
          case 'dragAndDrop':
            if (await execInIframeOrEl(rec, action.sq, args)) {
              continue;
            }
            execFn = dragAndDrop;
            break;
          case 'scroll':
            if (
              !Array.isArray(action.to) &&
              (await execInIframeOrEl(rec, action.to, args))
            ) {
              continue;
            }
            execFn = scroll;
            break;
          case 'focus':
            if (await execInIframeOrEl(rec, action.q, args)) {
              continue;
            }
            execFn = focus;
            break;
          case 'input': // audit
            if (await execInIframeOrEl(rec, action.q, args)) {
              continue;
            }
            execFn = input;
            break;
          case 'key': // audit
            if (action.q && (await execInIframeOrEl(rec, action.q, args))) {
              continue;
            }
            execFn = key;
            break;
          case 'mouse': // audit
            if (await execInIframeOrEl(rec, action.q, args)) {
              continue;
            }
            execFn = mouse;
            break;
          case 'slideToVal': // audit
            if (await execInIframeOrEl(rec, action.q, args)) {
              continue;
            }
            execFn = SliderProfile.slideToVal;
            break;
          case 'setArg': {
            // each setArg will have only 1 kv get from selector
            const firstV = Object.values(action.kv).find(
              (v) => typeof v === 'object',
            );
            if (firstV && (await execInIframeOrEl(rec, firstV.q, args))) {
              continue;
            }
            // eslint-disable-next-line no-loop-func
            execFn = async (thisAction, risk, thisArgs) => {
              setArgs(thisAction, risk, thisArgs, argsDelta);
            };
            break;
          }
          case 'screenshot': {
            if (action.a && (await execInIframeOrEl(rec, action.a, args))) {
              continue;
            }
            const { filename } = action;
            // eslint-disable-next-line no-loop-func
            execFn = async (thisAction, risk, thisArgs) => {
              takeScreenshot(filename, action.el);
            };
            break;
          }
          case 'download':
            if (await execInIframeOrEl(rec, action.a, args)) {
              continue;
            }
            let url = '';
            const { filename } = action;
            if (action.el) {
              console.log('download', action.el);
              switch (action.t) {
                case 'link':
                  if (action.el.tagName === 'A') {
                    url = action.el.getAttribute('href') ?? '';
                    console.log('download link', url);
                  }
                  break;
                case 'img':
                  if (action.el.tagName === 'IMG') {
                    url = action.el.getAttribute('src') ?? '';
                  }
                  break;
                case 'bg-img':
                  const style = window.getComputedStyle(action.el);
                  if (style.backgroundImage) {
                    url =
                      /url\((['"]?)(.+)\1\)/.exec(style.backgroundImage)?.[2] ??
                      '';
                  }
                  break;
              }
              if (url) {
                try {
                  url = new URL(url, window.location.href).href;
                } catch {
                  // ignore invalid url
                }
              } else {
                throw new Error('not downloadable');
              }
            } else {
              throw new Error('link not found');
            }
            // eslint-disable-next-line no-loop-func
            execFn = async () => {
              const p = callActionApi({
                action: 'download',
                args: {
                  url,
                  filename: filename ?? undefined,
                },
              });
              if (filename) {
                await p; // assume use in downstream prompt
              }
            };
            break;
          case 'selectTxt':
            if (await execInIframeOrEl(rec, action.q, args)) {
              continue;
            }
            execFn = selectTxt;

          case 'setCtx':
            // todo
            break;
        }
        if (rec.pre) {
          await waitAction(rec.pre, args, argsDelta);
        }
        window.onbeforeunload = onbeforeunload(rec.id);
        await execFn(action, rec.risk, args);
        window.onbeforeunload = null;
        if (rec.post) {
          await waitAction(rec.post, args, argsDelta);
        }
        await popAction(rec.id, argsDelta);
      } catch (e) {
        await (
          await actionApi
        ).actionError({
          actionId: rec.id,
          error:
            e instanceof Error
              ? `${e.message}: ${JSON.stringify(e)}`
              : JSON.stringify(e),
        });
        canContinue = false;
        break;
      }

      c = actions.length;
      console.log('actions continue', action, c);
    }
    runningActionSet = null;
  };
  export const setArgs = async (
    action: Extract<WireActionToExec, { k: 'setArg' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
    argsDelta: [string, string][] = [],
  ) => {
    const { kv } = action;
    // eslint-disable-next-line no-loop-func
    Object.entries(kv).forEach(([k, v]) => {
      if (typeof v === 'string') {
        const vv = CommonUtil.replaceJsTpl(v, args);
        if (vv === undefined) {
          return;
        }
        if (vv.startsWith('[') || vv.startsWith('{')) {
          try {
            const vvv = CommonUtil.flattenArgs(JSON.parse(vv));
            Object.assign(args, vvv);
          } catch (e) {
            console.warn(e);
            args[k] = vv;
          }
        } else {
          args[k] = vv;
        }
      } else if (typeof v === 'object') {
        const el = action.el ?? getElementById(v.q, risk, args);
        if (!v.attr) {
          args[k] = el.textContent ?? '';
        } else if (v.attr === 'textContent' || v.attr === 'innerText') {
          args[k] = el.textContent ?? '';
        } else {
          args[k] = el.getAttribute(v.attr) ?? '';
        }
      }
      argsDelta.push([k, args[k]]);
    });
    console.log('setArgument', action, argsDelta);
  };
  export const navigate = async (
    action: Extract<WireAction, { k: 'url' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    switch (action.u) {
      case 'next':
        window.history.forward();
        break;
      case 'back':
        window.history.back();
        break;
      case 'reload':
        window.location.reload();
        break;
      default:
        window.location.href = CommonUtil.replaceJsTpl(action.u, args);
    }
  };
  export const selectTxt = async (
    action: Extract<WireActionToExec, { k: 'selectTxt' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const srcEl = action.el ?? getElementById(action.q, risk, args);
    await dummyCursor.selectTxt(srcEl, action.txt);
  };
  export const dragAndDrop = async (
    action: Extract<WireActionToExec, { k: 'dragAndDrop' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const srcEl = action.el ?? getElementById(action.sq, risk, args);
    if (action.dq) {
      const destEl = getElementById(action.dq, risk, args);
      await dummyCursor.mouseEvent('mouseDown', srcEl);
      await dummyCursor.moveToRect(destEl);
      await dummyCursor.mouseEvent('mouseUp');
    } else {
      await dummyCursor.moveToRect(srcEl);
      await dndByPx(
        srcEl,
        action.mv?.x ? dummyCursor.x + action.mv.x : dummyCursor.x,
        action.mv?.y ? dummyCursor.y + action.mv.y : dummyCursor.y,
      );
    }
  };
  export const dndByPx = async (
    el: Element,
    x: number,
    y: number,
    exact = false,
  ) => {
    await dummyCursor.mouseEvent('mouseDown', el);
    await dummyCursor.moveToRect(new DOMRect(x, y, 0, 0), exact);
    await dummyCursor.mouseEvent('mouseUp');
  };
  export const scroll = async (
    action: Extract<WireActionToExec, { k: 'scroll' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const scrollOver = action.over
      ? getElementById(action.over, risk, args)
      : undefined;
    if (Array.isArray(action.to)) {
      await dummyCursor.scrollTo(
        new DOMRect(action.to[0], action.to[1], 0, 0),
        scrollOver ?? document.body,
      );
    } else {
      await dummyCursor.scrollToEl(
        action.el ?? getElementById(action.to, risk, args),
        scrollOver,
      );
    }
  };
  export const focus = async (
    action: Extract<WireActionToExec, { k: 'focus' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = action.el ?? getElementById(action.q, risk, args);
    await dummyCursor.mouseEvent('click', el);
  };
  export const input = async (
    action: Extract<WireActionToExec, { k: 'input' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = action.el ?? getElementById(action.q, risk, args);
    console.log('input', action, el, document.activeElement);
    const typeAttr = el.getAttribute('type');
    const values =
      typeof action.v === 'string'
        ? [CommonUtil.replaceJsTpl(action.v, args) ?? '']
        : action.v.map((v) => CommonUtil.replaceJsTpl(v, args) ?? '');
    if (
      values.length === 1 &&
      ((el as HTMLSelectElement) || HTMLInputElement || HTMLTextAreaElement)
        .value === values[0]
    ) {
      return;
    }
    if (
      document.activeElement !== el &&
      el !== document.body &&
      typeAttr !== 'file'
    ) {
      console.log('focus', action, el);
      await dummyCursor.mouseEvent('click', el);
    }
    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      const pick = Util.isMac
        ? async (updownPress: number, key: ToMainIpc.NativeKeys) => {
            const keyAndDelays: [ToMainIpc.NativeKeys, number][] = [];
            for (let i = 0; i < updownPress; i++) {
              keyAndDelays.push([key, Math.random() * 60 + 60]);
            }
            await (
              await actionApi
            ).dispatchNativeKeypress({
              keyAndDelays: [...keyAndDelays, ['Enter', 0]],
            });
          }
        : async (updownPress: number, key: ToMainIpc.NativeKeys) => {
            const events: EventWithDelay[] = [];
            for (let i = 0; i < updownPress; i++) {
              events.push(
                {
                  type: 'keyDown',
                  keyCode: key.replace('Arrow', ''),
                  modifiers: [modifier],
                  delayMs: Math.random() * 60 + 60,
                },
                {
                  type: 'keyUp',
                  keyCode: key.replace('Arrow', ''),
                  modifiers: [modifier],
                  delayMs: Math.random() * 60 + 60,
                },
              );
            }
            events.push(
              {
                type: 'keyDown',
                keyCode: 'Enter',
                delayMs: Math.random() * 60 + 60,
              },
              {
                type: 'char',
                keyCode: 'Enter',
                delayMs: Math.random() * 60 + 60,
              },
              {
                type: 'keyUp',
                keyCode: 'Enter',
                delayMs: Math.random() * 60 + 60,
              },
            );
            await (
              await actionApi
            ).dispatchEvents({
              events,
            });
          };
      let currentPosition = select.selectedIndex;
      const modifier = Util.isMac ? 'meta' : 'ctrl';
      if (select.multiple) {
        await dummyCursor.mouseEvent('click', undefined, 1, [modifier]); // cancel the option checked on focus
      }
      for (const value of values) {
        const pickedOption = Array.from(select.options).findIndex(
          (opt) => opt.value === value || opt.textContent === value,
        );
        let key = 'ArrowDown';
        let updownPress = pickedOption - currentPosition;
        if (updownPress < 0) {
          updownPress = -updownPress;
          key = 'ArrowUp';
        }
        console.log('select', select, pickedOption, updownPress, key);
        if (pickedOption !== -1) {
          await pick(updownPress, key);
          currentPosition = pickedOption;
        } else {
          throw new Error(`Option not found ${values}`);
        }
      }
    } else if (typeAttr === 'file') {
      const selector = getUniqueSelector(el);
      await (
        await actionApi
      ).dispatchNativeKeypress({
        keyAndDelays: [['Esc', 0]], // cancel file picker
      });
      await (
        await actionApi
      ).setInputFile({
        selector,
        filePaths: values,
      });
    } else {
      if (
        (el as HTMLInputElement).value !== '' &&
        action.c !== 'noClear' &&
        !el.hasAttribute('contentEditable')
      ) {
        const modifierKey = Util.isMac ? 'Meta' : 'Control';
        const modifier = Util.isMac ? 'meta' : 'control';
        setTimeout(() => {
          (el as HTMLInputElement).select();
        }, 150);
        await (
          await actionApi
        ).dispatchEvents({
          // @ts-ignore
          events: [
            {
              type: 'keyDown',
              keyCode: modifierKey,
              delayMs: 0,
            },
            {
              type: 'keyDown',
              keyCode: 'a',
              modifiers: [modifier],
              delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            },
            Util.isMac
              ? null
              : {
                  type: 'char',
                  keyCode: 'a',
                  modifiers: [modifier],
                  delayMs: 0,
                },
            {
              type: 'keyUp',
              keyCode: 'a',
              modifiers: [modifier],
              delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            },
            {
              type: 'keyUp',
              keyCode: modifierKey,
              delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            },
          ].filter((a) => !!a),
        });
      }

      if (values[0].length < 64 && SAFE_KEYPRESS_RE.test(values[0])) {
        await (
          await actionApi
        ).dispatchEvents({
          events: values[0].split('').flatMap((keyCode) => [
            {
              type: 'keyDown',
              keyCode,
              delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            },
            {
              type: 'char',
              keyCode,
              delayMs: 0,
            },
            {
              type: 'keyUp',
              keyCode,
              delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            },
          ]),
        });
      } else {
        await (
          await actionApi
        ).pasteInput({
          input: values[0],
        });
      }
    }
  };
  export const key = async (
    action: Extract<WireActionToExec, { k: 'key' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
    repeat = 0,
  ) => {
    const el = action.q
      ? (action.el ?? getElementById(action.q, risk, args))
      : document.body;
    console.log('key', action, el);
    if (document.activeElement !== el && el !== document.body) {
      await dummyCursor.mouseEvent('click', el);
    }
    const remapKeys: Record<string, string> = {
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
    };
    const mappedKey = remapKeys[action.key] ?? action.key;
    const modifiers: EventWithDelay['modifiers'] = [];
    if (action.al === true) modifiers.push('alt');
    if (action.c === true) modifiers.push('control');
    if (action.m === true) modifiers.push('meta');
    if (action.s === true) modifiers.push('shift');

    const events: EventWithDelay[] = [];
    switch (action.a) {
      case 'keyPress':
        events.push(
          {
            type: 'keyDown',
            keyCode: mappedKey,
            modifiers,
          },
          {
            type: 'char',
            keyCode: mappedKey,
            delayMs: 0,
            modifiers,
          },
          {
            type: 'keyUp',
            keyCode: mappedKey,
            delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            modifiers,
          },
        );
        break;
      case 'keyDownUp':
        events.push(
          {
            type: 'keyDown',
            keyCode: mappedKey,
            modifiers,
          },
          {
            type: 'keyUp',
            keyCode: mappedKey,
            delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
            modifiers,
          },
        );
        break;
      default:
        events.push({
          type: action.a,
          keyCode: mappedKey,
          modifiers,
        });
    }

    if (repeat) {
      events[0].delayMs = Math.random() * 150 + 150;
      const toClone = events.slice();
      for (let i = 1; i < repeat; i++) {
        events.push(...toClone);
      }
      events[0] = { ...events[0], delayMs: 0 };
    }

    await (
      await actionApi
    ).dispatchEvents({
      events,
    });
  };
  export const mouse = async (
    action: Extract<WireActionToExec, { k: 'mouse' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = action.el ?? getElementById(action.q, risk, args);
    console.log('mouse', action, el);
    switch (action.a) {
      case 'click':
      case 'dblclick':
      case 'mouseDown':
      case 'mouseUp':
        await dummyCursor.mouseEvent(action.a, el, action.repeat ?? 0);
        break;
      case 'mouseenter':
      case 'mouseover':
        await dummyCursor.moveToRect(el);
        break;
      default:
        break;
    }
  };
}
