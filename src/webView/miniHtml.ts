import { SliderProfile } from '../agentic/profile/widget/slider.html';
import { dummyCursor } from './cursor/cursor';
import { IFrameHelper } from './iframe';
import { CommonUtil } from '../utils/common';

export namespace MiniHtml {
  export const EL_IN_IFRAME = Symbol('EL_IN_IFRAME');
  export const iframeById: Record<string, IFrameHelper> = {};
  const PRINT_ATTRS = ['disabled', 'type', 'name', 'method'];
  export type Selector =
    | string
    | {
        id: string;
        filterInChild?: string;
        filterWith?: 'html' | 'label';
        args?: Record<string, string>;
      };
  export type MeaningfulElement = {
    element: HTMLElement;
    id: string;
    nodes?: (string | MeaningfulElement)[];
    label: string;
    visible: DomVisible | null; // null = need reload;
    parent?: MeaningfulElement;
    bodyDepth: number;
  };
  export type DomVisible = DOMRect & {
    visible: boolean | 'outOfDoc' | 'covered' | 'hide' | 'size0' | '';
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
  export const checkVisible = (el: HTMLElement): DomVisible => {
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
      const tagName = el.tagName.toLowerCase();
      if (['option', 'optgroup'].includes(tagName)) {
        visible.visible = '';
        return visible;
      }
      visible.visible = 'size0';
      return visible;
    }

    const { scrollX, scrollY, innerWidth, innerHeight } = window;

    if (
      rect.x < -scrollX ||
      rect.y < -scrollY ||
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
  const interactiveTags = new Set<string>([
    'button',
    'a',
    'input',
    'textarea',
    'select',
  ]);
  const getReadableAttr = (element: HTMLElement): string => {
    const tagName = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    if (tagName === 'div') {
      if (element.classList.contains('rc-select')) {
        const roles = ['rcSelect'];
        if (element.classList.contains('rc-select-show-search')) {
          roles.push('combobox');
        }
        if (element.classList.contains('rc-select-multiple')) {
          roles.push('multi');
        }
        return `role:${roles.join('-')}`;
      }
      if (element.classList.contains('rc-virtual-list-holder-inner')) {
        return 'role:rcSelect-listbox';
      }
    }
    let extra = '';
    const res = SliderProfile.checkSlider(tagName, element);
    if (res) {
      return res;
    }
    if (tagName === 'iframe') {
      return (
        element.getAttribute('title') || element.getAttribute('name') || ''
      );
    }
    if (tagName === 'input') {
      const t = element.getAttribute('type');
      if (
        t === 'checkbox' ||
        (t === 'radio' && element.getAttribute('checked'))
      ) {
        extra = 'checked';
      }
    }

    return [
      element.getAttribute('alt') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('aria-labelledby') ?? '',
      role && !interactiveTags.has(tagName)
        ? `role:${element.getAttribute('role')}`
        : '',
      extra,
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
  export const quoteAttrVal = (v: string) => (v.includes(' ') ? `"${v}"` : v);
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
    lastFullHtml: string | undefined;
    constructor(public idPrefix = '__') {
      this.reset();
    }
    async genHtml(
      meaningfulEl: MeaningfulElement,
      childLevel: number,
      notShow = false,
      parentHighlightStyle: string = '',
      renderedHtml: null | Map<MeaningfulElement, string> = null,
      rerendered = false,
    ): Promise<string> {
      if (meaningfulEl.element.isConnected === false) return '';
      let thisRendered = rerendered;
      if (thisRendered || meaningfulEl.visible === null) {
        meaningfulEl.visible = checkVisible(meaningfulEl.element);
        thisRendered = true;
      }
      if (meaningfulEl instanceof IFrameHelper) {
        const html = await meaningfulEl.getHtml();
        if (renderedHtml) {
          renderedHtml.set(meaningfulEl, html);
        }
        return html;
      }
      const { visible, element } = meaningfulEl;
      const tagName = element.tagName.toLowerCase();
      const { style } = visible;
      let fontIndex = this.styles.font[style.fontFamily];
      if (fontIndex === undefined) {
        fontIndex = Object.keys(this.styles.font).length;
        this.styles.font[style.fontFamily] = fontIndex;
      }
      const highlightStyle = `${style.font.replace(style.fontFamily, `ff${fontIndex}`)} ${rgbToHex(style.color)}`;
      let innerHtml =
        meaningfulEl.nodes &&
        (
          await Promise.all(
            meaningfulEl.nodes.map(async (node) => {
              if (typeof node === 'string') return node.trim();
              if (renderedHtml && renderedHtml.has(node)) {
                const rendered = renderedHtml.get(node)!;
                // console.log('reusing rendered html', rendered);
                renderedHtml.delete(node);
                return rendered;
              }
              return this.genHtml(
                node,
                childLevel - 1,
                visible?.visible !== true,
                highlightStyle,
                renderedHtml,
                thisRendered,
              );
            }),
          )
        )
          .join('')
          .replace(spaceRx, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"');
      if (childLevel <= 0 && innerHtml) {
        innerHtml = '...';
      }
      if (element.tagName === 'BODY') {
        return innerHtml ?? '';
      }
      const el = meaningfulEl.element;
      const attrs = PRINT_ATTRS.map((attr) => [attr, el.getAttribute(attr)])
        .filter((attr) => !!attr[1])
        .map((attr) => `${attr[0]}=${quoteAttrVal(attr[1]!)}`);

      if (fontIndex === undefined) {
        fontIndex = Object.keys(this.styles.font).length;
        this.styles.font[style.fontFamily] = fontIndex;
      }
      const isVisible = visible.visible === true;
      let href = '';
      if (isVisible && tagName === 'a') {
        const h = element.getAttribute('href');
        if (h && h.includes('://') && !h.startsWith(window.location.origin)) {
          href = `href=${h.length > 64 ? `${h.slice(0, 64)}...` : h}`;
        }
      }
      let tagHtmls = [
        tagName,
        isVisible ? `id=${meaningfulEl.id ? meaningfulEl.id : ''}` : '',
        href,
        meaningfulEl.label?.length
          ? `label=${quoteAttrVal(meaningfulEl.label)}`
          : '',
        // eslint-disable-next-line no-nested-ternary
        notShow
          ? ''
          : isVisible
            ? 'show'
            : `${visible.visible === false ? 'hide' : visible.visible}`,
        isVisible
          ? `xywh=${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.width)},${Math.round(visible.height)}`
          : '',
        isVisible &&
        style.overflow !== 'hidden' &&
        element.scrollWidth - visible.width > 5
          ? `sw=${Math.round(element.scrollWidth)}`
          : '',
        isVisible &&
        style.overflow !== 'hidden' &&
        element.scrollHeight - visible.height > 5
          ? `sh=${Math.round(element.scrollHeight)}`
          : '',
        (tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select') &&
        (element as HTMLInputElement).value
          ? `val=${quoteAttrVal((element as HTMLInputElement).value)}`
          : '',
        ...attrs,
      ]
        .filter((str) => str.length)
        .join(' ');
      if (isVisible) {
        if (parentHighlightStyle && parentHighlightStyle !== highlightStyle) {
          let i = this.styles.highlight[highlightStyle];
          if (i === undefined) {
            i = Object.keys(this.styles.highlight).length;
            this.styles.highlight[highlightStyle] = i;
          }
          tagHtmls += ` hls=${i}`;
        }
      }
      return innerHtml
        ? `<${tagHtmls}>${innerHtml ?? ''}</${tagName}>`
        : `<${tagHtmls} />`;
    }
    findMeaningfulFromParent(el: Element): MeaningfulElement | null {
      let parent: Element | null = el;
      while (parent) {
        const meaningfulEl = this.meaningFulElementByEl.get(parent);
        if (meaningfulEl) return meaningfulEl;
        parent = parent.parentElement;
      }
      return null;
    }
    positionByMutationRecord(
      record: Node,
      nodes: (string | MeaningfulElement)[],
    ): number {
      if (record.previousSibling === null) {
        return 0;
      }
      if (record.nextSibling === null) {
        return nodes.length;
      }
      let previousToFind: MeaningfulElement | string | null = null;
      if (record.previousSibling?.nodeType === Node.TEXT_NODE) {
        previousToFind = record.previousSibling?.textContent;
      } else if (record.previousSibling?.nodeType === Node.ELEMENT_NODE) {
        previousToFind =
          this.meaningFulElementByEl.get(record.previousSibling as Element) ??
          null;
      }
      if (previousToFind) {
        return nodes.indexOf(previousToFind);
      }
      return nodes.length;
    }
    handleMutations = (mutations: MutationRecord[]) => {
      let meaningfulEl: MeaningfulElement | null = null;
      // console.info('mutations', mutations);
      mutations.forEach((record) => {
        if (record.target === dummyCursor.dom) {
          return;
        }
        switch (record.target.nodeType) {
          case Node.TEXT_NODE:
            if (record.target.parentElement) {
              meaningfulEl =
                this.meaningFulElementByEl.get(record.target.parentElement) ??
                null;
              this.mutatedElements.set(
                record.target.parentElement,
                meaningfulEl,
              );
              if (meaningfulEl) {
                meaningfulEl.visible = null;
                if (meaningfulEl.nodes === undefined) {
                  meaningfulEl.nodes = [record.target.textContent!];
                } else {
                  const pos = this.positionByMutationRecord(
                    record.target,
                    meaningfulEl.nodes,
                  );
                  if (pos !== undefined && pos !== -1) {
                    meaningfulEl.nodes[pos] = record.target.textContent ?? '';
                  }
                }
              }
            }
            // console.log(
            //   'txt update',
            //   record.target,
            //   record.target.parentElement,
            //   meaningfulEl,
            // );
            return;
          default:
            if (record.target instanceof Element) {
              if (record.type === 'attributes') {
                const elsToCheck: Element[] = [record.target as Element];
                let childEl;
                let foundMeaningful;
                while (elsToCheck.length) {
                  childEl = elsToCheck.shift()!;
                  foundMeaningful = this.meaningFulElementByEl.get(childEl);
                  if (foundMeaningful) {
                    foundMeaningful.visible = null;
                    foundMeaningful.label = getReadableAttr(
                      childEl as HTMLElement,
                    );
                    meaningfulEl = foundMeaningful;
                    break;
                  }
                  elsToCheck.push(...Array.from(childEl.children));
                }
              } else if (record.type === 'childList') {
                meaningfulEl =
                  this.findMeaningfulFromParent(record.target) ?? null;
                if (record.removedNodes.length) {
                  let toRemove: MeaningfulElement | string | undefined;
                  Array.from(record.removedNodes).forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                      const stackEl = [node as Element];
                      let el: Element;
                      while (stackEl.length) {
                        el = stackEl.shift()!;
                        toRemove = this.meaningFulElementByEl.get(el);
                        if (toRemove) {
                          this.mutatedElements.set(
                            node as Element,
                            toRemove as MeaningfulElement,
                          );
                          break;
                        }
                        stackEl.push(
                          ...(Array.from(el.childNodes).filter(
                            (n) => n.nodeType === Node.ELEMENT_NODE,
                          ) as Element[]),
                        );
                      }
                      if (toRemove && meaningfulEl) {
                        meaningfulEl.nodes?.splice(
                          meaningfulEl.nodes?.indexOf(toRemove),
                          1,
                        );
                      }
                    } else if (node.nodeType === Node.TEXT_NODE) {
                      toRemove = node.textContent ?? undefined;
                    } else {
                      return;
                    }
                    if (toRemove) {
                      if (meaningfulEl) {
                        meaningfulEl.visible = null;
                        const pos = meaningfulEl.nodes?.indexOf(toRemove);
                        if (pos !== undefined && pos !== -1) {
                          meaningfulEl.nodes?.splice(pos, 1);
                        }
                      } else if (
                        typeof toRemove === 'object' &&
                        toRemove.parent
                      ) {
                        const pos = toRemove.parent.nodes?.indexOf(toRemove);
                        if (pos !== undefined && pos !== -1) {
                          toRemove.parent.nodes?.splice(pos, 1);
                        }
                      }
                    }
                  });
                }
                if (record.addedNodes.length) {
                  let toAdd: (MeaningfulElement | string)[] | null;
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
                      // console.log('adding', toAdd, meaningfulEl);
                      toAdd.forEach((addedEl) => {
                        this.mutatedElements.set(
                          (addedEl as MeaningfulElement).element,
                          addedEl as MeaningfulElement,
                        );
                        if ((addedEl as MeaningfulElement).parent) {
                          this.mutatedElements.set(
                            (addedEl as MeaningfulElement).parent!.element,
                            (addedEl as MeaningfulElement).parent!,
                          );
                        }
                      });
                    } else if (node.nodeType === Node.TEXT_NODE) {
                      toAdd = node.textContent ? [node.textContent] : null;
                    } else {
                      return;
                    }
                    if (toAdd && meaningfulEl) {
                      meaningfulEl.visible = null;
                      if (meaningfulEl.nodes === undefined) {
                        meaningfulEl.nodes = toAdd;
                      } else {
                        let el = node as Element;
                        const childNodes = Array.from(
                          meaningfulEl.element.childNodes,
                        );
                        while (el !== document.body && el.parentElement) {
                          if (childNodes.includes(el)) {
                            const pos = this.positionByMutationRecord(
                              el,
                              meaningfulEl.nodes,
                            );
                            // console.log(
                            //   'pos',
                            //   pos,
                            //   node.previousSibling,
                            //   node.nextSibling,
                            //   toAdd,
                            //   meaningfulEl.nodes,
                            // );
                            if (pos !== undefined && pos !== -1) {
                              meaningfulEl?.nodes?.splice(pos, 0, ...toAdd);
                            } else {
                              meaningfulEl?.nodes?.push(...toAdd);
                            }
                            break;
                          }
                          el = el.parentElement!;
                        }
                      }
                    }
                  });
                }
              }
              // console.log('mutation', meaningfulEl);
              this.mutatedElements.set(record.target, meaningfulEl);
            }
        }
      });
    };
    initObserve() {
      if (this.observer) {
        this.mutatedElements.clear();
        return;
      }
      this.observer = new MutationObserver(this.handleMutations);
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      document.body.addEventListener('input', (e) => {
        const meaningfulEl = this.meaningFulElementByEl.get(
          e.target as Element,
        );
        if (meaningfulEl) {
          this.mutatedElements.set(e.target as Element, meaningfulEl);
        }
      });
    }
    genDeltaHtml = async (clearMutated = false) => {
      const renderedHtml = new Map<MeaningfulElement, string>();
      console.log(
        this.mutatedElements,
        Array.from(this.mutatedElements.entries()).sort(
          (a, b) => -(a[1]?.bodyDepth ?? 0 - (b[1]?.bodyDepth ?? 0)),
        ),
      );
      await Promise.all(
        Array.from(this.mutatedElements.entries())
          .sort((a, b) => -(a[1]?.bodyDepth ?? 0 - (b[1]?.bodyDepth ?? 0)))
          .map(async ([el, meaningfulEl]) => {
            if (el.isConnected === false) return '';
            if (meaningfulEl) {
              this.updateElement(meaningfulEl);
              renderedHtml.set(
                meaningfulEl!,
                await this.genHtml(meaningfulEl!, 1, false, '', renderedHtml),
              );
            }
            const toAdd: (MeaningfulElement | string)[] = [];
            this.parseElement(el as HTMLElement, toAdd);
            await Promise.all(
              toAdd.map(async (addedEl) => {
                if (typeof addedEl === 'object') {
                  renderedHtml.set(
                    addedEl!,
                    await this.genHtml(addedEl, 9999, false, '', renderedHtml),
                  );
                }
              }),
            );
          }),
      );
      const html = Array.from(renderedHtml.values()).join('');
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
      return html
        ? `<title t="${document.title ?? 'no title'}" /><script>const font = ${JSON.stringify(
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
  )};</script>${html}`
        : '';
    };
    reset() {
      this.lastFullHtml = undefined;
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
    genFullHtml = async () => {
      const style = window.getComputedStyle(document.body);
      const { styles } = this;
      this.styles.font[style.fontFamily] = 0;
      const highlightStyle = `${style.font.replace(style.fontFamily, `ff0`)} ${rgbToHex(style.color)}`;
      const html = (
        await Promise.all(
          this.meaningFulElements.map((el) =>
            typeof el === 'string'
              ? Promise.resolve(el)
              : this.genHtml(el, 9999, false, highlightStyle),
          ),
        )
      ).join('');
      this.lastFullHtml = html;
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
  )};</script>${html} //${this.mutatedElements.size}`;
    };
    genId(id: string | undefined) {
      // eslint-disable-next-line no-nested-ternary
      let thisId = id
        ? this.idPrefix === '__'
          ? id
          : `${this.idPrefix}${id}`
        : `${this.idPrefix}${(this.added++).toString(36)}`;
      let i = 0;
      while (this.idToEl.has(thisId)) {
        thisId = `${this.idPrefix}${(this.added++).toString(36)}-${i++}`;
      }
      return thisId;
    }
    parseElement(
      element: HTMLElement,
      meaningFulElements:
        | (MeaningfulElement | string)[]
        | undefined = undefined,
      parentMeaningfulElement: MeaningfulElement | undefined = undefined,
      bodyDep = 0,
    ) {
      // eslint-disable-next-line no-param-reassign
      meaningFulElements = meaningFulElements ?? this.meaningFulElements;
      let bodyDepth = bodyDep;
      let parentMeaningfulEl = parentMeaningfulElement;
      if (bodyDepth === 0 && element !== document.body) {
        let bodyLookup = element;
        if (parentMeaningfulEl) {
          while (bodyLookup !== document.body && bodyLookup.parentElement) {
            bodyLookup = bodyLookup.parentElement;
            bodyDepth++;
          }
        } else {
          let foundEl: MeaningfulElement | undefined;
          while (bodyLookup !== document.body && bodyLookup.parentElement) {
            bodyLookup = bodyLookup.parentElement;
            foundEl = this.meaningFulElementByEl.get(bodyLookup);
            if (foundEl) {
              parentMeaningfulEl = foundEl;
              bodyDepth += foundEl.bodyDepth;
              break;
            }
            bodyDepth++;
          }
        }
      }

      const tagName = element.tagName.toLowerCase();
      if (
        tagName === 'script' ||
        tagName === 'style' ||
        tagName === 'noscript'
      ) {
        return;
      }

      if (tagName === 'iframe') {
        meaningFulElements.push(
          this.addMeaningfulElement(
            new IFrameHelper(
              element as HTMLIFrameElement,
              element.id,
              element.getAttribute('name') ?? '',
              checkVisible(element),
              bodyDepth,
              parentMeaningfulEl,
            ),
          ),
        );
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
        bodyDepth,
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
            bodyDepth + 1,
          );
        }
      });

      if (ifInteractive(tagName, element) || tagName === 'body') {
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

    getElementFormId(select: Selector): MeaningfulElement | IFrameHelper {
      const selector = typeof select === 'object' ? select : { id: select };
      if (selector.id.includes(':')) {
        const parts = selector.id.split(':');
        if (parts.slice(0, -1).join(':') !== this.idPrefix) {
          let iframe: IFrameHelper | undefined;
          for (let i = 0, c = parts.length; i < c; i++) {
            iframe = iframeById[parts.slice(0, i + 1).join(':')];
            if (iframe) {
              return iframe;
            }
          }
        }
      }
      let meaningfulEl = this.idToEl.get(selector.id);
      if (selector.filterInChild) {
        const filter = CommonUtil.replaceJsTpl(
          selector.filterInChild,
          selector.args ?? {},
        );
        const filterFn =
          Parser.contentFilterFns[selector.filterWith ?? 'default'](filter);
        let nodes: MeaningfulElement[] = [];
        let nextNodes = meaningfulEl?.nodes ?? [];
        let node: MeaningfulElement;
        while (nextNodes.length && !meaningfulEl) {
          nodes = nextNodes.filter((el) => typeof el === 'object');
          nextNodes = [];
          meaningfulEl = nodes.find(filterFn);
          for (node of nodes) {
            if (filterFn(node)) {
              meaningfulEl = node;
            }
            if (node.nodes) {
              nextNodes.push(...node.nodes);
            }
          }
        }
      }
      if (!meaningfulEl || meaningfulEl.element.isConnected === false) {
        throw Parser.ErrIdNotFound;
      }
      return meaningfulEl;
    }
    genHtmlFormId(select: Selector, parentLevel: number = 0) {
      let el = this.getElementFormId(select);
      if (el instanceof IFrameHelper) {
        return el.getHtml(select, parentLevel);
      }
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
      meaningfulElParts: Omit<MeaningfulElement, 'id'> & { id?: string },
    ): MeaningfulElement {
      meaningfulElParts.id = this.genId(meaningfulElParts.id);
      const meaningfulEl = meaningfulElParts as MeaningfulElement;
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
  let htmlParser: Parser | undefined;
  export const getHtmlParser = () => {
    if (!htmlParser) {
      htmlParser = new Parser();
    }
    return htmlParser;
  };
}
