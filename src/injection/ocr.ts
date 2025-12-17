import { ipcRenderer } from 'electron';
import { OcrSpaceLanguages, OcrSpaceResponse } from 'ocr-space-api-wrapper';
import { ToMainIpc } from '../contracts/toMain';
import { takeScreenshot } from './screenshot';

export namespace OCRModel {
  type OverlayOptions = {
    font?: string;
    textColor?: string;
    labelBgColor?: string;
  };

  type InteractiveBBox = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type InteractiveElement = {
    element: HTMLElement;
    bbox: InteractiveBBox;
    type: string;
    oldStyle?: { opacity: string };
  };
  const INTERACTIVE_SELECTOR = [
    // 原生可點擊 / 輸入
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',

    'img[alt], img[title], img[aria-label], img[aria-labelledby]',

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

  function elementContains(parent: Element, child: Element | null): boolean {
    let currentChild = child;
    while (currentChild && currentChild !== document.body) {
      if (parent.contains(currentChild)) return true;
      if (currentChild.parentElement) {
        currentChild = currentChild.parentElement;
      } else {
        break;
      }
    }
    return false;
  }

  function isVisible(el: HTMLElement): DOMRect | null {
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

  function getElementLabel(el: HTMLElement): string {
    // 盡量搵到人類睇得明嘅 label

    // 1. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 2. aria-labelledby 指向其他元素
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent) {
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
    let text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const tagsToIgnore = el.querySelectorAll('script, style, noscript');
    if (tagsToIgnore.length) {
      for (const tag of tagsToIgnore) {
        text = text.replace(tag.textContent, '');
      }
    }
    if (text) return text;

    // 5. input 嘅 value 當 label（例如 button-like input）
    if (el.tagName === 'INPUT') {
      const inputElement = el as HTMLInputElement;
      const val = inputElement.value && String(inputElement.value).trim();
      if (val) return val;
    }

    return '';
  }

  function getElementType(el: HTMLElement): string {
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

    if (role) return `${tag} role:${role}`;

    if (el.hasAttribute('contenteditable')) return `${tag} editable`;

    if (el.hasAttribute('onclick') || el.hasAttribute('onpointerdown'))
      return `${tag} clickable`;

    if (tag === 'img') {
      return el.getAttribute('aria-label') ||
        el.getAttribute('alt') ||
        el.getAttribute('title')
        ? 'img'
        : '';
    }

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
  function getInteractiveElements(
    root: Document | HTMLElement = document,
  ): InteractiveElement[] {
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
    );

    const elements: InteractiveElement[] = [];
    for (const el of nodes) {
      const rect = isVisible(el);
      if (rect) {
        const elType = getElementType(el);
        if (elType) {
          elements.push({
            element: el,
            bbox: {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            },
            type: elType,
          });
        }
      }
    }

    return elements;
  }

  // ===== Overlay painter using <canvas> =====

  const overlayCanvas: HTMLCanvasElement | null = null;
  const overlayCtx: CanvasRenderingContext2D | null = null;

  function resizeOverlayCanvas() {
    if (!overlayCanvas || !overlayCtx) return;
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = window.innerWidth * dpr;
    overlayCanvas.height = window.innerHeight * dpr;
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 確保之後用 CSS pixel 畫
  }

  function markElement(elements: InteractiveElement[]) {
    elements.forEach((item) => {
      item.oldStyle = { opacity: item.element.style.opacity };
      item.element.style.opacity = '0';
    });
  }

  export function hideInteractiveOverlay() {
    const elements = getInteractiveElements();
    markElement(elements);

    return restoreInteractiveOverlay(elements);
  }

  function restoreInteractiveOverlay(
    elements: InteractiveElement[],
  ): () => InteractiveElement[] {
    return () => {
      elements.forEach((item) => {
        if (item.oldStyle) {
          item.element.style.opacity = item.oldStyle.opacity;
        }
      });
      return elements;
    };
  }

  const OCR_SPACE_API_KEY = 'K89415309488957';
  const headers = new Headers();
  headers.append('apikey', OCR_SPACE_API_KEY);
  const OCR_SPACE_LANGUAGE_BY_HTML_LANG: Record<
    string,
    OcrSpaceLanguages | 'tha' | 'ukr' | 'vnm'
  > = {
    ar: 'ara',

    bg: 'bul',

    zh: 'chs',
    'zh-CN': 'chs',
    'zh-SG': 'chs',
    'zh-Hans': 'chs',
    'zh-CHS': 'chs',

    'zh-TW': 'cht',
    'zh-HK': 'cht',
    'zh-MO': 'cht',
    'zh-Hant': 'cht',
    'zh-CHT': 'cht',

    hr: 'hrv',

    cs: 'cze',

    da: 'dan',

    nl: 'dut',

    en: 'eng',
    'en-US': 'eng',
    'en-GB': 'eng',
    'en-UK': 'eng',
    us: 'eng',

    fi: 'fin',

    fr: 'fre',

    de: 'ger',

    el: 'gre',

    hu: 'hun',

    ko: 'kor',
    kr: 'kor',

    it: 'ita',

    ja: 'jpn',
    jp: 'jpn',

    pl: 'pol',

    pt: 'por',
    'pt-BR': 'por',
    'pt-PT': 'por',

    ru: 'rus',

    sl: 'slv',

    es: 'spa',

    sv: 'swe',

    th: 'tha',

    tr: 'tur',

    uk: 'ukr',

    vi: 'vnm',
    vn: 'vnm',
  };

  export type OcrResponse = {
    els: {
      body: string;
      x: number;
      y: number;
    }[];
    error?: string | null;
  };

  export async function getFromScreenshot(fullPage: boolean = true) {
    const restore = hideInteractiveOverlay();
    const imgBlob = await takeScreenshot(fullPage);
    const body = new FormData();
    body.append(
      'language',
      OCR_SPACE_LANGUAGE_BY_HTML_LANG[document.documentElement.lang] || 'eng',
    );
    body.append('filetype', 'JPG');
    body.append('file', imgBlob, 'screenshot.jpg');
    body.append('isOverlayRequired', 'true');
    const promise = fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers,
      body,
    });
    const interactiveEls = restore();
    const res = await promise;
    if (!res.ok) {
      console.error('OCR API error', res);
      return { els: [], error: res.statusText };
    }
    const ocrData: OcrSpaceResponse = await res.json();
    const response: OcrResponse = {
      els: ocrData.ParsedResults.map((item) =>
        item.TextOverlay.Lines.map(
          (line: {
            LineText: string;
            Words: { Left: number; Top: number }[];
          }) => ({
            body: line.LineText,
            x: line.Words[0]?.Left ?? 0,
            y: line.Words[0]?.Top ?? 0,
          }),
        ).flat(),
      ).flat(),
    };
    response.els.push(
      ...interactiveEls.map((el) => {
        return {
          body: `<${el.type}: ${getElementLabel(el.element)} />`,
          x: el.bbox.x,
          y: el.bbox.y,
        };
      }),
    );
    return response;
  }
}
