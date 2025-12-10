import { ipcRenderer } from 'electron';
import { ToMianIpc } from '../ipc/toMain';

export namespace OCRModel {
  type ShowInteractiveOverlayOption = {};
  const INTERACTIVE_SELECTOR = [
    // 原生可點擊 / 輸入
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',

    // ARIA roles（常見 UI framework）
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="combobox"]',

    // 可編輯區域
    '[contenteditable="true"]',
  ].join(',');

  function elementContains(parent: Element, child: Element): boolean {
    while (child !== document.body) {
      if (parent.contains(child)) return true;
      child = child.parentElement;
    }
    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const style = window.getComputedStyle(el);
    if (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      Number(style.opacity) === 0
    ) {
      return null;
    }

    // 粗暴 filter：完全喺 viewport 外面就當暫時唔可見
    if (
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > window.innerHeight ||
      rect.left > window.innerWidth
    ) {
      return null;
    }

    const elAtXY = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

    if (elAtXY && elAtXY !== el && !elementContains(el, elAtXY)) {
      console.log(el, elAtXY);
      return null;
    }

    return rect;
  }

  function getElementLabel(el) {
    // 盡量搵到人類睇得明嘅 label

    // 1. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 2. aria-labelledby 指向其他元素
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        const text = labelEl.textContent.trim();
        if (text) return text;
      }
    }

    // 3. placeholder / alt / title
    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    const alt = el.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    // 4. 自己嘅文字內容
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;

    // 5. input 嘅 value 當 label（例如 button-like input）
    if (el.tagName === 'INPUT') {
      const val = el.value && String(el.value).trim();
      if (val) return val;
    }

    return '';
  }

  function getElementType(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const typeAttr = (el.getAttribute('type') || '').toLowerCase();

    if (tag === 'a') return 'a';
    if (tag === 'button') return 'button';

    if (tag === 'input') {
      if (['button', 'submit', 'reset'].includes(typeAttr)) return 'button';
      if (['checkbox', 'radio'].includes(typeAttr)) return typeAttr;
      if (
        [
          'text',
          'search',
          'email',
          'tel',
          'url',
          'password',
          'number',
        ].includes(typeAttr)
      ) {
        return 'textbox';
      }
      return `input(${typeAttr || 'text'})`;
    }

    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';

    if (role) return `role:${role}`;

    if (el.hasAttribute('contenteditable')) return 'editable';

    if (el.hasAttribute('onclick') || el.hasAttribute('onpointerdown'))
      return 'clickable';

    return 'unknown';
  }

  /**
   * 掃描整個 document，回傳互動元素清單
   * 每個元素包含：
   * - element: DOM node
   * - bbox: { x, y, width, height }
   * - type: string
   * - label: string
   */
  function getInteractiveElements(root = document) {
    const nodes = Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR));

    const elements = [];
    for (const el of nodes) {
      const rect = isVisible(el);
      if (rect) {
        elements.push({
          element: el,
          bbox: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
          type: getElementType(el),
          label: getElementLabel(el),
        });
      }
    }

    return elements;
  }

  // ===== Overlay painter using <canvas> =====

  let overlayCanvas = null;
  let overlayCtx = null;
  let overlayInteractive = [];
  let overlayOptions = null;
  let overlayResizeHandler = null;
  let overlayScrollHandler = null;

  function createOverlayCanvas() {
    if (overlayCanvas) return overlayCanvas;

    const canvas = document.createElement('canvas');
    canvas.id = '__opea_interactive_overlay__';
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '999999'; // 希望蓋到最上層
    canvas.style.mixBlendMode = 'normal';

    document.documentElement.appendChild(canvas);

    overlayCanvas = canvas;
    overlayCtx = canvas.getContext('2d');

    resizeOverlayCanvas();

    return canvas;
  }

  function resizeOverlayCanvas() {
    if (!overlayCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = window.innerWidth * dpr;
    overlayCanvas.height = window.innerHeight * dpr;
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 確保之後用 CSS pixel 畫
  }

  function clearMark() {
    if (!overlayCtx) return;
    overlayCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  /**
   * 把 getInteractiveElements() 的結果畫到 overlay 上
   */
  function markElement(elements, options) {
    if (!overlayCanvas || !overlayCtx) createOverlayCanvas();
    clearMark();

    const {
      font = '12px sans-serif',
      textColor = '#fff',
      labelBgColor = 'rgba(0, 0, 0, 0.8)',
    } = options;

    overlayCtx.font = font;
    overlayCtx.textBaseline = 'top';

    let lastX = 0;
    let lastY = 0;
    const { innerWidth } = window;

    elements.forEach((item, idx) => {
      let { x, y } = item.bbox;
      const overlay = x < lastX && y <= lastY - 13;

      if (item.element.innerText) {
        item.oldStyle = [item.element.style.opacity];
        item.element.style.opacity = '0 !important';
      }

      const labelText = `<${idx + 1}/>`;

      const paddingX = 4;
      const paddingY = 2;
      const textWidth = overlayCtx.measureText(labelText).width;
      const textHeight = 13; // roughly for 12px font

      if (overlay) {
        x = lastX;
      }

      if (x + textWidth > innerWidth) {
        x = innerWidth - textWidth - 4;
      }

      overlayCtx.fillStyle = labelBgColor;
      overlayCtx.fillRect(
        x,
        y,
        textWidth + paddingX * 2,
        textHeight + paddingY * 2,
      );

      overlayCtx.fillStyle = textColor;
      overlayCtx.fillText(labelText, x + paddingX, y + paddingY);

      lastX = x + paddingX + textWidth;
      lastY = y + paddingY + textHeight;
    });
  }

  export function showInteractiveOverlay(options = {}) {
    const elements = getInteractiveElements();
    overlayInteractive = elements;
    overlayOptions = options;

    createOverlayCanvas();
    markElement(elements, options);

    // 自動跟住 resize / scroll 重畫
    if (!overlayResizeHandler) {
      overlayResizeHandler = () => {
        resizeOverlayCanvas();
        overlayInteractive = getInteractiveElements();
        markElement(overlayInteractive, overlayOptions || {});
      };
      window.addEventListener('resize', overlayResizeHandler);
    }
    if (!overlayScrollHandler) {
      overlayScrollHandler = () => {
        // scroll 後元素位置變咗，要重新拿 rect
        overlayInteractive = getInteractiveElements();
        markElement(overlayInteractive, overlayOptions || {});
      };
      window.addEventListener('scroll', overlayScrollHandler, {
        passive: true,
      });
    }

    return hideInteractiveOverlay(elements);
  }

  function hideInteractiveOverlay(elements) {
    return () => {
      if (overlayResizeHandler) {
        window.removeEventListener('resize', overlayResizeHandler);
        overlayResizeHandler = null;
      }
      if (overlayScrollHandler) {
        window.removeEventListener('scroll', overlayScrollHandler);
        overlayScrollHandler = null;
      }

      if (overlayCanvas && overlayCanvas.parentNode) {
        overlayCanvas.parentNode.removeChild(overlayCanvas);
      }
      overlayCanvas = null;
      overlayCtx = null;
      overlayInteractive = [];
      overlayOptions = null;

      elements.forEach((item) => {
        if (item.oldStyle) {
          item.element.style.opacity = item.oldStyle.opacity;
        }
      });
    };
  }
  export const takeScreenshot = async () => {
    console.log('takeScreenshot');
    const {
      scrollX,
      scrollY,
      document: {
        body: {
          style: { overflow },
        },
      },
    } = window;
    document.body.style.overflow = 'hidden';
    const ttlHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    const ttlWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    const vpHeight = window.innerHeight;
    const vpWidth = window.innerWidth;

    const slices: { x: number; y: number }[] = [];
    let offsetY = 0;
    let offsetX = 0;

    while (offsetY < ttlHeight) {
      if (vpWidth < ttlWidth) {
        offsetX = 0;
        while (offsetX < ttlWidth) {
          slices.push({ y: offsetY, x: offsetX });
          offsetX += vpWidth;
        }
      } else {
        slices.push({ y: offsetY, x: 0 });
      }
      offsetY += vpHeight;
    }

    const imgJpgs = await ToMianIpc.takeScreenshot.invoke({
      ttlHeight,
      ttlWidth,
      vpHeight,
      vpWidth,
      slices,
      frameId: window.frameId ?? 0,
    });
    window.scrollTo(scrollX, scrollY);
    document.body.style.overflow = overflow;
    if (Array.isArray(imgJpgs)) {
      const canvas = new OffscreenCanvas(ttlWidth, ttlHeight);
      const ctx = canvas.getContext('2d')!;

      for (const i in imgJpgs) {
        const slice = slices[i];
        const base64Img = Buffer.from(imgJpgs[i]).toString('base64');
        const img = new Image();
        img.src = `data:image/jpeg;base64,${base64Img}`;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            console.log('img loaded', slice);
            ctx.drawImage(img, slice.x, slice.y);
            resolve();
          };
        });
      }

      return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    }
    throw new Error(`Failed to take screenshot: ${imgJpgs.error}`);
  };
}
