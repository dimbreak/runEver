import { MiniHtml } from '../../../../webView/miniHtml';
import MeaningfulElement = MiniHtml.MeaningfulElement;

const rx = /(?:(?:month|year|da(?:y|te))s*[\s\-_]*picker|calendar|date)/i;

export const checkCalendar = (tagName: string, element: Element) => {
  const classes = element.getAttribute('class');
  if (classes && rx.test(classes)) {
    return `role:calendar`;
  }
  return null;
};

export const cleanCalendarHtml = (
  element: MeaningfulElement,
  noRoot = false,
) => {
  if (element.label.includes('role:calendar')) {
    element.nodes?.forEach((n) => {
      if (typeof n !== 'string') {
        cleanCalendarHtml(n, true);
      }
    });
    if (noRoot) {
      element.label = element.label.replace('role:calendar', '');
    }
  }
};
