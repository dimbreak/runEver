import { BrowserActions } from '../webView/actions';
import { dummyCursor } from '../webView/cursor/cursor';

jest.mock('../webView/actions', () => ({
  BrowserActions: {
    callActionApi: jest.fn().mockResolvedValue(undefined),
  },
}));

if (!global.DOMRect) {
  class FakeDOMRect {
    x: number;

    y: number;

    width: number;

    height: number;

    top: number;

    right: number;

    bottom: number;

    left: number;

    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.right = x + width;
      this.bottom = y + height;
      this.left = x;
    }
  }

  (FakeDOMRect as any).fromRect = ({
    x = 0,
    y = 0,
    width = 0,
    height = 0,
  } = {}) => new FakeDOMRect(x, y, width, height);
  (global as any).DOMRect = FakeDOMRect;
}

const setElementRect = (el: Element, rect: DOMRect) => {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(el, 'getClientRects', {
    configurable: true,
    value: () => [rect],
  });
};

describe('dummyCursor.mouseEvent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.spyOn(console, 'log').mockImplementation(() => {});
    dummyCursor.x = 25;
    dummyCursor.y = 25;
    dummyCursor.inIframe = false;
    (BrowserActions.callActionApi as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts a descendant at the click point', async () => {
    const target = document.createElement('button');
    const child = document.createElement('span');
    target.appendChild(child);
    document.body.appendChild(target);
    setElementRect(target, new DOMRect(10, 10, 80, 40));

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => child),
    });

    await expect(dummyCursor.mouseEvent('click', target)).resolves.toBeUndefined();
    expect(BrowserActions.callActionApi).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'dispatchEvents',
      }),
    );
  });

  it('throws when an unrelated element is on top of the click point', async () => {
    const target = document.createElement('button');
    const overlay = document.createElement('div');
    document.body.append(target, overlay);
    setElementRect(target, new DOMRect(10, 10, 80, 40));

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: jest.fn(() => overlay),
    });

    await expect(dummyCursor.mouseEvent('click', target)).rejects.toThrow(
      'mouseEvent target is covered',
    );
    expect(BrowserActions.callActionApi).not.toHaveBeenCalled();
  });
});
