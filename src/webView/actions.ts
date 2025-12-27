import {
  WireAction,
  WireActionWithWaitAndRisk,
  WireWait,
} from '../main/llm/roles/system/executor.schema';
import { querySelectAll, replaceJsTpl } from './selector';
import { dummyCursor } from './cursor/cursor';
import { ToMainIpc } from '../contracts/toMain';
import { BrowserActionRisk } from '../main/llm/roles/system/planner.schema';
import { Util } from './util';
import { Network } from './network';
import { getHtmlFromNode } from './html';

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
  return els[0] as HTMLElement;
};

const TypingDelayMsHalf = 60;

const SAFE_KEYPRESS_RE = /^[a-zA-Z0-9 `~!@#$%^&*()\-_=+[\]{};:'",.<>/?]*$/;

const DEFAULT_TIMEOUT_MS = 10000;

export namespace BrowserActions {
  export const ErrWaitTimeout = new Error('Run action wait timeout');
  let runningActionSet: WireActionWithWaitAndRisk[] | null = null;
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
  export const execActions = async (
    actions: WireActionWithWaitAndRisk[],
    args: Record<string, string>,
  ) => {
    if (runningActionSet?.length) {
      const lastId = runningActionSet[runningActionSet.length - 1].id;
      const toAdd = actions.filter((a) => a.id > lastId);
      console.log('actions added', actions.length, toAdd);
      runningActionSet.push(...toAdd);
      return;
    }
    runningActionSet = actions;

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
        if (action.pre) {
          await waitAction(action.pre);
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
          case 'input': // audit
            await input(action, action.risk, args);
            break;
          case 'key': // audit
            await key(action, action.risk, args);
            break;
          case 'mouse': // audit
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
        if (action.post) {
          await waitAction(action.post);
        }
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
        break;
      }

      c = actions.length;
      console.log('actions continue', action, c);
    }
    runningActionSet = null;
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
    action: Extract<WireActionWithWaitAndRisk, { k: 'input' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = getElement(action.q, risk, args);
    if (document.activeElement !== el && el !== document.body) {
      await dummyCursor.mouseEvent('click', el);
    }
    const value = replaceJsTpl(action.v, args);
    if (action.risk === 'h') {
      if (!(await auditBeforeEvents(action, action.q, el, { input: value }))) {
        runningActionSet = null;
        return;
      }
    }
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
    action: Extract<WireActionWithWaitAndRisk, { k: 'key' }>,
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

    if (action.risk === 'h') {
      if (
        !(await auditBeforeEvents(action, action.q ?? 'body', el, {
          modifiers: modifiers.join(','),
        }))
      ) {
        runningActionSet = null;
        return;
      }
    }

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
    action: Extract<WireActionWithWaitAndRisk, { k: 'mouse' }>,
    risk: BrowserActionRisk,
    args: Record<string, string> = {},
  ) => {
    const el = getElement(action.q, risk, args);
    if (action.risk === 'h') {
      if (!(await auditBeforeEvents(action, action.q, el))) {
        runningActionSet = null;
        return;
      }
    }
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
  const auditBeforeEvents = async (
    action: WireActionWithWaitAndRisk,
    selector: string,
    el: HTMLElement,
    extraInfo: Record<string, string> = {},
  ): Promise<boolean> => {
    let pickedEl = el;
    if ((el as HTMLInputElement).form) {
      pickedEl = (el as HTMLInputElement).form ?? el.parentElement ?? el;
    } else {
      pickedEl = el.parentElement ?? el;
    }
    const html = await getHtmlFromNode(pickedEl);
    const elHtml = await getHtmlFromNode(el);
    if (html !== elHtml) {
      html.replace(
        elHtml,
        elHtml.replace(/^<([^\s\r\n>]+)/, '<$1 runever-selected="true"'),
      );
    }
    const result = await ToMainIpc.auditAction.invoke({
      frameId: window.frameId!,
      selector,
      actionId: action.id,
      html: await getHtmlFromNode(pickedEl),
      screenshotRect: pickedEl.getBoundingClientRect(),
      extraInfo,
    });
    console.log('audit result', result);
    return result.approved;
  };
}
