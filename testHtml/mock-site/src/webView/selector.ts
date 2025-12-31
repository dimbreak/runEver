const FALLBACK_ESCAPE_REGEX = /[^a-zA-Z0-9_-]/g;

const escapeCssIdentifier = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(FALLBACK_ESCAPE_REGEX, '\\$&');
};

const buildSegment = (element: Element) => {
  if (element.id) {
    return `#${escapeCssIdentifier(element.id)}`;
  }

  const tag = element.tagName.toLowerCase();
  const classNames = Array.from(element.classList)
    .filter(Boolean)
    .map(escapeCssIdentifier);
  const classSuffix = classNames.length ? `.${classNames.join('.')}` : '';

  let segment = `${tag}${classSuffix}`;
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === element.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(element) + 1;
      segment += `:nth-of-type(${index})`;
    }
  }

  return segment;
};

export const getUniqueSelector = (element: Element): string => {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current) {
    const segment = buildSegment(current);
    segments.unshift(segment);

    if (current.id || current === document.body) {
      break;
    }

    current = current.parentElement;
  }

  return segments.join(' > ');
};
