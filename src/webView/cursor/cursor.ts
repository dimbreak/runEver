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
  dom: HTMLDivElement | null = null;
  constructor() {
    this.x = randomPos() * window.innerWidth;
    this.y = randomPos() * window.innerHeight;
  }
  init(x: number, y: number, noDom = false) {
    if (x !== -1) {
      this.x = x;
    }
    if (y !== -1) {
      this.y = y;
    }
    if (noDom) return;
    this.dom = document.createElement('div');
    this.dom.id = 'runEver-dummy-cursor';
    this.dom.style.position = 'fixed';
    this.dom.style.zIndex = '9999999';
    this.dom.style.top = `${this.y + 1}px`;
    this.dom.style.left = `${this.x + 1}px`;
    this.dom.style.width = '20px';
    this.dom.style.height = '20px';
    // svg by puppylinux https://github.com/puppylinux-woof-CE/puppy_icon_theme
    this.dom.innerHTML = `<svg width="20px" height="20px" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1"><path style="stroke:#111;stroke-width:4;fill:#ddd;" d="M 5,5 90,30 65,50 95,80 80,95 50,65 30,90 z"/></svg>`;
    document.body.appendChild(this.dom);
    window.electronDummyCursor = this.dom;
  }
  findScrollableElToAvoid(target: Element) {
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
    const toScrollEls: Element[] = [];
    const { body } = document;
    if (scrollOver && ifScrollable(scrollOver)) {
      toScrollEls.unshift(scrollOver);
    } else {
      let elToCheck = el.parentElement;
      while (elToCheck) {
        if (ifScrollable(elToCheck)) {
          toScrollEls.unshift(elToCheck);
        }
        if (elToCheck === body) {
          break;
        }
        elToCheck = elToCheck.parentElement;
      }
    }
    if (toScrollEls.length) {
      toScrollEls.push(el);
      let scrolledX = 0;
      let scrolledY = 0;
      for (let i = 0, c = toScrollEls.length - 1; i < c; i++) {
        const { x, y } = await this.scrollTo(
          toScrollEls[i],
          toScrollEls[i + 1],
        );
        scrolledX += x;
        scrolledY += y;
      }
      return { x: scrolledX, y: scrolledY };
    }
    return { x: 0, y: 0 };
  }
  async scrollTo(rectOrEl: DOMRect | Element, scrollOver: Element) {
    let { x: scrollToX, y: scrollToY } =
      rectOrEl instanceof Element ? rectOrEl.getBoundingClientRect() : rectOrEl;
    const scrollAdjust = await Util.scrollAdjustmentLock.wait; // mac maybe reverse
    let clientHeight: number;
    let clientWidth: number;
    let overX = 0;
    let overY = 0;
    if (scrollOver === document.body) {
      clientHeight = window.innerHeight;
      clientWidth = window.innerWidth;
    } else {
      clientHeight = scrollOver.clientHeight;
      clientWidth = scrollOver.clientWidth;
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { x, y } = scrollOver.getBoundingClientRect();
      overX = x;
      overY = y;
    }
    scrollToX -= overX;
    scrollToY -= overY;
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
    const avoidEl = this.findScrollableElToAvoid(scrollOver);
    if (avoidEl) {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { x, y, width, height } = avoidEl.getBoundingClientRect();
      let rectToMove: DOMRect;
      if (x > overX) {
        rectToMove = new DOMRect((x - overX) / 2, this.y, 0, 0);
      } else if (y > overY) {
        rectToMove = new DOMRect(this.x, (y - overY) / 2, 0, 0);
      } else if (x + width < overX + clientWidth) {
        rectToMove = new DOMRect(
          (overX + clientWidth - x - width) / 2,
          this.y,
          0,
          0,
        );
      } else if (y + height < overY + clientHeight) {
        rectToMove = new DOMRect(
          this.x,
          (overY + clientHeight - y - height) / 2,
          0,
          0,
        );
      } else {
        const { scrollX, scrollY } = window;
        // impossible to scroll by mousewheel
        scrollOver.scrollTo({
          left: scrollToX,
          top: scrollToY,
          behavior: 'smooth',
        });
        return { x: scrollX - scrollToX, y: scrollY - scrollToY };
      }
      await this.moveToRect(rectToMove);
    }
    let offsetY =
      scrollToY < 0 || scrollToY > clientHeight
        ? scrollToY - clientHeight * randomPos()
        : 0;
    let offsetX =
      scrollToX < 0 || scrollToX > clientWidth
        ? scrollToX - clientWidth * randomPos()
        : 0;
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
    await BrowserActions.callActionApi({
      action: 'dispatchEvents',
      args: {
        events,
      },
    });
    await Util.sleep(100);
    return { x: scrolledX - offsetX, y: scrolledY - offsetY };
  }
  async mouseEvent(
    action: MouseInputEvent['type'] | 'click' | 'dblclick',
    el?: Element,
    repeat: number = 0,
    modifiers: MouseInputEvent['modifiers'] = undefined,
  ) {
    const { x: clientX, y: clientY } = this;
    if (el) {
      let thisEl = el as HTMLElement;
      if (thisEl instanceof HTMLElement) {
        // avoid miss click on inline irregular element rect el
        while (
          thisEl.children.length &&
          window.getComputedStyle(thisEl).display === 'inline'
        ) {
          thisEl = thisEl.children[0] as HTMLElement;
        }
      }
      const rect = thisEl.getBoundingClientRect();
      const { x, y, width, height } = rect;
      if (
        clientX < x ||
        clientX > x + width ||
        clientY < y ||
        clientY > y + height
      ) {
        console.log('mouseEvent el', action, thisEl, rect);
        await this.moveToRect(el);
      }
    }
    let events: MouseInputEventWithDelay[] = [];
    switch (action) {
      case 'click':
        events = [
          {
            type: 'mouseDown',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: 0,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
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
            x: this.x,
            y: this.y,
            delayMs: 0,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseDown',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
            modifiers,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
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
            x: this.x,
            y: this.y,
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
  async moveToRect(rectOrEl: DOMRect | Element, exact = false) {
    const thisRect =
      rectOrEl instanceof Element ? rectOrEl.getBoundingClientRect() : rectOrEl;
    console.log('moveToRect', this.x, this.y, thisRect);
    let { x, y } = thisRect;
    const { width, height } = thisRect;
    if (x > window.innerWidth || y > window.innerHeight || x < 0 || y < 0) {
      const scrolled = await (rectOrEl === thisRect
        ? this.scrollTo(thisRect, document.body)
        : this.scrollToEl(rectOrEl as Element));
      x -= scrolled.x;
      y -= scrolled.y;
    }
    if (!this.dom) {
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
      return;
    }
    const { timesMs, points } = buildHumanCursorPath(
      { x: this.x, y: this.y },
      { x: x + width * randomPos(), y: y + height * randomPos() },
      {
        durationMs: 300 + Math.random() * 200,
        hz: 30,
        jitterPx: 1.2,
        overshootChance: exact ? 0 : 0.45,
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
  }
  moveToXY(x: number, y: number) {
    console.log('moveToXY', x, y, this.x, this.y);
    this.x = x;
    this.y = y;
    if (this.dom) {
      this.dom.style.top = `${y + 1}px`;
      this.dom.style.left = `${x + 1}px`;
    }
  }
  hide<T>(fn: () => T): T {
    // During early navigation or fast execPrompt, the preload may not have
    // initialized the dummy cursor DOM yet. In that case, just run without hiding.
    if (!this.dom) return fn();
    this.dom.style.display = 'none';
    const ret = fn();
    this.dom.style.display = '';
    return ret;
  }
}

export const dummyCursor = new DummyCursor();
