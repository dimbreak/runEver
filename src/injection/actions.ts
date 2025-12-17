import { WireAction } from './roles/system/executor.schema';
import { querySelectAll, replaceJsTpl } from './selector';
import { dummyCursor } from './cursor/cursor';
import { ToMainIpc } from '../contracts/toMain';
import { BrowserActionRisk } from './roles/system/planner.schema';
import { Util } from './util';

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

export namespace BrowserActions {
  export const runSet = async (
    actions: WireAction[],
    args: Record<string, string>,
    isContinue = false,
  ) => {
    if (!isContinue) {
      await ToMainIpc.setActions.invoke({
        frameId: window.frameId!,
        actions,
        args,
      });
    }
    let canContinue = true;
    const popAction = async () =>
      ToMainIpc.popAction.invoke({
        frameId: window.frameId!,
        completed: 1,
        args,
      });
    const onbeforeunload = () => {
      canContinue = false;
      popAction();
    };
    for (const action of actions) {
      if (!canContinue) {
        console.log('actions not continue');
        break;
      }
      console.log('actions continue', action);
      window.onbeforeunload = onbeforeunload;
      switch (action.k) {
        case 'url':
          await navigate(action, 'l', args);
          break;
        case 'dragAndDrop':
          await dragAndDrop(action, 'l', args);
          break;
        case 'scroll':
          await scroll(action, 'l', args);
          break;
        case 'focus':
          await focus(action, 'l', args);
          break;
        case 'input':
          await input(action, 'l', args);
          break;
        case 'key':
          await key(action, 'l', args);
          break;
        case 'mouse':
          await mouse(action, 'l', args);
          break;
        default:
          console.warn('Unknown action', action);
      }
      window.onbeforeunload = null;
      await popAction();
      await Util.sleep(100);
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
