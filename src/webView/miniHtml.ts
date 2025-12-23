import { replaceJsTpl } from './selector';

export namespace MiniHtml {
  const PRINT_ATTRS = ['disabled', 'type', 'name', 'method'];
  export type Selector =
    | string
    | {
        id: string;
        filterInChild?: string;
        filterWith?: 'html' | 'label';
        args?: Record<string, string>;
      };
  type MeaningfulElement = {
    element: HTMLElement;
    id: string;
    nodes?: (string | MeaningfulElement)[];
    label: string;
    visible: DomVisible;
    parent?: MeaningfulElement;
  };
  type DomVisible = DOMRect & {
    visible: boolean | 'outOfDoc' | 'covered' | 'hide' | 'size0';
    style: CSSStyleDeclaration;
  };
  const spaceRx = /[\s\t\r\n\u200c\u0020\u034f]{2,}/g;
  const elementContains = (parent: Element, child: Element | null): boolean => {
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
  };
  const checkVisible = (el: HTMLElement): DomVisible => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible: DomVisible = {
      ...JSON.parse(JSON.stringify(rect)),
      visible: true,
      style,
    };
    if (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      Number(style.opacity) === 0
    ) {
      visible.visible = 'hide';
      return visible;
    }
    if (rect.width === 0 || rect.height === 0) {
      visible.visible = 'size0';
      return visible;
    }

    const { scrollX, scrollY, innerWidth, innerHeight } = window;

    if (
      rect.x < scrollX ||
      rect.y < scrollY ||
      (style.position === 'fixed' &&
        (rect.bottom > innerHeight || rect.right > innerWidth))
    ) {
      visible.visible = 'outOfDoc';
      return visible;
    }

    const elAtXY = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

    if (elAtXY && elAtXY !== el && !elementContains(el, elAtXY)) {
      visible.visible = 'covered';
      return visible;
    }

    return visible;
  };
  const getReadableAttr = (element: HTMLElement): string => {
    return [
      element.getAttribute('alt') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('aria-labelledby') ?? '',
    ]
      .filter((attr, i, arr) => arr.indexOf(attr) === i)
      .map((attr) => attr.trim())
      .join(' ')
      .trim();
  };
  const ifInteractive = (tagName: string, element: HTMLElement): boolean => {
    if (tagName === 'a') return true;
    if (tagName === 'button') return true;
    if (tagName === 'textarea' || tagName === 'select' || tagName === 'form')
      return true;
    if (tagName === 'input') {
      const type = (element.getAttribute('type') || '').toLowerCase();
      return type !== 'hidden';
    }

    const role = (element.getAttribute('role') || '').toLowerCase();
    if (
      role === 'button' ||
      role === 'link' ||
      role === 'checkbox' ||
      role === 'radio' ||
      role === 'switch' ||
      role === 'tab' ||
      role === 'menuitem' ||
      role === 'option' ||
      role === 'combobox'
    ) {
      return true;
    }

    return element.getAttribute('contenteditable') === 'true';
  };
  const quoteAttrVal = (v: string) => (v.includes(' ') ? `"${v}"` : v);
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
  type Styles = {
    font: Record<string, number>;
    highlight: Record<string, number>;
  };
  export class Parser {
    added = 0;
    meaningFulElements: (MeaningfulElement | string)[] = [];
    meaningFulElementByEl = new Map<Element, MeaningfulElement>();
    styles: Styles = { font: {}, highlight: {} };
    initStyles: Styles | undefined = undefined;
    idToEl = new Map<string, MeaningfulElement>();
    observer: MutationObserver | undefined;
    mutatedElements = new Map<Element, MeaningfulElement | null>();
    constructor() {
      this.reset();
    }
    genHtml(
      meaningfulEl: MeaningfulElement,
      childLevel: number,
      notShow = false,
      parentHighlightStyle = '',
    ): string {
      const attrs = PRINT_ATTRS.map((attr) => [
        attr,
        meaningfulEl.element.getAttribute(attr),
      ])
        .filter((attr) => !!attr[1])
        .map((attr) => `${attr[0]}=${quoteAttrVal(attr[1]!)}`);
      const tagName = meaningfulEl.element.tagName.toLowerCase();
      const { visible, element } = meaningfulEl;
      const { style } = visible;
      let fontIndex = this.styles.font[style.fontFamily];

      if (fontIndex === undefined) {
        fontIndex = Object.keys(this.styles.font).length;
        this.styles.font[style.fontFamily] = fontIndex;
      }
      let tagHtmls = [
        tagName,
        visible.visible === true
          ? `id=${meaningfulEl.id ? meaningfulEl.id : ''}`
          : '',
        meaningfulEl.label?.length
          ? `label=${quoteAttrVal(meaningfulEl.label)}`
          : '',
        // eslint-disable-next-line no-nested-ternary
        notShow
          ? ''
          : visible.visible === true
            ? 'show'
            : `${visible?.visible || 'F'}`,
        visible.visible === true
          ? `xywh=${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.width)},${Math.round(visible.height)}`
          : '',
        visible.visible === true &&
        style.overflow !== 'hidden' &&
        element.scrollWidth - visible.width > 5
          ? `sw=${Math.round(element.scrollWidth)}`
          : '',
        visible.visible === true &&
        style.overflow !== 'hidden' &&
        element.scrollHeight - visible.height > 5
          ? `sh=${Math.round(element.scrollHeight)}`
          : '',
        ...attrs,
      ]
        .filter((str) => str.length)
        .join(' ');
      if (visible.visible === true) {
        const highlightStyle = `${style.font.replace(style.fontFamily, `ff${fontIndex}`)} ${rgbToHex(style.color)}`;
        if (parentHighlightStyle && parentHighlightStyle !== highlightStyle) {
          let i = this.styles.highlight[highlightStyle];
          if (i === undefined) {
            i = Object.keys(this.styles.highlight).length;
            this.styles.highlight[highlightStyle] = i;
          }
          tagHtmls += ` hls=${i}`;
        }
      }
      let innerHtml = meaningfulEl.nodes
        ?.map((node) => {
          if (typeof node === 'string') return node.trim();
          return this.genHtml(node, childLevel - 1, visible?.visible !== true);
        })
        .join('')
        .replace(spaceRx, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');
      if (childLevel <= 0 && innerHtml) {
        innerHtml = '...';
      }
      return innerHtml
        ? `<${tagHtmls}>${innerHtml}</${tagName}>`
        : `<${tagHtmls} />`;
    }
    initObserve() {
      if (this.observer) {
        this.mutatedElements.clear();
        return;
      }
      this.observer = new MutationObserver((mutations) => {
        let meaningfulEl: MeaningfulElement | null = null;
        mutations.forEach((record) => {
          switch (record.target.nodeType) {
            case Node.TEXT_NODE:
              if (record.target.parentElement) {
                meaningfulEl =
                  this.mutatedElements.get(record.target.parentElement) ?? null;
                this.mutatedElements.set(
                  record.target.parentElement,
                  meaningfulEl,
                );
              }
              return;
            default:
              if (record.target instanceof Element) {
                meaningfulEl =
                  this.meaningFulElementByEl.get(record.target) ?? null;
                if (meaningfulEl) {
                  if (record.type === 'childList') {
                    if (record.removedNodes.length) {
                      let toRemove: MeaningfulElement | string | null;
                      Array.from(record.removedNodes).forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                          toRemove =
                            this.meaningFulElementByEl.get(node as Element) ??
                            null;
                        } else if (node.nodeType === Node.TEXT_NODE) {
                          toRemove = node.textContent;
                        } else {
                          return;
                        }
                        if (toRemove) {
                          const pos = meaningfulEl?.nodes?.indexOf(toRemove);
                          if (pos !== undefined && pos !== -1) {
                            meaningfulEl?.nodes?.splice(pos, 1);
                          }
                        }
                      });
                    }
                    if (record.addedNodes.length) {
                      let toAdd: (MeaningfulElement | string)[] | null;
                      let previousToFind: MeaningfulElement | string | null;
                      Array.from(record.addedNodes).forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                          const found = this.meaningFulElementByEl.get(
                            node as Element,
                          );
                          toAdd = found ? [found] : null;
                          if (!toAdd) {
                            toAdd = [];
                            this.parseElement(node as HTMLElement, toAdd);
                          }
                        } else if (node.nodeType === Node.TEXT_NODE) {
                          toAdd = node.textContent ? [node.textContent] : null;
                        } else {
                          return;
                        }
                        if (toAdd) {
                          if (record.nextSibling === null) {
                            meaningfulEl?.nodes?.push(...toAdd);
                          } else if (record.previousSibling === null) {
                            meaningfulEl?.nodes?.unshift(...toAdd);
                          } else {
                            if (
                              record.previousSibling?.nodeType ===
                              Node.TEXT_NODE
                            ) {
                              previousToFind =
                                record.previousSibling?.textContent;
                            } else if (
                              record.previousSibling?.nodeType ===
                              Node.ELEMENT_NODE
                            ) {
                              previousToFind =
                                this.meaningFulElementByEl.get(
                                  record.previousSibling as Element,
                                ) ?? null;
                            }
                            if (previousToFind) {
                              const previous =
                                meaningfulEl?.nodes?.indexOf(previousToFind);
                              if (previous !== undefined && previous !== -1) {
                                meaningfulEl?.nodes?.splice(
                                  previous,
                                  0,
                                  ...toAdd,
                                );
                                return;
                              }
                            }
                            meaningfulEl?.nodes?.push(...toAdd);
                          }
                        }
                      });
                    }
                  }
                }
                console.log(record.target, meaningfulEl);
                this.mutatedElements.set(record.target, meaningfulEl);
              }
          }
        });
      });
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    genDeltaHtml(clearMutated = false) {
      const html = Array.from(this.mutatedElements.entries())
        .map(([el, meaningfulEl]) => {
          if (meaningfulEl) {
            this.updateElement(meaningfulEl);
            return this.genHtml(meaningfulEl!, 1, false);
          }
          // shouldn't happen
          const toAdd: (MeaningfulElement | string)[] = [];
          this.parseElement(el as HTMLElement, toAdd);
          return toAdd
            .map((addedEl) =>
              typeof addedEl === 'string'
                ? addedEl
                : this.genHtml(addedEl, 9999, false),
            )
            .join('');
        })
        .join('');
      const { styles, initStyles } = this;
      const newHighlight = Object.entries(styles.highlight).filter(
        ([style]) => initStyles!.highlight![style] === undefined,
      );
      const newFont = Object.entries(styles.font).filter(
        ([font]) => initStyles!.font![font] === undefined,
      );
      if (clearMutated) {
        this.initStyles!.highlight = { ...styles.highlight };
        this.initStyles!.font = { ...styles.font };
        this.mutatedElements.clear();
      }
      return `<script>const font = ${JSON.stringify(
        newFont.reduce(
          (acc, s) => {
            acc[`ff${s[1]}`] = s[0];
            return acc;
          },
          {} as Record<string, string>,
        ),
      )};
  const hls = ${JSON.stringify(
    newHighlight.reduce(
      (acc, s) => {
        acc[`#${s[1]}`] = s[0];
        return acc;
      },
      {} as Record<string, string>,
    ),
  )};</script>${html}`;
    }
    reset() {
      this.idToEl.clear();
      this.meaningFulElementByEl.clear();
      this.meaningFulElements = [];
      this.styles = { highlight: {}, font: {} };
      this.parseElement(document.body);
      this.initStyles = {
        highlight: { ...this.styles.highlight },
        font: { ...this.styles.font },
      };
      this.initObserve();
    }
    genFullHtml() {
      const style = window.getComputedStyle(document.body);
      const { styles } = this;
      this.styles.font[style.fontFamily] = 0;
      const highlightStyle = `${style.font.replace(style.fontFamily, `ff0`)} ${rgbToHex(style.color)}`;
      const html = this.meaningFulElements
        .map((el) =>
          typeof el === 'string'
            ? el
            : this.genHtml(el, 9999, false, highlightStyle),
        )
        .join('');
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
  )};</script>${html}`;
    }
    genId(id: string | undefined) {
      let thisId = id || `__${(this.added++).toString(36)}`;
      let i = 0;
      while (this.idToEl.has(thisId)) {
        thisId = `__${(this.added++).toString(36)}-${i++}`;
      }
      return thisId;
    }
    parseElement(
      element: HTMLElement,
      meaningFulElements: (MeaningfulElement | string)[] = this
        .meaningFulElements,
      parentMeaningfulEl: MeaningfulElement | undefined = undefined,
    ) {
      const tagName = element.tagName.toLowerCase();
      if (
        tagName === 'script' ||
        tagName === 'style' ||
        tagName === 'noscript'
      ) {
        return;
      }

      let meaningfulEl: MeaningfulElement | undefined = parentMeaningfulEl;
      const label = getReadableAttr(element);
      const placeholder: MeaningfulElement = {
        id: element.id,
        element,
        visible: checkVisible(element),
        label,
        parent: parentMeaningfulEl,
      };

      Array.from(element.childNodes).forEach((child) => {
        if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent?.trim() !== ''
        ) {
          if (placeholder.nodes === undefined) placeholder.nodes = [];
          placeholder.nodes!.push(child.textContent!);
          placeholder.label.replace(child.textContent!, '').trim();
        } else if (
          child.nodeType === Node.ELEMENT_NODE &&
          child instanceof HTMLElement
        ) {
          if (placeholder.nodes === undefined) placeholder.nodes = [];
          this.parseElement(
            child as HTMLElement,
            placeholder.nodes,
            placeholder,
          );
        }
      });

      if (ifInteractive(tagName, element)) {
        meaningfulEl = this.addMeaningfulElement(placeholder);
        meaningFulElements.push(meaningfulEl);
      } else {
        const hasDirectText = Array.from(element.childNodes).some((node) => {
          if (node.nodeType !== Node.TEXT_NODE) return false;
          return node.textContent && node.textContent.trim().length !== 0;
        });
        if (hasDirectText || label) {
          meaningfulEl = this.addMeaningfulElement(placeholder);
          meaningFulElements.push(meaningfulEl);
        } else if (
          placeholder.nodes &&
          placeholder.nodes.filter(
            (n) => typeof n === 'object' && n.parent === placeholder,
          ).length > 1
        ) {
          meaningfulEl = this.addMeaningfulElement(placeholder);
          meaningFulElements.push(meaningfulEl);
        } else if (placeholder.nodes) {
          meaningFulElements.push(...placeholder.nodes);
          placeholder.nodes.forEach((node) => {
            if (typeof node === 'object') {
              node.parent = meaningfulEl;
            }
          });
        }
      }
    }
    static contentFilterFns = {
      html: (filter: string) => (el: MeaningfulElement) =>
        el.element.innerHTML.includes(filter),
      label: (filter: string) => (el: MeaningfulElement) =>
        el.label.includes(filter),
      default: (filter: string) => (el: MeaningfulElement) =>
        el.label.includes(filter) || el.element.innerHTML.includes(filter),
    };
    static ErrIdNotFound = new Error('ERR_ID_NOT_FOUND');

    getElementFormId(select: Selector) {
      const selector = typeof select === 'object' ? select : { id: select };
      let meaningfulEl = this.idToEl.get(selector.id);
      if (selector.filterInChild) {
        const filter = replaceJsTpl(
          selector.filterInChild,
          selector.args ?? {},
        );
        const filterFn =
          Parser.contentFilterFns[selector.filterWith ?? 'default'](filter);
        meaningfulEl = meaningfulEl?.nodes
          ?.filter((el) => typeof el === 'object')
          .find(filterFn);
      }
      if (!meaningfulEl) {
        throw Parser.ErrIdNotFound;
      }
      return meaningfulEl;
    }
    genHtmlFormId(select: Selector, parentLevel: number = 0) {
      let el = this.getElementFormId(select);
      for (let lv = parentLevel; lv > 0; lv--) {
        if (el.parent) {
          el = el.parent;
        } else {
          break;
        }
      }
      return this.genHtml(el, 9999);
    }

    private addMeaningfulElement(
      meaningfulElParts: Omit<MeaningfulElement, 'id'>,
    ): MeaningfulElement {
      const meaningfulEl = {
        ...meaningfulElParts,
        id: this.genId(meaningfulElParts.element.id),
      };
      this.idToEl.set(meaningfulEl.id, meaningfulEl);
      this.meaningFulElementByEl.set(meaningfulEl.element, meaningfulEl);
      return meaningfulEl;
    }

    private updateElement(meaningfulEl: MeaningfulElement) {
      meaningfulEl.visible = checkVisible(meaningfulEl.element);
      meaningfulEl.label = getReadableAttr(meaningfulEl.element);
      meaningfulEl.nodes?.forEach(
        (node) => typeof node === 'object' && this.updateElement(node),
      );
    }
  }
  export const getHtmlParser = () => {
    const parser = new Parser();
    return parser;
  };
}
