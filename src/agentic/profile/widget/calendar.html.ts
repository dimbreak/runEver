const rx =
  /(?:^|[\s\r\n])(?:(?:month|year|da(?:y|te))s*[\s-_]*picker|calendar|date)(?:$|[\s\r\n])/i;

export const checkCalendar = (tagName: string, element: Element) => {
  const classes = element.getAttribute('class');
  if (classes && rx.test(classes)) {
    return `role:calendar`;
  }
  return null;
};
