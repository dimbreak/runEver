import { getUniqueSelector, replaceJsTpl } from './selector';
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
  }) => Promise<boolean>;
  actionError: (args: { actionId: number; error: string }) => Promise<boolean>;
  dispatchNativeKeypress: (args: {
    keyAndDelays: [ToMainIpc.NativeKeys, number][];
  }) => Promise<boolean>;
  dispatchEvents: (args: { events: EventWithDelay[] }) => Promise<boolean>;
  pasteInput: (args: { input: string }) => Promise<boolean>;
  setInputFile: (args: {
    selector: string;
    filePaths: string[];
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
  const waitAction = async (wait: WireWait | undefined) => {
    if (wait) {
      let waitPromise;
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
        default:
          throw new Error('Unknown wait type');
      }
      console.log('wait', wait, waitPromise);
      if (
        waitPromise &&
        (await Util.awaitWithTimeout(
          waitPromise,
          wait.to ?? DEFAULT_TIMEOUT_MS,
        )) === Util.WaitTimeout
      ) {
        throw ErrWaitTimeout;
      }
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
      argsDelta?: Record<string, string>,
    ) => {
      if (lastPopedActionId === actionId) return;
      lastPopedActionId = actionId;
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
    let argsDelta: Record<string, string> | undefined;
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
      argsDelta = undefined;
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
          }
          case 'setCtx':
            // todo
            break;
          default:
            console.warn('Unknown action', action);
        }
        if (rec.pre) {
          await waitAction(rec.pre);
        }
        window.onbeforeunload = onbeforeunload(rec.id);
        await execFn(action, rec.risk, args);
        window.onbeforeunload = null;
        if (rec.post) {
          await waitAction(rec.post);
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
    argsDelta: Record<string, string> = {},
  ) => {
    const { kv } = action;
    // eslint-disable-next-line no-loop-func
    Object.entries(kv).forEach(([k, v]) => {
      if (typeof v === 'string') {
        args[k] = replaceJsTpl(v, args);
      } else if (typeof v === 'object') {
        const el = action.el ?? getElementById(v.q, risk, args);
        if (!v.attr) {
          args[k] = el.textContent ?? '';
        } else if (v.attr === 'textContent') {
          args[k] = el.textContent ?? '';
        } else {
          args[k] = el.getAttribute(v.attr) ?? '';
        }
      }
      argsDelta[k] = args[k];
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
        window.location.href = replaceJsTpl(action.u, args);
    }
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
    if (document.activeElement !== el && el !== document.body) {
      console.log('focus', action, el);
      await dummyCursor.mouseEvent('click', el);
    }
    const values =
      typeof action.v === 'string'
        ? [replaceJsTpl(action.v, args)]
        : action.v.map((v) => replaceJsTpl(v, args));
    if (el.tagName === 'SELECT') {
      const select = el as HTMLSelectElement;
      let pick = async (updownPress: number, key: ToMainIpc.NativeKeys) => {
        const keyAndDelays: [ToMainIpc.NativeKeys, number][] = [];
        for (let i = 0; i < updownPress; i++) {
          keyAndDelays.push([key, Math.random() * 60 + 60]);
        }
        await (
          await actionApi
        ).dispatchNativeKeypress({
          keyAndDelays: [...keyAndDelays, ['Enter', 0]],
        });
      };
      let currentPosition = select.selectedIndex;
      const modifier = Util.isMac ? 'meta' : 'ctrl';
      if (select.multiple) {
        pick = async (updownPress: number, key: ToMainIpc.NativeKeys) => {
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
              keyCode: 'Space',
              delayMs: Math.random() * 60 + 60,
            },
            {
              type: 'char',
              keyCode: 'Space',
              delayMs: Math.random() * 60 + 60,
            },
            {
              type: 'keyUp',
              keyCode: 'Space',
              delayMs: Math.random() * 60 + 60,
            },
          );
          await (
            await actionApi
          ).dispatchEvents({
            events,
          });
        };
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
    } else if (el.getAttribute('type') === 'file') {
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
    } else if (values[0].length < 64 && SAFE_KEYPRESS_RE.test(values[0])) {
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
