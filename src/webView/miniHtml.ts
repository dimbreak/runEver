import { SliderSkill } from '../agentic/addOns/skills/slider/slider.html';
import { IFrameHelper } from './iframe';
import { CommonUtil } from '../utils/common';
import {
  checkCalendar,
  cleanCalendarHtml,
} from '../agentic/addOns/skills/calendar/calendar.html';
import { checkFormAndFieldCount } from '../agentic/addOns/skills/form/form.html';

const tagMatchRx = /<([a-z0-9]+)([\w\W]*?)<\/\1>/g;
export namespace MiniHtml {
  export const EL_IN_IFRAME = Symbol('EL_IN_IFRAME');
  export const iframeById: Record<string, IFrameHelper> = {};
  const PRINT_ATTRS = ['name', 'method', 'placeholder'];
  const PRINT_EMPTY_ATTRS = ['disabled', 'readonly', 'required', 'hidden'];
  const INTERACTIVE_SELECTOR = [
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'button',
    'a',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[contenteditable="true"]',
  ].join(',');
  const MEDIA_SELECTOR = 'img,picture,svg,canvas,video';
  const SUBMIT_HINT_RX = /submit|continue|next|pay|checkout|sign in/i;
  const ERROR_HINT_RX = /\b(required|invalid)\b/i;
  const BLOCK_HINT_RX =
    /\b(ad|ads|sponsor|promo|recommend|related|cookie|newsletter|footer|nav)\b/i;
  const DIALOG_HINT_RX = /\b(modal|dialog|popup|drawer|sheet)\b/i;
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
    XYWH: string;
    needDim?: boolean;
  };
  const spaceRx = /[\s\t\n\u200c\u0020\u034f]{2,}/g;
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
      XYWH: `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}`,
      needDim:
        style.float !== 'none' ||
        (style.alignSelf !== 'auto' && style.alignSelf !== 'start') ||
        style.position === 'fixed' ||
        style.position === 'absolute' ||
        style.position === 'sticky' ||
        style.transform !== 'none' ||
        (style.position === 'relative' &&
          ((style.top !== 'auto' && style.top !== '0px') ||
            (style.left !== 'auto' && style.left !== '0px') ||
            (style.right !== 'auto' && style.right !== '0px') ||
            (style.bottom !== 'auto' && style.bottom !== '0px'))) ||
        style.direction === 'rtl' ||
        style.display === 'flex' ||
        style.flexBasis !== 'auto',
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
      // display:contents removes the element's box but renders children
      // normally — not truly size0.
      if (style.display === 'contents') {
        visible.visible = '';
        return visible;
      }
      // If overflow is not clipped, children can overflow a 0-dimension
      // parent and still be visible (common on Amazon buy-panel wrappers).
      if (
        style.overflow !== 'hidden' &&
        style.overflowX !== 'hidden' &&
        style.overflowY !== 'hidden' &&
        el.children.length > 0
      ) {
        return visible; // stays visible:true
      }
      visible.visible = 'size0';
      return visible;
    }

    const { scrollX, scrollY } = window;

    // outOfDoc = element at negative document coordinates, unreachable by
    // scrolling (e.g. left:-9999px off-screen tricks).  Elements merely
    // outside the current viewport but scroll-reachable stay visible:true;
    // the compressor will demote them to LITE/MIN via area-ratio scoring.
    if (
      rect.right + scrollX < 0 ||
      rect.bottom + scrollY < 0
    ) {
      visible.visible = 'outOfDoc';
      return visible;
    }

    const elAtXY = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

    if (
      el.tagName !== 'INPUT' &&
      elAtXY &&
      elAtXY !== el &&
      !elementContains(el, elAtXY)
    ) {
      visible.visible = 'covered';
      return visible;
    }

    return visible;
  };
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
    const extra = '';
    const res =
      SliderSkill.checkSlider(tagName, element) ??
      checkCalendar(tagName, element) ??
      (tagName === 'form'
        ? checkFormAndFieldCount(element as HTMLFormElement)
        : null);
    if (res) {
      return res;
    }
    if (tagName === 'iframe') {
      return (
        element.getAttribute('title') || element.getAttribute('name') || ''
      );
    }

    return [
      element.getAttribute('alt') ?? '',
      element.getAttribute('title') ?? '',
      element.getAttribute('aria-label') ?? '',
      element.getAttribute('aria-labelledby') ?? '',
      role && role !== tagName ? `role:${role}` : '',
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
  type HtmlDetailLevel = 'FULL' | 'LITE' | 'MIN';
  type SnapshotCompression = {
    viewportWidth: number;
    viewportHeight: number;
    viewportArea: number;
  };
  export type FullHtmlOptions = {
    disableSlim?: boolean;
  };
  type BlockCompressionAnalysis = {
    level: HtmlDetailLevel;
    score: number;
    areaRatio: number;
    summary: string;
    interactables: string[];
    keepReason?: string;
  };

  function needDim(
    visible:
      | (DOMRect & {
          visible: boolean | 'outOfDoc' | 'covered' | 'hide' | 'size0' | '';
          style: CSSStyleDeclaration;
          XYWH: string;
          needDim?: boolean;
        })
      | null,
  ) {
    if (
      visible?.needDim &&
      visible.x + visible.width > 0 &&
      visible.y + visible.height > 0 &&
      visible.x < window.innerWidth &&
      visible.y < window.innerHeight
    ) {
      return true;
    }
  }

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
    compressionCache = new WeakMap<HTMLElement, BlockCompressionAnalysis>();
    constructor(public idPrefix = '®') {
      this.reset();
    }
    async genHtml(
      meaningfulEl: MeaningfulElement,
      childLevel: number,
      notShow = false,
      parentHighlightStyle: string = '',
      renderedHtml: null | Map<MeaningfulElement, string> = null,
      rerendered = false,
      forceDim = false,
      compression: SnapshotCompression | null = null,
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

      // Early exit: skip full subtree for truly non-visible elements.
      // Only 'hide' (display:none / visibility:hidden / opacity:0) and
      // 'outOfDoc' (negative document coords) guarantee children are also
      // invisible.  'size0' parents can have overflowing visible children,
      // and 'covered' parents can have children positioned outside the
      // covered area — so those must recurse normally.
      if (
        (visible.visible === 'hide' || visible.visible === 'outOfDoc') &&
        !ifInteractive(tagName, element)
      ) {
        const labelAttr = meaningfulEl.label?.length
          ? ` label=${quoteAttrVal(meaningfulEl.label)}`
          : '';
        return `<${tagName} ${visible.visible}${labelAttr} />`;
      }

      const blockAnalysis =
        compression && this.canCompressBlock(meaningfulEl)
          ? this.analyzeBlock(meaningfulEl, compression)
          : null;
      if (blockAnalysis && blockAnalysis.level !== 'FULL') {
        return this.renderCompressedBlock(
          meaningfulEl,
          blockAnalysis,
          forceDim,
        );
      }
      const preserveActionPanelChildren =
        compression && this.isPriorityActionPanel(meaningfulEl, compression);
      const childCompression =
        blockAnalysis?.keepReason ||
        preserveActionPanelChildren ||
        (blockAnalysis?.level === 'FULL' &&
          (this.isRepeatedCard(element) || this.hasDenseActions(element)))
          ? null
          : compression;
      let fontIndex = this.styles.font[style.fontFamily];
      if (fontIndex === undefined) {
        fontIndex = Object.keys(this.styles.font).length;
        this.styles.font[style.fontFamily] = fontIndex;
      }

      let isVisible = visible.visible === true;
      if (isVisible) {
        cleanCalendarHtml(meaningfulEl);
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
                forceDim,
                childCompression,
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
      if (tagName === 'body') {
        return innerHtml ?? '';
      }
      const el = meaningfulEl.element;
      const attrs = PRINT_ATTRS.map((attr) => [attr, el.getAttribute(attr)])
        .filter((attr) => !!attr[1])
        .map((attr) => `${attr[0]}=${quoteAttrVal(attr[1]!)}`);
      let typeAttr = el.getAttribute('type');

      attrs.push(
        ...PRINT_EMPTY_ATTRS.filter((attr) => el.hasAttribute(attr)).map(
          (attr) => `${attr}=1`,
        ),
      );

      if (fontIndex === undefined) {
        fontIndex = Object.keys(this.styles.font).length;
        this.styles.font[style.fontFamily] = fontIndex;
      }
      let href = '';
      if (typeAttr) {
        typeAttr = typeAttr.toLowerCase();
        if (tagName === 'button' && typeAttr !== 'button') {
          attrs.push(`type=${quoteAttrVal(typeAttr)}`);
        } else if (tagName === 'input') {
          if (
            (typeAttr === 'checkbox' || typeAttr === 'radio') &&
            (el as HTMLInputElement).checked
          ) {
            attrs.push(`checked`);
          } else if (typeAttr === 'file') {
            // force id to file input
            isVisible = true;
            attrs.push(`type=${quoteAttrVal(typeAttr)}`);
          } else if (typeAttr !== 'text') {
            attrs.push(`type=${quoteAttrVal(typeAttr)}`);
          }
        }
      }

      if (
        tagName === 'button' &&
        el.hasAttribute('disabled') &&
        innerHtml?.includes('<')
      ) {
        innerHtml = innerHtml.replace(tagMatchRx, '<$1 disabled=1$2</$1>');
      } else if (isVisible && tagName === 'a') {
        const h = element.getAttribute('href');
        if (h && h.includes('://') && !h.startsWith(window.location.origin)) {
          href = `href=${h.split('/')[2]}`;
        }
      }
      let tagHtmls = [
        tagName,
        isVisible ||
        tagName === 'input' ||
        tagName === 'select' ||
        tagName === 'textarea'
          ? `id=${meaningfulEl.id ? meaningfulEl.id : ''}`
          : '',
        href,
        meaningfulEl.label?.length
          ? `label=${quoteAttrVal(meaningfulEl.label)}`
          : '',
        // eslint-disable-next-line no-nested-ternary
        notShow
          ? ''
          : isVisible
            ? ''
            : `${visible.visible === false ? 'hide' : visible.visible}`,
        isVisible && (forceDim || needDim(visible))
          ? `xywh=${visible.XYWH}`
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
        tagName === 'input' || tagName === 'textarea' || tagName === 'select'
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
    getIdByEl(
      el: Element | null,
      checkChildIfNotFound: boolean,
    ): string | undefined {
      let id = el ? this.meaningFulElementByEl.get(el)?.id : undefined;
      if (id === undefined && el?.children.length && checkChildIfNotFound) {
        for (let i = 0; i < el.children.length; i++) {
          id = this.getIdByEl(el.children.item(i), true);
          if (id) {
            return id;
          }
        }
      }
      return id;
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
    handleMutations = async (mutations: MutationRecord[]) => {
      let meaningfulEl: MeaningfulElement | null = null;
      // console.info('mutations', mutations);
      mutations.forEach((record) => {
        switch (record.target.nodeType) {
          case Node.TEXT_NODE:
            if (record.target.parentElement) {
              meaningfulEl =
                this.meaningFulElementByEl.get(record.target.parentElement) ??
                null;
              if (meaningfulEl) {
                this.mutatedElements.set(
                  record.target.parentElement,
                  meaningfulEl,
                );
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
                        const p = meaningfulEl.nodes?.indexOf(toRemove);
                        if (p !== undefined && p !== -1) {
                          // console.log('removing', toRemove, meaningfulEl);
                          meaningfulEl.nodes?.splice(
                            meaningfulEl.nodes?.indexOf(toRemove),
                            1,
                          );
                        }
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
      // console.info(
      //   'after mutations',
      //   mutations,
      //   (await this.genFullHtml()).length,
      //   (this.meaningFulElements[0] as MeaningfulElement).nodes?.slice(),
      //   this.idPrefix,
      // );
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
      this.compressionCache = new WeakMap<
        HTMLElement,
        BlockCompressionAnalysis
      >();
      this.styles = { highlight: {}, font: {} };
      this.parseElement(document.body);
      this.initStyles = {
        highlight: { ...this.styles.highlight },
        font: { ...this.styles.font },
      };
      this.initObserve();
    }
    genFullHtml = async (forceDim = false, options: FullHtmlOptions = {}) => {
      const style = window.getComputedStyle(document.body);
      const { styles } = this;
      const compression = options.disableSlim
        ? null
        : this.buildCompressionContext();
      this.compressionCache = new WeakMap<
        HTMLElement,
        BlockCompressionAnalysis
      >();
      this.styles.font[style.fontFamily] = 0;
      const highlightStyle = `${style.font.replace(style.fontFamily, `ff0`)} ${rgbToHex(style.color)}`;
      const html = (
        await Promise.all(
          this.meaningFulElements.map((el) =>
            typeof el === 'string'
              ? Promise.resolve(el)
              : this.genHtml(
                  el,
                  9999,
                  false,
                  highlightStyle,
                  undefined,
                  undefined,
                  forceDim,
                  compression ?? null,
                ),
          ),
        )
      ).join('');
      this.lastFullHtml = html;
      const searchContext = this.getSearchContext();
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
  )};</script>${searchContext ? `<search-context q=${quoteAttrVal(searchContext)} />` : ''}${html}`;
    };
    genId(id: string | undefined) {
      // eslint-disable-next-line no-nested-ternary
      let thisId = id
        ? this.idPrefix === '®'
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
      let label = getReadableAttr(element);
      if (!label.endsWith(')') && label.length > 32) {
        label = `${label.slice(0, 32)}...`;
      }
      const placeholder: MeaningfulElement = {
        id: '',
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

    getElementFormId(select: Selector): MeaningfulElement | IFrameHelper {
      const selector = typeof select === 'object' ? select : { id: select };
      selector.id = selector.id.trim();
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
        throw new Error(`ERR_ID_NOT_FOUND:${selector.id}`);
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

    private buildCompressionContext(): SnapshotCompression {
      // getBoundingClientRect() is viewport-relative, so these scores
      // automatically track the current scroll position.
      const viewportWidth = Math.max(window.innerWidth, 1);
      const viewportHeight = Math.max(window.innerHeight, 1);
      return {
        viewportWidth,
        viewportHeight,
        viewportArea: viewportWidth * viewportHeight,
      };
    }

    private normalizeSnippet(
      value: string | null | undefined,
      maxLen = 48,
    ): string {
      if (!value) return '';
      return value
        .replace(spaceRx, ' ')
        .replace(/["<>]/g, '')
        .trim()
        .slice(0, maxLen);
    }

    private getNodeSnippet(
      nodes: (string | MeaningfulElement)[] | undefined,
      maxLen = 120,
    ): string {
      if (!nodes?.length) return '';
      let snippet = '';
      const walk = (items: (string | MeaningfulElement)[]) => {
        for (const node of items) {
          if (snippet.length >= maxLen) {
            return;
          }
          if (typeof node === 'string') {
            snippet += ` ${node}`;
            continue;
          }
          if (node.label) {
            snippet += ` ${node.label}`;
          }
          if (node.nodes?.length) {
            walk(node.nodes);
          }
        }
      };
      walk(nodes);
      return this.normalizeSnippet(snippet, maxLen);
    }

    private getSearchContext(): string {
      const values: string[] = [];
      const url = new URL(window.location.href);
      ['q', 'query', 'k', 'search', 'keyword'].forEach((key) => {
        const value = url.searchParams.get(key);
        if (value) {
          values.push(this.normalizeSnippet(value, 160));
        }
      });
      Array.from(
        document.querySelectorAll(
          'input[type="search"],input[name="q"],input[name="query"],input[name="k"],input[aria-label*="search" i]',
        ),
      )
        .filter(
          (el): el is HTMLInputElement =>
            el instanceof HTMLInputElement &&
            this.isProbablyVisibleElement(el) &&
            !!el.value.trim(),
        )
        .forEach((el) => values.push(this.normalizeSnippet(el.value, 160)));
      return values
        .filter((value, index) => values.indexOf(value) === index)
        .join('|');
    }

    private isProbablyVisibleElement(element: HTMLElement) {
      if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      const style = window.getComputedStyle(element);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0
      );
    }

    private getHorizontalScrollVisibility(element: HTMLElement) {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const overflowX = style.overflowX.toLowerCase();
        const isHorizontalScroller =
          ['auto', 'scroll'].includes(overflowX) &&
          parent.scrollWidth - parent.clientWidth > 24;
        if (isHorizontalScroller) {
          const parentRect = parent.getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          const clippedWidth = Math.max(
            0,
            Math.min(rect.right, parentRect.right) -
              Math.max(rect.left, parentRect.left),
          );
          const visibleRatio = clippedWidth / Math.max(rect.width, 1);
          return {
            visibleRatio,
            mostlyVisible: visibleRatio >= 0.55,
          };
        }
        parent = parent.parentElement;
      }
      return null;
    }

    private describeInteractable(element: HTMLElement): string {
      const tagName = element.tagName.toLowerCase();
      const type = (element.getAttribute('type') || '').toLowerCase();
      const meaningfulId = this.meaningFulElementByEl.get(element)?.id;
      const isSearchInput =
        tagName === 'input' &&
        (type === 'search' ||
          ['q', 'query', 'k'].includes(
            (element.getAttribute('name') || '').toLowerCase(),
          ) ||
          /search/i.test(element.getAttribute('aria-label') || ''));
      const text = this.normalizeSnippet(
        [
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('placeholder'),
          element.getAttribute('name'),
          (element as HTMLInputElement).value,
          element.textContent,
        ]
          .filter(Boolean)
          .join(' '),
        isSearchInput ? 120 : 28,
      );
      const basePrefix =
        tagName === 'input' && type ? `${tagName}:${type}` : tagName;
      const prefix = meaningfulId
        ? `${basePrefix}#${meaningfulId}`
        : basePrefix;
      return text ? `${prefix}(${text})` : prefix;
    }

    private getBlockInteractables(
      element: HTMLElement,
      maxItems = 6,
    ): string[] {
      const interactables = Array.from(
        element.querySelectorAll(INTERACTIVE_SELECTOR),
      )
        .filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            this.isProbablyVisibleElement(child),
        )
        .map((child) => this.describeInteractable(child))
        .filter((item, index, items) => item && items.indexOf(item) === index);
      return interactables.slice(0, maxItems);
    }

    private hasDenseActions(element: HTMLElement): boolean {
      const buttonCount = element.querySelectorAll(
        'button,[role="button"],input[type="submit"],input[type="button"]',
      ).length;
      const interactiveCount =
        element.querySelectorAll(INTERACTIVE_SELECTOR).length;
      return buttonCount >= 1 && interactiveCount >= 2;
    }

    private isPriorityActionPanel(
      meaningfulEl: MeaningfulElement,
      compression: SnapshotCompression,
    ): boolean {
      const { element } = meaningfulEl;
      const visible = meaningfulEl.visible ?? checkVisible(element);
      const submitControlCount = element.querySelectorAll(
        'button[type="submit"],input[type="submit"]',
      ).length;
      const hasForm = element.querySelectorAll('form').length > 0;
      if (
        visible.visible !== true ||
        !this.hasDenseActions(element) ||
        (!hasForm && submitControlCount < 1)
      ) {
        return false;
      }
      const clippedWidth = Math.max(
        0,
        Math.min(visible.right, compression.viewportWidth) -
          Math.max(visible.left, 0),
      );
      const clippedHeight = Math.max(
        0,
        Math.min(visible.bottom, compression.viewportHeight) -
          Math.max(visible.top, 0),
      );
      const clippedAreaRatio =
        (clippedWidth * clippedHeight) / compression.viewportArea;
      const visibleRatio =
        (clippedWidth * clippedHeight) /
        Math.max(visible.width * visible.height, 1);
      return (
        clippedWidth > 0 &&
        clippedHeight > 0 &&
        visibleRatio >= 0.45 &&
        clippedWidth <= compression.viewportWidth * 0.42 &&
        clippedHeight >= compression.viewportHeight * 0.25 &&
        clippedAreaRatio >= 0.015
      );
    }

    private getKeywordHint(element: HTMLElement): string | undefined {
      const componentType = (
        element.getAttribute('data-component-type') || ''
      ).toLowerCase();
      if (componentType.includes('search-result')) {
        return 'search result';
      }
      const raw = this.normalizeSnippet(
        [
          element.tagName.toLowerCase(),
          element.id,
          element.className,
          element.getAttribute('role'),
          element.getAttribute('aria-label'),
          element.getAttribute('aria-labelledby'),
        ]
          .filter(Boolean)
          .join(' '),
        160,
      ).toLowerCase();
      if (!raw || !BLOCK_HINT_RX.test(raw)) {
        return undefined;
      }
      if (raw.includes('footer')) return 'footer links';
      if (raw.includes('nav')) return 'navigation';
      if (raw.includes('related') || raw.includes('recommend')) {
        return 'related links';
      }
      if (raw.includes('cookie')) return 'cookie banner';
      if (raw.includes('newsletter')) return 'newsletter';
      return 'promo block';
    }

    private isImageGrid(element: HTMLElement): boolean {
      const imgCount = element.querySelectorAll(MEDIA_SELECTOR).length;
      if (imgCount < 4) return false;
      const childKeys = Array.from(element.children)
        .map((child) => {
          const el = child as HTMLElement;
          const classHead = Array.from(el.classList).slice(0, 2).join('.');
          return `${el.tagName.toLowerCase()}.${classHead}`;
        })
        .filter(Boolean);
      if (!childKeys.length) return true;
      const counts = childKeys.reduce(
        (acc, key) => {
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      return Math.max(...Object.values(counts)) >= 3;
    }

    private hasDirectKeepMatch(
      element: HTMLElement,
      selector: string,
    ): boolean {
      if (element.matches(selector)) {
        return true;
      }
      return Array.from(element.children).some(
        (child) => child instanceof HTMLElement && child.matches(selector),
      );
    }

    private getDirectTextSnippet(element: HTMLElement, maxLen = 120): string {
      return this.normalizeSnippet(
        Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join(' '),
        maxLen,
      );
    }

    private getMeaningfulChildCount(meaningfulEl: MeaningfulElement): number {
      return (
        meaningfulEl.nodes?.filter((node) => typeof node === 'object').length ??
        0
      );
    }

    private getMeaningfulDescendantCount(
      meaningfulEl: MeaningfulElement,
      limit = 12,
    ): number {
      let count = 0;
      const visit = (node: MeaningfulElement) => {
        if (!node.nodes || count >= limit) return;
        node.nodes.forEach((child) => {
          if (typeof child !== 'object' || count >= limit) return;
          count += 1;
          if (count < limit) {
            visit(child);
          }
        });
      };
      visit(meaningfulEl);
      return count;
    }

    private isRepeatedCard(element: HTMLElement): boolean {
      const componentType = (
        element.getAttribute('data-component-type') || ''
      ).toLowerCase();
      if (componentType.includes('search-result')) {
        return true;
      }
      const role = (element.getAttribute('role') || '').toLowerCase();
      const tagName = element.tagName.toLowerCase();
      if (
        !['listitem', 'article'].includes(role) &&
        !['li', 'article'].includes(tagName)
      ) {
        return false;
      }
      const parent = element.parentElement;
      if (!parent) return false;
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === element.tagName,
      ) as HTMLElement[];
      if (siblings.length < 4) return false;
      const ownKey = [
        tagName,
        role,
        Array.from(element.classList).slice(0, 2).join('.'),
        element.childElementCount,
      ].join('|');
      const similarCount = siblings.filter((child) => {
        const childRole = (child.getAttribute('role') || '').toLowerCase();
        const childKey = [
          child.tagName.toLowerCase(),
          childRole,
          Array.from(child.classList).slice(0, 2).join('.'),
          child.childElementCount,
        ].join('|');
        return childKey === ownKey;
      }).length;
      return similarCount >= 4;
    }

    private hasSearchResultDescendants(element: HTMLElement): boolean {
      return (
        element.querySelectorAll('[data-component-type*="search-result"]')
          .length >= 3
      );
    }

    private getKeepReason(element: HTMLElement): string | undefined {
      if (
        this.hasDirectKeepMatch(
          element,
          'form,input:not([type="hidden"]),select,textarea',
        )
      ) {
        return 'form';
      }
      if (
        this.hasDirectKeepMatch(
          element,
          'button[type="submit"],input[type="submit"]',
        ) ||
        Array.from(element.children).some(
          (child) =>
            child instanceof HTMLElement &&
            (child.matches('button,input,[aria-label]') ||
              child.getAttribute('role') === 'button') &&
            SUBMIT_HINT_RX.test(
              (
                child.getAttribute('aria-label') ||
                child.textContent ||
                ''
              ).trim(),
            ),
        )
      ) {
        return 'submit';
      }
      if (
        element.hasAttribute('aria-live') ||
        this.hasDirectKeepMatch(
          element,
          '[aria-live],.error,.validation,[aria-invalid="true"]',
        ) ||
        ERROR_HINT_RX.test(this.getDirectTextSnippet(element, 160))
      ) {
        return 'validation';
      }
      const semanticText = this.normalizeSnippet(
        [
          element.tagName.toLowerCase(),
          element.id,
          element.className,
          element.getAttribute('role'),
          element.getAttribute('aria-label'),
          element.getAttribute('aria-modal'),
        ]
          .filter(Boolean)
          .join(' '),
        160,
      );
      if (
        element.tagName.toLowerCase() === 'dialog' ||
        element.getAttribute('role') === 'dialog' ||
        element.getAttribute('role') === 'alertdialog' ||
        element.getAttribute('aria-modal') === 'true' ||
        DIALOG_HINT_RX.test(semanticText)
      ) {
        return 'dialog';
      }
      return undefined;
    }

    private canCompressBlock(meaningfulEl: MeaningfulElement): boolean {
      const { element } = meaningfulEl;
      const tagName = element.tagName.toLowerCase();
      const visible = meaningfulEl.visible ?? checkVisible(element);
      const directChildCount = this.getMeaningfulChildCount(meaningfulEl);
      const descendantCount = this.getMeaningfulDescendantCount(meaningfulEl);
      const viewportWidth = Math.max(window.innerWidth, 1);
      const viewportHeight = Math.max(window.innerHeight, 1);
      const clippedWidth = Math.max(
        0,
        Math.min(visible.right, viewportWidth) - Math.max(visible.left, 0),
      );
      const clippedHeight = Math.max(
        0,
        Math.min(visible.bottom, viewportHeight) - Math.max(visible.top, 0),
      );
      const clippedAreaRatio =
        (clippedWidth * clippedHeight) / (viewportWidth * viewportHeight);
      const isLargeViewportContainer =
        clippedAreaRatio >= 0.18 &&
        clippedWidth >= viewportWidth * 0.45 &&
        clippedHeight >= viewportHeight * 0.35;
      const isScrollableViewportSection =
        clippedHeight >= viewportHeight * 0.35 &&
        element.scrollHeight - visible.height > viewportHeight * 0.3;
      if (tagName === 'body' || tagName === 'iframe') {
        return false;
      }
      if (visible.visible !== true) {
        return true;
      }
      if (isLargeViewportContainer || isScrollableViewportSection) {
        return false;
      }
      if (
        !(element.getAttribute('data-component-type') || '').includes(
          'search-result',
        ) &&
        this.hasSearchResultDescendants(element)
      ) {
        return false;
      }
      if (descendantCount >= 8) {
        return false;
      }
      return directChildCount < 4;
    }

    private buildBlockSummary(
      meaningfulEl: MeaningfulElement,
      textSnippet: string,
      interactables: string[],
      keywordHint: string | undefined,
      linkCount: number,
      imgCount: number,
    ): string {
      const summary =
        [
          keywordHint,
          textSnippet,
          interactables.length ? interactables.join('|') : '',
          linkCount >= 4 ? `${linkCount} links` : '',
          imgCount >= 4 ? `${imgCount} media` : '',
          meaningfulEl.label,
          meaningfulEl.element.tagName.toLowerCase(),
        ].find((item) => !!item) ?? meaningfulEl.element.tagName.toLowerCase();
      return this.normalizeSnippet(summary, 42);
    }

    private analyzeBlock(
      meaningfulEl: MeaningfulElement,
      compression: SnapshotCompression,
    ): BlockCompressionAnalysis {
      const cached = this.compressionCache.get(meaningfulEl.element);
      if (cached) {
        return cached;
      }
      const { element } = meaningfulEl;
      const tagName = element.tagName.toLowerCase();
      const visible = meaningfulEl.visible ?? checkVisible(element);
      const keepReason =
        visible.visible === true ? this.getKeepReason(element) : undefined;
      const interactables = this.getBlockInteractables(element);
      const textSnippet =
        this.getNodeSnippet(meaningfulEl.nodes, 120) ||
        this.normalizeSnippet(element.textContent, 120);
      const wordCount = Math.max(
        textSnippet.split(/\s+/).filter(Boolean).length,
        1,
      );
      const linkCount = element.querySelectorAll('a,[role="link"]').length;
      const imgCount = element.querySelectorAll(MEDIA_SELECTOR).length;
      const keywordHint = this.getKeywordHint(element);
      const repeatedCard = this.isRepeatedCard(element);
      const imageGrid = this.isImageGrid(element);
      const buttonCount = element.querySelectorAll(
        'button,[role="button"],input[type="submit"],input[type="button"]',
      ).length;
      const isHeading = /^h[1-4]$/.test(tagName);
      const isTitleLike =
        isHeading ||
        ((tagName === 'a' || tagName === 'button') &&
          !!element.querySelector('h1,h2,h3,h4'));
      const horizontalScrollVisibility =
        this.getHorizontalScrollVisibility(element);
      const horizontalVisibleRatio =
        horizontalScrollVisibility?.visibleRatio ?? 1;
      const inHorizontalViewport = horizontalVisibleRatio > 0.1;
      const mostlyInHorizontalViewport =
        horizontalScrollVisibility?.mostlyVisible ?? true;
      const clippedWidth = Math.max(
        0,
        Math.min(visible.right, compression.viewportWidth) -
          Math.max(visible.left, 0),
      );
      const clippedHeight = Math.max(
        0,
        Math.min(visible.bottom, compression.viewportHeight) -
          Math.max(visible.top, 0),
      );
      const viewportPaddingX = compression.viewportWidth * 0.5;
      const viewportPaddingY = compression.viewportHeight * 0.5;
      const expandedClippedWidth = Math.max(
        0,
        Math.min(visible.right, compression.viewportWidth + viewportPaddingX) -
          Math.max(visible.left, -viewportPaddingX),
      );
      const expandedClippedHeight = Math.max(
        0,
        Math.min(
          visible.bottom,
          compression.viewportHeight + viewportPaddingY,
        ) - Math.max(visible.top, -viewportPaddingY),
      );
      const areaRatio =
        (clippedWidth * clippedHeight) / compression.viewportArea;
      const expandedVisibleRatio =
        (expandedClippedWidth * expandedClippedHeight) /
        Math.max(visible.width * visible.height, 1);
      const centerX = visible.left + visible.width / 2;
      const centerY = visible.top + visible.height / 2;
      const dx = centerX - compression.viewportWidth / 2;
      const dy = centerY - compression.viewportHeight / 2;
      const maxDistance =
        Math.sqrt(
          (compression.viewportWidth / 2) ** 2 +
            (compression.viewportHeight / 2) ** 2,
        ) || 1;
      const centerDistance = Math.sqrt(dx ** 2 + dy ** 2) / maxDistance;
      const inFold =
        expandedClippedWidth > 0 &&
        expandedClippedHeight > 0 &&
        inHorizontalViewport;
      const mostlyInViewport =
        inFold &&
        mostlyInHorizontalViewport &&
        expandedVisibleRatio >= 0.45 &&
        areaRatio >= 0.012 &&
        centerDistance <= 0.8;
      const isActionPanel =
        visible.visible === true &&
        inFold &&
        buttonCount >= 1 &&
        interactables.length >= 2 &&
        (areaRatio >= 0.012 ||
          clippedHeight >= compression.viewportHeight * 0.18) &&
        !imageGrid;
      const linkDensity = linkCount / wordCount;
      let score = 0;
      if (areaRatio >= 0.18) score += 4;
      else if (areaRatio >= 0.08) score += 3;
      else if (areaRatio >= 0.03) score += 2;
      else if (areaRatio < 0.01) score -= 2;
      if (inFold) {
        if (expandedVisibleRatio >= 0.75) score += 5;
        else if (expandedVisibleRatio >= 0.45) score += 4;
        else if (expandedVisibleRatio >= 0.25) score += 2;
      } else {
        score -= 1;
      }
      if (inFold) {
        if (centerDistance <= 0.35) score += 3;
        else if (centerDistance <= 0.7) score += 2;
      } else if (centerDistance > 0.85) {
        score -= 1;
      }
      if (visible.visible === true && visible.style.pointerEvents !== 'none') {
        score += 1;
      } else {
        score -= 3;
      }
      if (horizontalScrollVisibility) {
        if (horizontalVisibleRatio >= 0.6) score += 2;
        else if (horizontalVisibleRatio >= 0.3) score -= 1;
        else score -= 5;
      }
      if (isTitleLike) {
        if (textSnippet.length >= 12) score += 4;
        if (inFold) score += 3;
      }
      if (isActionPanel) {
        score += 5;
      }
      if (interactables.length >= 2) score += 1;
      if (textSnippet.length >= 48) score += 1;
      if (linkDensity > 0.6) score -= 3;
      else if (linkDensity > 0.3) score -= 2;
      if (imageGrid) score -= 2;
      if (keywordHint) {
        if (keywordHint === 'cookie banner') {
          score -= 1;
        } else if (keywordHint !== 'search result') {
          score -= 2;
        }
      }
      if (
        ['fixed', 'sticky'].includes(visible.style.position) &&
        !isActionPanel
      ) {
        score -= 1;
      }
      if (!inFold && areaRatio < 0.03) {
        score -= 1;
      }
      if (repeatedCard) {
        if (
          inFold &&
          centerDistance <= 0.95 &&
          expandedVisibleRatio >= 0.12 &&
          areaRatio >= 0.004 &&
          visible.visible === true
        ) {
          score += 6;
        } else {
          score -= 1;
        }
      }

      let level: HtmlDetailLevel = 'FULL';
      if (!keepReason) {
        if (
          mostlyInViewport &&
          visible.visible === true &&
          !imageGrid &&
          linkDensity <= 0.9 &&
          keywordHint !== 'navigation' &&
          keywordHint !== 'footer links'
        ) {
          level = 'FULL';
        } else if (isActionPanel) {
          level = expandedVisibleRatio >= 0.18 ? 'FULL' : 'LITE';
        } else if (
          score >= 6 &&
          areaRatio >= 0.03 &&
          visible.visible === true &&
          !imageGrid
        ) {
          level = 'FULL';
        } else if (
          isTitleLike &&
          visible.visible === true &&
          textSnippet.length >= 8
        ) {
          level = inFold || expandedVisibleRatio >= 0.18 ? 'FULL' : 'LITE';
        } else if (
          score >= 0 ||
          keywordHint === 'search result' ||
          interactables.length > 0 ||
          textSnippet.length >= 24
        ) {
          level = 'LITE';
        } else {
          level = 'MIN';
        }
        if (areaRatio < 0.01 && interactables.length === 0 && !isTitleLike) {
          level = 'MIN';
        }
        if (
          !inFold &&
          (linkDensity > 0.9 ||
            (keywordHint &&
              keywordHint !== 'search result' &&
              areaRatio < 0.03))
        ) {
          level = 'MIN';
        }
        if (
          keywordHint === 'search result' &&
          visible.visible === true &&
          areaRatio >= 0.008
        ) {
          level = 'LITE';
        }
        if (
          repeatedCard &&
          inFold &&
          mostlyInHorizontalViewport &&
          expandedVisibleRatio >= 0.12 &&
          areaRatio >= 0.004 &&
          visible.visible === true &&
          linkDensity <= 0.95
        ) {
          level = 'FULL';
        } else if (keywordHint === 'search result' && level === 'FULL') {
          level = 'LITE';
        }
        if (horizontalScrollVisibility && horizontalVisibleRatio < 0.12) {
          level = 'MIN';
        } else if (
          horizontalScrollVisibility &&
          horizontalVisibleRatio < 0.55 &&
          level === 'FULL'
        ) {
          level = 'LITE';
        }
        if (visible.visible === 'hide' || visible.visible === 'size0') {
          level =
            interactables.length > 0 || textSnippet.length >= 24
              ? 'LITE'
              : 'MIN';
        } else if (
          (visible.visible === 'covered' || visible.visible === 'outOfDoc') &&
          level === 'FULL'
        ) {
          level = 'LITE';
        }
        if (isTitleLike && visible.visible === true && level === 'MIN') {
          level = 'LITE';
        }
      }
      const analysis: BlockCompressionAnalysis = {
        level,
        score,
        areaRatio,
        summary: this.buildBlockSummary(
          meaningfulEl,
          textSnippet,
          interactables,
          keywordHint,
          linkCount,
          imgCount,
        ),
        interactables,
        keepReason,
      };
      this.compressionCache.set(element, analysis);
      return analysis;
    }

    private renderCompressedBlock(
      meaningfulEl: MeaningfulElement,
      analysis: BlockCompressionAnalysis,
      forceDim: boolean,
    ): string {
      const visible = meaningfulEl.visible!;
      const tagName = meaningfulEl.element.tagName.toLowerCase();
      const attrs = [
        tagName,
        `id=${meaningfulEl.id}`,
        analysis.level === 'LITE' ? 'lite' : 'min',
        meaningfulEl.label
          ? `label=${quoteAttrVal(this.normalizeSnippet(meaningfulEl.label, 32))}`
          : '',
        analysis.level === 'LITE'
          ? `liteBody=${quoteAttrVal(analysis.summary)}`
          : `minMeta=${quoteAttrVal(analysis.summary)}`,
        analysis.level === 'LITE' && analysis.interactables.length
          ? `interact=${quoteAttrVal(analysis.interactables.join('|'))}`
          : '',
        visible.visible === true && (forceDim || needDim(visible))
          ? `xywh=${visible.XYWH}`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<${attrs} />`;
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
