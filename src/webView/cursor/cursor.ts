import { type MouseInputEvent, type MouseWheelInputEvent } from 'electron';
import { buildHumanCursorPath } from './path';
import { Util } from '../util';
import { BrowserActions } from '../actions';

type MouseInputEventWithDelay = MouseInputEvent & { delayMs: number };
type MouseWheelInputEventWithDelay = MouseWheelInputEvent & {
  delayMs: number;
};

const randomPos = () => Math.random() * 0.5 + 0.25;

const overflowRx = /(auto|scroll)/;
const ifScrollable = (el: Element) => {
  if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
    const style = getComputedStyle(el);
    return overflowRx.test(`${style.overflowX} ${style.overflowY}`);
  }
  return false;
};

class DummyCursor {
  x: number;
  y: number;
  inIframe = false;
  constructor() {
    this.x = randomPos() * window.innerWidth;
    this.y = randomPos() * window.innerHeight;
  }
  init(x: number, y: number, inIframe = true) {
    if (x !== -1) {
      this.x = x;
    }
    if (y !== -1) {
      this.y = y;
    }
    this.inIframe = inIframe;
  }
  isTopElementOrChild(target: Element, x: number, y: number) {
    const elementFromPoint = this.hide(() => document.elementFromPoint(x, y));
    return (
      !!elementFromPoint &&
      (elementFromPoint === target || target.contains(elementFromPoint))
    );
  }
  findScrollableElToAvoid(target: Element | Window) {
    const { body } = document;
    let el: Element | null = document.elementFromPoint(this.x, this.y);
    let lastScrollableEl: Element | null = null;
    while (el && el !== target && el !== body) {
      const style = getComputedStyle(el);
      if (
        (el.scrollHeight > el.clientHeight ||
          el.scrollWidth > el.clientWidth) &&
        overflowRx.test(`${style.overflowX} ${style.overflowY}`)
      ) {
        lastScrollableEl = el;
      }
      el = el.parentElement;
    }
    return lastScrollableEl;
  }
  async scrollToEl(el: Element, scrollOver?: Element) {
    const toScrollEls: (Element | Window)[] = [];
    const { body } = document;
    if (scrollOver && ifScrollable(scrollOver)) {
      toScrollEls.push(scrollOver);
    } else {
      let elToCheck = el.parentElement;
      while (elToCheck) {
        if (elToCheck === body) {
          if (
            window.innerWidth < body.scrollWidth ||
            window.innerHeight < body.scrollHeight
          ) {
            toScrollEls.push(window);
          }
          break;
        }
        if (ifScrollable(elToCheck)) {
          toScrollEls.push(elToCheck);
        }
        elToCheck = elToCheck.parentElement;
      }
    }
    if (toScrollEls.length) {
      const toScrollXy = calculateScrollAdjustments(el, toScrollEls);
      console.log('toScrollXy', toScrollXy);
      let scrolledX = 0;
      let scrolledY = 0;
      for (let i = toScrollXy.length - 1; i > -1; i--) {
        const [containerEl, xToContainer, yToContainer] = toScrollXy[i];
        const { x, y } = await this.scrollTo(
          new DOMRect(xToContainer, yToContainer, 0, 0),
          containerEl,
          true,
        );
        scrolledX += x;
        scrolledY += y;
      }
      return { x: scrolledX, y: scrolledY };
    }
    return { x: 0, y: 0 };
  }
  async scrollTo(
    rectOrEl: DOMRect | Element,
    scrollOver: Element | Window,
    exact = false,
  ) {
    const scrollToEl = rectOrEl instanceof Element;
    let { x: scrollToX, y: scrollToY } = scrollToEl
      ? rectOrEl.getBoundingClientRect()
      : rectOrEl;
    const scrollAdjust = await Util.scrollAdjustmentLock.wait; // mac maybe reverse
    let clientHeight: number;
    let clientWidth: number;
    let overX = 0;
    let overY = 0;
    let currentScrollLeft = 0;
    let currentScrollTop = 0;
    let scrollWidth = 0;
    let scrollHeight = 0;
    if (scrollOver instanceof Window) {
      clientHeight = window.innerHeight;
      clientWidth = window.innerWidth;
      currentScrollLeft = window.scrollX;
      currentScrollTop = window.scrollY;
      scrollWidth = document.body.scrollWidth;
      scrollHeight = document.body.scrollHeight;
    } else {
      clientHeight = scrollOver.clientHeight;
      clientWidth = scrollOver.clientWidth;
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { x, y } = scrollOver.getBoundingClientRect();
      overX = x;
      overY = y;
      currentScrollLeft = scrollOver.scrollLeft;
      currentScrollTop = scrollOver.scrollTop;
      scrollWidth = scrollOver.scrollWidth;
      scrollHeight = scrollOver.scrollHeight;
    }
    scrollToX = Math.max(
      -currentScrollLeft,
      Math.min(scrollWidth - clientWidth, scrollToX),
    );
    scrollToY = Math.max(
      -currentScrollTop,
      Math.min(scrollHeight - clientHeight, scrollToY),
    );
    let offsetX =
      exact || scrollToX < 0 || scrollToX > clientWidth ? scrollToX : 0;
    let offsetY =
      exact || scrollToY < 0 || scrollToY > clientHeight ? scrollToY : 0;
    if (scrollToEl) {
      scrollToX -= overX;
      scrollToY -= overY;
      offsetX =
        exact || scrollToX < 0 || scrollToX > clientWidth
          ? scrollToX - clientWidth * randomPos()
          : 0;
      offsetY =
        exact || scrollToY < 0 || scrollToY > clientHeight
          ? scrollToY - clientHeight * randomPos()
          : 0;
    }
    if (offsetX === 0 && offsetY === 0) {
      return { x: 0, y: 0 };
    }
    if (
      this.x > overX + clientWidth ||
      this.x < overX ||
      this.y > overY + clientHeight ||
      this.y < overY
    ) {
      await this.moveToRect(
        new DOMRect(overX + clientWidth / 2, overY + clientHeight / 2, 0, 0),
        true,
      );
    }
    let avoidEl: Element | null = this.findScrollableElToAvoid(scrollOver);
    let retryCount = 0;
    while (avoidEl) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { x, y, width, height } = avoidEl.getBoundingClientRect();
      let rectToMove: DOMRect;
      if (retryCount < 2 && x > overX) {
        rectToMove = new DOMRect((x - overX) / 2 + overX, this.y, 0, 0);
      } else if (retryCount < 2 && y > overY) {
        rectToMove = new DOMRect(this.x, (y - overY) / 2 + overY, 0, 0);
      } else if (retryCount < 2 && x + width < overX + clientWidth) {
        rectToMove = new DOMRect(
          (overX + clientWidth - x - width) / 2 + x + width,
          this.y,
          0,
          0,
        );
      } else if (retryCount < 2 && y + height < overY + clientHeight) {
        rectToMove = new DOMRect(
          this.x,
          (overY + clientHeight - y - height) / 2 + y + height,
          0,
          0,
        );
      } else {
        // impossible to scroll by mousewheel
        scrollOver.scrollTo({
          left: currentScrollLeft + scrollToX,
          top: currentScrollTop + scrollToY,
          behavior: 'smooth',
        });
        await Util.sleep(200);
        return {
          x: scrollToX,
          y: scrollToY,
        };
      }
      retryCount++;
      await this.moveToRect(rectToMove);
      avoidEl = this.findScrollableElToAvoid(scrollOver);
    }
    const scrolledX = offsetX;
    const scrolledY = offsetY;
    // eslint-disable-next-line no-nested-ternary
    const deltaX = offsetX === 0 ? 0 : offsetX > 0 ? 36 : -36;
    // eslint-disable-next-line no-nested-ternary
    const deltaY = offsetY === 0 ? 0 : offsetY > 0 ? 36 : -36;
    const deltaYAbs = Math.abs(deltaY);
    const deltaXAbs = Math.abs(deltaX);
    const events: MouseWheelInputEventWithDelay[] = [];
    while (offsetX !== 0) {
      events.push({
        type: 'mouseWheel',
        deltaX: deltaX * scrollAdjust,
        deltaY: 0,
        x: this.x,
        y: this.y,
        delayMs: 60 + Math.random() * 60,
      });
      offsetX -= deltaX;
      if (offsetX === 0 || Math.abs(offsetX) < deltaXAbs) {
        break;
      }
    }
    while (offsetY !== 0) {
      events.push({
        type: 'mouseWheel',
        deltaX: 0,
        deltaY: deltaY * scrollAdjust,
        x: this.x,
        y: this.y,
        delayMs: 1 + Math.random() * 50,
      });
      offsetY -= deltaY;
      if (offsetY === 0 || Math.abs(offsetY) < deltaYAbs) {
        break;
      }
    }
    console.log(
      'scrollTo events',
      events,
      exact,
      currentScrollLeft + scrollToX,
      currentScrollTop + scrollToY,
      currentScrollLeft,
      currentScrollTop,
    );
    await BrowserActions.callActionApi({
      action: 'dispatchEvents',
      args: {
        events,
      },
    });
    await Util.sleep(100);
    if (exact) {
      console.log(
        'exact',
        scrollOver,
        exact,
        currentScrollLeft + scrollToX,
        currentScrollTop + scrollToY,
      );
      scrollOver.scrollTo({
        left: currentScrollLeft + scrollToX,
        top: currentScrollTop + scrollToY,
        behavior: 'smooth',
      });
      await Util.sleep(200);
      return { x: scrolledX, y: scrolledY };
    }
    return { x: scrolledX - offsetX, y: scrolledY - offsetY };
  }
  async mouseEvent(
    action: MouseInputEvent['type'] | 'click' | 'dblclick',
    elOrRect?: Element | DOMRect,
    repeat: number = 0,
    modifiers: MouseInputEvent['modifiers'] = undefined,
    allowCovered = false,
  ) {
    let { x: clientX, y: clientY } = this;
    if (elOrRect) {
      let rect: DOMRect;
      if (elOrRect instanceof Element) {
        let thisEl = elOrRect as HTMLElement;
        if (thisEl instanceof HTMLElement) {
          // avoid miss click on inline irregular element rect el
          while (
            thisEl.children.length &&
            window.getComputedStyle(thisEl).display === 'inline'
          ) {
            thisEl = thisEl.children[0] as HTMLElement;
          }
        }
        rect = thisEl.getBoundingClientRect();
        console.log('mouseEvent el', action, thisEl, rect);
      } else {
        rect = elOrRect;
      }
      const { x, y, width, height } = rect;
      if (height === 0 || width === 0) {
        console.log('mouseEvent target rect is zero', elOrRect, rect);
        throw new Error('mouseEvent target size is zero');
      }
      if (
        clientX < x ||
        clientX > x + width ||
        clientY < y ||
        clientY > y + height
      ) {
        await this.moveToRect(elOrRect, true);
        clientX = this.x;
        clientY = this.y;
      }
      if (elOrRect instanceof Element) {
        if (
          !allowCovered &&
          !this.isTopElementOrChild(elOrRect, clientX, clientY)
        ) {
          throw new Error('mouseEvent target is covered');
        }
      }
    }
    let events: MouseInputEventWithDelay[] = [];
    switch (action) {
      case 'click':
        events = [
          {
            type: 'mouseDown',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: 0,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
        ];
        break;
      case 'dblclick':
        events = [
          {
            type: 'mouseDown',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: 0,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseDown',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: clientX,
            y: clientY,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
        ];
        break;
      case 'mouseEnter':
      case 'mouseMove':
        return;
      default:
        events = [
          {
            type: action,
            x: clientX,
            y: clientY,
            delayMs: 0,
            modifiers,
          },
        ];
    }
    console.log('mouseEvent', action, events);
    if (repeat > 1) {
      events[0].delayMs = Math.random() * 150 + 150;
      const toClone = events.slice();
      for (let i = 1; i < repeat; i++) {
        events.push(...toClone);
      }
      events[0] = { ...events[0], delayMs: 0 };
    }
    await BrowserActions.callActionApi({
      action: 'dispatchEvents',
      args: {
        events,
      },
    });
  }
  async moveToRect(rectOrEl: DOMRect | Element, exact = false, retry = 0) {
    const thisRect =
      rectOrEl instanceof Element ? rectOrEl.getBoundingClientRect() : rectOrEl;
    let { x, y } = thisRect;
    const { width, height } = thisRect;
    if (
      x + width > window.innerWidth ||
      y + height > window.innerHeight ||
      x < 0 ||
      y < 0
    ) {
      let scrolled: { x: number; y: number };
      if (rectOrEl === thisRect) {
        thisRect.x =
          x < 0
            ? Math.max(-window.scrollX, x - 20)
            : Math.max(0, x - window.innerWidth / 2);
        thisRect.y =
          y < 0
            ? Math.max(-window.scrollY, y - 20)
            : Math.max(0, y - window.innerHeight / 2);
        scrolled = await this.scrollTo(thisRect, window, exact);
      } else {
        scrolled = await this.scrollToEl(rectOrEl as Element);
      }
      x -= scrolled.x;
      y -= scrolled.y;
    }
    if (this.inIframe) {
      const event: MouseInputEventWithDelay = {
        type: 'mouseMove',
        x: x + width * randomPos(),
        y: y + height * randomPos(),
        delayMs: 0,
      };
      await BrowserActions.callActionApi({
        action: 'dispatchEvents',
        args: {
          events: [event],
        },
      });
      this.moveToXY(event.x, event.y);
      return;
    }
    const { timesMs, points } = buildHumanCursorPath(
      { x: this.x, y: this.y },
      { x: x + width * randomPos(), y: y + height * randomPos() },
      {
        // durationMs: 300 + Math.random() * 200,
        hz: 30,
        jitterPx: 1.2,
        overshootChance: 0.45,
      },
    );
    let offsetMs = 0;
    const events = points.map((point, idx) => {
      const delayMs = timesMs[idx] - offsetMs;
      offsetMs += delayMs;
      return {
        type: 'mouseMove',
        x: point.x,
        y: point.y,
        delayMs,
      } as MouseInputEventWithDelay;
    });
    await BrowserActions.callActionApi({
      action: 'dispatchEvents',
      args: {
        events,
      },
    });
    const lastPoint = points[points.length - 1];
    this.moveToXY(lastPoint.x, lastPoint.y);
    if (retry < 3) {
      if (rectOrEl === thisRect) {
        const diffX = Math.abs(thisRect.x - lastPoint.x);
        const diffY = Math.abs(thisRect.y - lastPoint.y);
        if (thisRect.width) {
          if (diffX > thisRect.width || diffY > thisRect.height) {
            console.log('rect move rect', diffX, diffY, width, height);
            await this.moveToRect(thisRect, exact, retry + 1);
          }
        } else if (diffX > 20 || diffY > 20) {
          console.log('rect move', diffX, diffY);
          await this.moveToRect(thisRect, exact, retry + 1);
        }
      } else if (
        !this.isTopElementOrChild(rectOrEl as Element, lastPoint.x, lastPoint.y)
      ) {
        console.log('rect move el', rectOrEl);
        await this.moveToRect(rectOrEl, exact, retry + 1);
      }
    }

    await Util.sleep(100);
  }
  moveToXY(x: number, y: number) {
    console.log('moveToXY', x, y, this.x, this.y);
    this.x = x;
    this.y = y;
  }
  hide<T>(fn: () => T): T {
    return fn();
  }

  async textSelection(srcEl: Element, txt: string) {
    const range = findTextRange(srcEl, txt);
    if (!range) {
      console.warn('textSelection: text not found', txt);
      return;
    }
    const rects = range.getClientRects();
    if (rects.length === 0) {
      console.warn('textSelection: no rects for range', txt);
      return;
    }

    const startRect = rects[0];
    const endRect = rects[rects.length - 1];

    const startEl =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const endEl =
      range.endContainer instanceof Element
        ? range.endContainer
        : range.endContainer.parentElement;
    let elAtPoint = document.elementFromPoint(startRect.x, startRect.y);

    if (elAtPoint !== startEl) {
      await this.scrollToEl(startEl!);
    }

    // Click start
    await this.mouseEvent(
      'click',
      new DOMRect(startRect.left, startRect.top + startRect.height / 2, 0, 0),
    );

    elAtPoint = document.elementFromPoint(endRect.x, endRect.y);

    if (elAtPoint !== endEl) {
      await this.scrollToEl(endEl!);
    }

    // Shift click end
    await this.mouseEvent(
      'click',
      new DOMRect(endRect.right, endRect.top + endRect.height / 2, 0, 0),
      0,
      ['shift'],
    );
  }
}

function findTextRange(root: Element, txt: string): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node: Node | null;
  const textNodes: Text[] = [];
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  const fullText = textNodes.map((n) => n.textContent).join('');
  const startIndex = fullText.indexOf(txt);
  if (startIndex === -1) return null;
  const endIndex = startIndex + txt.length;

  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  let currentIndex = 0;
  for (const textNode of textNodes) {
    const nodeLength = textNode.textContent?.length ?? 0;
    const nextIndex = currentIndex + nodeLength;

    if (!startNode && startIndex >= currentIndex && startIndex < nextIndex) {
      startNode = textNode;
      startOffset = startIndex - currentIndex;
    }

    if (!endNode && endIndex > currentIndex && endIndex <= nextIndex) {
      endNode = textNode;
      endOffset = endIndex - currentIndex;
    }

    if (startNode && endNode) break;
    currentIndex = nextIndex;
  }

  if (startNode && endNode) {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }
  return null;
}

export const dummyCursor = new DummyCursor();

function calculateScrollAdjustments(
  target: Element,
  containers: (Element | Window)[],
): [Element | Window, number, number][] {
  const currentTargetRect = target.getBoundingClientRect();

  const virtualTarget = {
    left: currentTargetRect.left,
    right: currentTargetRect.right,
    top: currentTargetRect.top,
    bottom: currentTargetRect.bottom,
    width: currentTargetRect.width,
    height: currentTargetRect.height,
  };

  // 2. 統一容器處理邏輯 (將 window 抽象化)
  const getGeometry = (container: Element | Window) => {
    if (container instanceof Window) {
      return {
        clientWidth: window.innerWidth,
        clientHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        rect: {
          left: 0,
          top: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
        },
        border: { left: 0, top: 0 },
      };
    }
    const rect = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    return {
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
      scrollWidth: container.scrollWidth,
      scrollHeight: container.scrollHeight,
      rect,
      border: {
        left: parseFloat(style.borderLeftWidth) || 0,
        top: parseFloat(style.borderTopWidth) || 0,
      },
    };
  };

  const results: [Element | Window, number, number][] = [];

  // 3. 由內向外遍歷 (假設輸入 array 已經按 DOM 深度排序，由內到外)
  for (const container of containers) {
    const geo = getGeometry(container);

    // 容器的可視區域 (Viewport of the container)
    const view = {
      left: geo.rect.left + geo.border.left,
      top: geo.rect.top + geo.border.top,
      right: geo.rect.left + geo.border.left + geo.clientWidth,
      bottom: geo.rect.top + geo.border.top + geo.clientHeight,
    };

    let deltaX = 0;
    let deltaY = 0;

    // --- 水平計算 ---
    if (virtualTarget.left < view.left) {
      deltaX =
        virtualTarget.right > view.right ? 0 : virtualTarget.left - view.left;
    } else if (virtualTarget.right > view.right) {
      deltaX =
        virtualTarget.width > geo.clientWidth
          ? virtualTarget.left - view.left
          : virtualTarget.right - view.right;
    }

    // --- 垂直計算 ---
    if (virtualTarget.top < view.top) {
      deltaY =
        virtualTarget.bottom > view.bottom ? 0 : virtualTarget.top - view.top;
    } else if (virtualTarget.bottom > view.bottom) {
      deltaY =
        virtualTarget.height > geo.clientHeight
          ? virtualTarget.top - view.top
          : virtualTarget.bottom - view.bottom;
    }

    // 保存結果
    results.push([container, deltaX, deltaY]);

    // 更新虛擬座標 (供下一層父容器使用)
    virtualTarget.left -= deltaX;
    virtualTarget.right -= deltaX;
    virtualTarget.top -= deltaY;
    virtualTarget.bottom -= deltaY;
  }

  return results;
}
