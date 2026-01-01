let observer: MutationObserver | undefined;
const mutatedElement = new Set<Element>();

const ALLOW_ATTRS = new Set([
  'data-label',
  'id',
  'data-tooltip',
  'role',
  'type',
  'aria-label',
  'for',
  'name',
  'title',
  'method',
  'email',
  'alt',
  'role',
  'href',
  'src',
]);
const IGNORE_TAGS = new Set(['script', 'style', 'noscript']);
const SIMPLE_TAGS = new Set(['option']);
const CONTAINER_TAGS = new Set(['ul', 'div']);

export const getHtmlFromNode = (root: HTMLElement, getDelta = false) => {
  const styles: {
    font: Record<string, number>;
    highlight: Record<string, number>;
  } = { font: {}, highlight: {} };
  const links: string[] = [];

  const processedRoot = processElement(
    root,
    null,
    window.innerWidth,
    window.innerHeight,
    styles,
    links,
  );
  if (!processedRoot) {
    return '';
  }

  return `<script>const font = ${JSON.stringify(
    Object.entries(styles.font).reduce(
      (acc, s) => {
        acc[`ff${s[1]}`] = s[0];
        return acc;
      },
      {} as Record<string, string>,
    ),
  )};
  const hls = ${JSON.stringify(
    Object.entries(styles.highlight).reduce(
      (acc, s) => {
        acc[`#${s[1]}`] = s[0];
        return acc;
      },
      {} as Record<string, string>,
    ),
  )};</script>${cleanHtml(processedRoot.outerHTML)}`;
};

export const getHtml = () => {
  console.log('getHtml');
  const html = getHtmlFromNode(document.body);
  console.log('getHtml', html.length);
  if (observer) {
    mutatedElement.clear();
    observer.disconnect();
  }
  observer = new MutationObserver((mutations) => {
    mutations.forEach((record) => {
      switch (record.target.nodeType) {
        case Node.TEXT_NODE:
          if (record.target.parentElement) {
            mutatedElement.add(record.target.parentElement);
          }
          return;
        default:
          if (record.target instanceof Element) {
            mutatedElement.add(record.target);
          }
      }
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: Array.from(ALLOW_ATTRS.values()),
    characterData: true,
  });
  return html;
};

export const getDeltaHtml = () => {
  const htmls: string[] = [];
  const addedEls: Element[] = [];
  const checkIfAdded = (el: Element) => {
    let thisEl: Element | null = el;
    const { body } = document;
    while (thisEl && thisEl !== body) {
      // eslint-disable-next-line no-loop-func
      if (addedEls.find((addedEl) => addedEl === thisEl)) return true;
      thisEl = el.parentElement;
    }
    return false;
  };
  mutatedElement.forEach((el, idx) => {
    const styles: {
      font: Record<string, number>;
      highlight: Record<string, number>;
    } = { font: {}, highlight: {} };
    if (checkIfAdded(el)) {
      return;
    }
    addedEls.push(el);
    htmls.push(
      `${getQuerySelector(el, mutatedElement)}: ${cleanHtml(processElement(el as HTMLElement, null, window.innerWidth, window.innerHeight, styles, [])?.outerHTML ?? `<${el.tagName.toLowerCase()}/>`)}`,
    );
  });
  return htmls.join('\n');
};

function getQuerySelector(el: Element, modifiedElement: Set<Element>): string {
  if (el.id && !modifiedElement.has(el)) {
    return el.id; // reliable unmodified el
  }
  let name = el.tagName.toLowerCase();
  if (el.tagName === 'body') {
    return el.tagName;
  }
  const parent = el.parentElement;
  if (!parent) return name;
  if (parent.childNodes.length !== 1) {
    let i = 0;
    for (const child of parent.childNodes) {
      if (child === el) {
        name = `:nth-child(${i})`;
        break;
      }
      i++;
    }
  }
  return `${getQuerySelector(el, modifiedElement)}>${name}`;
}

enum ContentType {
  NO_CONTENT,
  TEXT_CONTENT,
  MEDIA_CONTENT,
  MAYBE_MEDIA_CONTENT,
}

// 判斷一個 element 本身有冇「內容」
const hasOwnContent = (el: Element): ContentType => {
  // 有媒體類子節點（即使無文字）
  const tag = el.tagName;
  if (['IMG', 'SVG', 'VIDEO', 'CANVAS', 'PICTURE'].includes(tag)) {
    return ContentType.MEDIA_CONTENT;
  }
  const txt = el.textContent;
  // 有文字
  if (txt && txt.trim().length > 0) {
    return ContentType.TEXT_CONTENT;
  }

  if (el.childNodes && el.childNodes.length) {
    return ContentType.MAYBE_MEDIA_CONTENT;
  }

  return ContentType.NO_CONTENT;
};

interface AttrResult {
  name: string;
  value: string;
}

const renderAttribute = (
  links: string[],
  attr: Attr,
  valSet: Set<string>,
): AttrResult | null => {
  if (!attr.value) {
    return null;
  }
  const attrName = attr.name;
  let res: AttrResult = { name: attr.name, value: attr.value };
  if (attrName !== 'id') {
    if (attrName === 'href') {
      if (attr.value.startsWith('javascript:')) {
        return null;
      }
      const newAttr = { name: attrName, value: attr.value };
      if (newAttr.value.length > 30) {
        newAttr.value = `long-url-${links.push(newAttr.value)}`;
      }
      res = newAttr;
    }
    if (attrName === 'src') {
      res = { name: attrName, value: imgUrl(attr.value) };
    }
    if (!ALLOW_ATTRS.has(attrName)) {
      return null;
    }
    if (valSet.has(res.value)) {
      return null;
    }
  }
  valSet.add(res.value);
  return res;
};

function imgUrl(oldUrl: string) {
  let url = oldUrl;
  if (url.startsWith('url(')) {
    url = url.slice(4, url.length - 1);
  }
  const parts = url.split('/');
  return parts[parts.length - 1].replace(/[?#].+/, '');
}

const rgbToHex = (input: string): string => {
  if (!input) return input;
  const s = input;

  // --- Handle rgb/rgba ----------------------------------------------------
  const m = s.match(/(rgb\((\d+), ?(\d+), ?(\d+)\))/i);
  if (m) {
    const r = Math.floor(Math.min(255, Math.max(0, parseInt(m[2], 10))) / 16);
    const g = Math.floor(Math.min(255, Math.max(0, parseInt(m[3], 10))) / 16);
    const b = Math.floor(Math.min(255, Math.max(0, parseInt(m[4], 10))) / 16);

    return s.replace(
      m[1],
      `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`,
    );
  }

  return input;
};

interface ParentProps {
  highlightStyle: string;
  isGrid: boolean;
  w: number;
  h: number;
  sw: number;
  sh: number;
}

function processElement(
  node: HTMLElement,
  parent: HTMLElement | null,
  screenW: number,
  screenH: number,
  styles: { font: Record<string, number>; highlight: Record<string, number> },
  links: string[],
  parentProps: ParentProps = {
    highlightStyle: '',
    isGrid: false,
    w: 0,
    h: 0,
    sw: 0,
    sh: 0,
  },
  depth = 0,
): HTMLElement | null {
  const tagName = node.tagName.toLowerCase();
  if (IGNORE_TAGS.has(tagName)) {
    return null;
  }

  // 先 clone 一個空殼，同時 copy 原有 attributes
  let clone = document.createElement(tagName);
  const attrVals = new Set<string>();
  const attrs = Array.from(node.attributes)
    .map((attr) => renderAttribute(links, attr, attrVals))
    .filter((attr): attr is AttrResult => !!attr);

  if (SIMPLE_TAGS.has(tagName)) {
    attrs.forEach((attr) => clone.setAttribute(attr.name, attr.value));
    clone.innerHTML = node.innerHTML;
    return clone;
  }

  const contentType = hasOwnContent(node);

  const thisProps = {
    highlightStyle: '',
    isGrid: false,
    w: 0,
    h: 0,
    sw: 0,
    sh: 0,
  };
  const rect = node.getBoundingClientRect();
  const hasContent =
    attrs.length !== 0 ||
    Array.from(node.childNodes).some(
      (n) =>
        n.nodeType === Node.TEXT_NODE &&
        n.textContent &&
        n.textContent.trim().length > 0,
    );

  if (rect.top + rect.height < 0 || rect.left + rect.width < 0) {
    clone.setAttribute('hideXY', `${rect.left},${rect.top}`);
  } else if ((depth > 3 && rect.top > screenH) || rect.left > screenW) {
    clone.innerHTML = node.innerHTML;
    clone.querySelectorAll('script,style').forEach((tag) => {
      (tag as HTMLElement).innerText = '';
    });
    const txt = ((clone as HTMLElement).textContent || '').trim();
    const mediaTags = node.querySelectorAll<HTMLElement>(
      'img,picture,svg,canvas,video',
    );
    const htmls = [txt.length > 100 ? `${txt.slice(0, 100)}...` : txt];
    const withImg = mediaTags.length;
    const attrValueSet = new Set<string>();
    mediaTags.forEach((tag) => {
      const tagAttr = Array.from(tag.attributes)
        .map((attr) => renderAttribute(links, attr, attrValueSet))
        .filter((attr) => !!attr)
        .map((attr) => `${attr.name}="${attr.value}"`);
      if (tagAttr.length) {
        htmls.push(`<${tag.tagName.toLowerCase()} ${tagAttr.join(' ')}`);
      }
    });
    if (htmls.length === 1 && htmls[0].length === 0) {
      if (withImg === 0) {
        return null;
      }
      clone.setAttribute('hasMediaTags', String(withImg));
    }
    clone.setAttribute('scXY', `${rect.left},${rect.top}`);
    clone.innerHTML = htmls.slice(0, 10).join(' ');
  } else {
    if (!hasContent && parent) {
      clone = parent;
    }
    if (rect.width !== 0 && rect.height !== 0) {
      const style = window.getComputedStyle(node);
      let fontIndex = styles.font[style.fontFamily];

      if (fontIndex === undefined) {
        fontIndex = Object.keys(styles.font).length;
        styles.font[style.fontFamily] = fontIndex;
      }

      thisProps.highlightStyle = `${style.font.replace(style.fontFamily, `ff${fontIndex}`)} ${rgbToHex(style.color)}`;
      if (
        parentProps.highlightStyle &&
        parentProps.highlightStyle !== thisProps.highlightStyle
      ) {
        let i = styles.highlight[thisProps.highlightStyle];
        if (i === undefined) {
          i = Object.keys(styles).length;
          styles.highlight[thisProps.highlightStyle] = i;
        }
        clone.setAttribute('hls', `#${i}`);
      }

      const { display } = style;
      const { position } = style;
      const floatVal = (style as any).float ?? style.cssFloat; // 兼容性保險啲

      thisProps.isGrid = display === 'grid';

      const isFloated = parentProps.isGrid || (floatVal && floatVal !== 'none');
      const isWeirdPosition =
        position === 'absolute' ||
        position === 'fixed' ||
        position === 'sticky';

      if (isWeirdPosition || isFloated) {
        clone.setAttribute('x', Math.round(rect.left).toString());
        clone.setAttribute('y', Math.round(rect.top).toString());
      }

      if (style.background !== 'none' && style.background !== 'transparent') {
        clone.setAttribute(
          'bg',
          style.backgroundImage === 'none'
            ? rgbToHex(style.background)
            : imgUrl(style.backgroundImage),
        );
      }

      if (style.animation !== 'none') {
        clone.setAttribute('animate', style.animation);
      }
    }

    thisProps.w = Math.round(rect.width);
    thisProps.h = Math.round(rect.height);
    thisProps.sw = node.scrollWidth;
    thisProps.sh = node.scrollHeight;

    let childHasContent = false;

    if (contentType !== ContentType.MEDIA_CONTENT) {
      // 處理所有子節點（element + text node）
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const processedChild = processElement(
            child as HTMLElement,
            clone,
            screenW,
            screenH,
            styles,
            links,
            hasContent ? thisProps : parentProps,
            depth + 1,
          );
          if (processedChild) {
            if (processedChild !== clone) {
              clone.appendChild(processedChild);
            }
            childHasContent = true;
          }
        } else if (child.nodeType === Node.TEXT_NODE) {
          const text = child.textContent?.trim();
          if (text) {
            clone.appendChild(document.createTextNode(text));
          }
        }
      });
    }
    if (!childHasContent && (CONTAINER_TAGS.has(tagName) || !hasContent)) {
      return null;
    }

    if (thisProps.w !== parentProps.w) {
      clone.setAttribute('w', thisProps.w.toString());
    }

    if (thisProps.h !== parentProps.h) {
      clone.setAttribute('h', thisProps.h.toString());
    }

    if (thisProps.h !== thisProps.sh && thisProps.sh !== parentProps.sh) {
      clone.setAttribute('scH', Math.round(thisProps.sh).toString());
    }

    if (thisProps.w !== thisProps.sw && thisProps.sw !== parentProps.sw) {
      clone.setAttribute('scW', Math.round(thisProps.sw).toString());
    }
  }

  attrs.forEach((attr) => clone.setAttribute(attr.name, attr.value));

  return clone;
}

function cleanHtml(html: string) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/<([^ >]+)([^>]*)><\/\1>/g, '<$1$2/>')
    .replace(/([^ <>"]+)="([^ "]+)"/g, '$1=$2');
}

// (()=>{
//   console.log(321)
//   onload = () => {
//     console.log(123)
//     const html = getHtml();
//     console.log(html.length, html)
//   }
// })()
