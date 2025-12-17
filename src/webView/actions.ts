import {
  WireAction,
  WireActionWithWaitAndRisk,
  WireWaitDom,
} from './roles/system/executor.schema';
import { querySelectAll, replaceJsTpl } from './selector';
import { dummyCursor } from './cursor/cursor';
import { ToMainIpc } from '../contracts/toMain';
import { BrowserActionRisk } from './roles/system/planner.schema';
import { Util } from './util';
import { Network } from './network';

export const ErrElementNotSelected = new Error('No element found');
export const ErrMultipleElementsSelectedForHighRisk = new Error(
  'High risk action only accept selector for unique element',
);

const getElement = (
  selector: string,
  risk: BrowserActionRisk,
  args: Record<string, string> = {},
) => {
  const els = querySelectAll(selector, args);
  if (els.length === 0) {
    throw ErrElementNotSelected;
  } else if (els.length > 1 && risk === 'h') {
    throw ErrMultipleElementsSelectedForHighRisk;
  }
  return els[0];
};

const TypingDelayMsHalf = 60;

const SAFE_KEYPRESS_RE = /^[a-zA-Z0-9 `~!@#$%^&*()\-_=+[\]{};:'",.<>/?]*$/;

const DEFAULT_TIMEOUT_MS = 10000;

export namespace BrowserActions {
  export const ErrWaitTimeout = new Error('Run action wait timeout');
  let runningActionSet: WireActionWithWaitAndRisk[] | null = null;
  export const execActions = async (
    actions: WireActionWithWaitAndRisk[],
    args: Record<string, string>,
  ) => {
    if (runningActionSet?.length) {
      runningActionSet.push(...actions);
    } else {
      runningActionSet = actions;
    }
    let canContinue = true;
    let lastPopedActionId = -1;
    const popAction = async (
      actionId: number,
      argsDelta?: Record<string, string>,
    ) => {
      if (lastPopedActionId === actionId) return;
      lastPopedActionId = actionId;
      return ToMainIpc.actionDone.invoke({
        frameId: window.frameId!,
        actionId,
        argsDelta,
      });
    };
    const onbeforeunload = (i: number) => () => {
      canContinue = false;
      popAction(i);
    };
    let action: WireActionWithWaitAndRisk;
    const checkDomDisappear = async (selector: string) => {
      let el = document.querySelector(selector);
      while (true) {
        if (
          !el ||
          el.getBoundingClientRect().height === 0 ||
          window.getComputedStyle(el).opacity === '0'
        ) {
          return;
        }
        await Util.sleep(100);
        el = document.querySelector(selector);
      }
    };
    const checkDomAppear = async (selector: string) => {
      let el = document.querySelector(selector);
      while (true) {
        if (
          el &&
          el.getBoundingClientRect().height > 0 &&
          window.getComputedStyle(el).opacity !== '0'
        ) {
          return;
        }
        await Util.sleep(100);
        if (!el) {
          el = document.querySelector(selector);
        }
      }
    };
    let argsDelta: Record<string, string> | undefined;
    for (let i = 0, c = actions.length; i < c; i++) {
      if (!canContinue) {
        console.log('actions not continue');
        break;
      }
      action = actions[i];
      argsDelta = undefined;
      console.log('actions continue', action);
      try {
        if (action.w) {
          let waitPromise;
          switch (typeof action.w) {
            case 'number':
              await Util.sleep(action.w);
              break;
            case 'string':
              if (action.w === 'idle0') {
                waitPromise = Network.networkIdle0.wait;
              } else if (action.w === 'idle2') {
                waitPromise = Network.networkIdle2.wait;
              }
              break;
            case 'object': {
              const wait = action.w as WireWaitDom;
              waitPromise =
                wait.t === 'appear'
                  ? checkDomAppear(wait.q)
                  : checkDomDisappear(wait.q);
            }
            default:
              throw new Error('Unknown wait type');
          }
          console.log('wait', action.w, waitPromise);
          if (
            waitPromise &&
            (await Util.awaitWithTimeout(
              waitPromise,
              action.to ?? DEFAULT_TIMEOUT_MS,
            )) === Util.WaitTimeout
          ) {
            throw ErrWaitTimeout;
          }
        }
        window.onbeforeunload = onbeforeunload(action.id);
        switch (action.k) {
          case 'url':
            await navigate(action, action.risk, args);
            break;
          case 'dragAndDrop':
            await dragAndDrop(action, action.risk, args);
            break;
          case 'scroll':
            await scroll(action, action.risk, args);
            break;
          case 'focus':
            await focus(action, action.risk, args);
            break;
          case 'input':
            await input(action, action.risk, args);
            break;
          case 'key':
            await key(action, action.risk, args);
            break;
          case 'mouse':
            await mouse(action, action.risk, args);
            break;
          case 'setArgument': {
            const { v } = action;
            if (!v && action.rc) {
              const el = getElement(action.rc, action.risk, args);
              if (!action.attr) {
                args[action.a] = el.textContent ?? '';
              } else {
                args[action.a] = el.getAttribute(action.attr) ?? '';
              }
            } else {
              args[action.a] = v ?? '';
            }
            argsDelta = { [action.a]: args[action.a] };
            console.log('setArgument', action, args[action.a]);
          }
          case 'setCtx':
            // todo
            break;
          default:
            console.warn('Unknown action', action);
        }
        window.onbeforeunload = null;
        await popAction(action.id, argsDelta);
      } catch (e) {
        await ToMainIpc.actionError.invoke({
          frameId: window.frameId!,
          actionId: action.id,
          error:
            e instanceof Error
              ? `${e.message}: ${JSON.stringify(e)}`
              : JSON.stringify(e),
        });
        canContinue = false;
      }

      c = actions.length;
    }
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
    action: Extract<WireAction, { k: 'dragAndDrop' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const srcEl = getElement(action.sq, risk, args);
    if (action.dq) {
      const destEl = getElement(action.dq, risk, args);
      await dummyCursor.mouseEvent('mouseDown', srcEl);
      await dummyCursor.moveToEl(destEl);
      await dummyCursor.mouseEvent('mouseUp');
    } else {
      await dummyCursor.mouseEvent('mouseDown', srcEl);
      await dummyCursor.moveToEl(
        document.body,
        new DOMRect(action.mv?.x ?? 0, action.mv?.y ?? 0, 0, 0),
      );
      await dummyCursor.mouseEvent('mouseUp');
    }
  };
  export const scroll = async (
    action: Extract<WireAction, { k: 'scroll' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    await dummyCursor.scrollTo(
      action.q ? getElement(action.q, risk, args) : document.body,
      new DOMRect(action.x ?? 0, action.y ?? 0, 0, 0),
    );
  };
  export const focus = async (
    action: Extract<WireAction, { k: 'focus' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = getElement(action.q, risk, args);
    await dummyCursor.mouseEvent('click', el);
  };
  export const input = async (
    action: Extract<WireAction, { k: 'input' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = getElement(action.q, risk, args);
    if (document.activeElement !== el && el !== document.body) {
      await dummyCursor.mouseEvent('click', el);
    }
    const value = replaceJsTpl(action.v, args);
    if (value.length < 64 && SAFE_KEYPRESS_RE.test(value)) {
      await ToMainIpc.dispatchEvents.invoke({
        frameId: window.frameId!,
        events: value.split('').flatMap((keyCode) => [
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
      await ToMainIpc.pasteInput.invoke({
        frameId: window.frameId!,
        input: value,
      });
    }
  };
  export const key = async (
    action: Extract<WireAction, { k: 'key' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = action.q ? getElement(action.q, risk, args) : document.body;
    if (document.activeElement !== el && el !== document.body) {
      await dummyCursor.mouseEvent('click', el);
    }
    const modifiers: Array<
      'shift' | 'control' | 'ctrl' | 'alt' | 'meta' | 'command' | 'cmd'
    > = [];
    if (action.al === true) modifiers.push('alt');
    if (action.c === true) modifiers.push('control');
    if (action.m === true) modifiers.push('meta');
    if (action.s === true) modifiers.push('shift');

    await ToMainIpc.dispatchEvents.invoke({
      frameId: window.frameId!,
      events:
        action.a === 'keyPress'
          ? [
              {
                type: 'keyDown',
                keyCode: action.key,
                modifiers,
              },
              {
                type: 'char',
                keyCode: action.key,
                delayMs: 0,
                modifiers,
              },
              {
                type: 'keyUp',
                keyCode: action.key,
                delayMs: Math.random() * TypingDelayMsHalf + TypingDelayMsHalf,
                modifiers,
              },
            ]
          : [
              {
                type: action.a,
                keyCode: action.key,
                modifiers,
              },
            ],
    });
  };
  export const mouse = async (
    action: Extract<WireAction, { k: 'mouse' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = getElement(action.q, risk, args);
    switch (action.a) {
      case 'click':
      case 'dblclick':
      case 'mouseDown':
      case 'mouseUp':
      case 'mouseEnter':
      case 'mouseMove':
        await dummyCursor.mouseEvent(action.a, el);
        break;
      case 'mouseover':
        await dummyCursor.moveToEl(el);
        break;
      default:
        break;
    }
  };
}
