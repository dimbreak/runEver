import { type MouseInputEvent, type MouseWheelInputEvent } from 'electron';
import { buildHumanCursorPath } from './path';
import { ToMainIpc } from '../../contracts/toMain';
import { Util } from '../util';

type MouseInputEventWithDelay = MouseInputEvent & { delayMs: number };
type MouseWheelInputEventWithDelay = MouseWheelInputEvent & {
  scrollEl: string;
  delayMs: number;
};

const randomPos = () => Math.random() * 0.5 + 0.25;

class DummyCursor {
  x: number;
  y: number;
  dom: HTMLDivElement | null = null;
  constructor() {
    this.x = randomPos() * window.innerWidth;
    this.y = randomPos() * window.innerHeight;
  }
  init(x: number, y: number) {
    if (x !== -1) {
      this.x = x;
    }
    if (y !== -1) {
      this.y = y;
    }
    this.dom = document.createElement('div');
    this.dom.id = 'runEver-dummy-cursor';
    this.dom.style.position = 'fixed';
    this.dom.style.zIndex = '9999999';
    this.dom.style.top = `${this.y}px`;
    this.dom.style.left = `${this.x}px`;
    this.dom.style.width = '20px';
    this.dom.style.height = '20px';
    // svg by puppylinux https://github.com/puppylinux-woof-CE/puppy_icon_theme
    this.dom.innerHTML = `<svg width="20px" height="20px" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" version="1.1"><path style="stroke:#111;stroke-width:4;fill:#ddd;" d="M 5,5 90,30 65,50 95,80 80,95 50,65 30,90 z"/></svg>`;
    document.body.appendChild(this.dom);
    window.runEverDummyCursor = this.dom;
  }
  async scrollTo(el: Element, rect?: DOMRect) {
    const { x, y } = rect ?? el.getBoundingClientRect();
    const scorllAdjust = await Util.scrollAdjustmentLock.wait;
    let clientHeight: number;
    let clientWidth: number;
    let scrollEl = '';
    if (el === document.body) {
      clientHeight = window.innerHeight;
      clientWidth = window.innerWidth;
    } else {
      clientHeight = el.clientHeight;
      clientWidth = el.clientWidth;
      scrollEl = '';
    }
    let offsetY =
      y < 0 || y > clientHeight ? y - clientHeight * randomPos() : 0;
    let offsetX = x < 0 || x > clientWidth ? x - clientWidth * randomPos() : 0;
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
        deltaX: deltaX * scorllAdjust,
        deltaY: 0,
        x: this.x,
        y: this.y,
        delayMs: 60 + Math.random() * 60,
        scrollEl,
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
        deltaY: deltaY * scorllAdjust,
        x: this.x,
        y: this.y,
        delayMs: 60 + Math.random() * 60,
        scrollEl,
      });
      offsetY -= deltaY;
      if (offsetY === 0 || Math.abs(offsetY) < deltaYAbs) {
        break;
      }
    }
    await ToMainIpc.dispatchEvents.invoke({
      frameId: window.frameId!,
      events,
    });
    await Util.sleep(100);
    return { x: scrolledX - offsetX, y: scrolledY - offsetY };
  }
  async mouseEvent(
    action: MouseInputEvent['type'] | 'click' | 'dblclick',
    el?: Element,
  ) {
    const { x: clientX, y: clientY } = this;
    if (el) {
      const rect = el.getBoundingClientRect();
      const { x, y, width, height } = rect;
      if (
        clientX < x ||
        clientX > x + width ||
        clientY < y ||
        clientY > y + height
      ) {
        await this.moveToEl(el, rect);
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
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
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
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 1,
          },
          {
            type: 'mouseDown',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 2,
          },
          {
            type: 'mouseUp',
            button: 'left',
            x: this.x,
            y: this.y,
            delayMs: Math.random() * 50 + 50,
            clickCount: 2,
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
          },
        ];
    }
    await ToMainIpc.dispatchEvents.invoke({
      frameId: window.frameId!,
      events,
    });
  }
  async moveToEl(el: Element, rect?: DOMRect) {
    const thisRect = rect ?? el.getBoundingClientRect();
    let { x, y } = thisRect;
    const { width, height } = thisRect;
    if (x > window.innerWidth || y > window.innerHeight) {
      const scrolled = await this.scrollTo(document.body, thisRect);
      x -= scrolled.x;
      y -= scrolled.y;
    }
    const { timesMs, points } = buildHumanCursorPath(
      { x: this.x, y: this.y },
      { x: x + width * randomPos(), y: y + height * randomPos() },
      {
        durationMs: 300 + Math.random() * 200,
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
    await ToMainIpc.dispatchEvents.invoke({
      frameId: window.frameId!,
      events,
    });
    const lastPoint = points[points.length - 1];
    this.moveToXY(lastPoint.x, lastPoint.y);
  }
  moveToXY(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.dom!.style.top = `${y + 1}px`;
    this.dom!.style.left = `${x + 1}px`;
  }
}

export const dummyCursor = new DummyCursor();
