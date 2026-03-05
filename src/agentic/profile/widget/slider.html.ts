export namespace SliderProfile {
  export const checkSlider = (tagName: string, element: Element) => {
    const roles = [];
    if (tagName === 'input') {
      if (element.getAttribute('type') === 'range') {
        roles.push(
          `now:${(element as HTMLInputElement).value || 0}`,
          `min:${element.getAttribute('min') ?? 0}`,
          `max:${element.getAttribute('min') ?? 0}`,
          `step:${element.getAttribute('step') ?? 1}`,
        );
      } else {
        return null;
      }
    }
    const role = element.getAttribute('role');
    if (role === 'slider') {
      const valueText = element.getAttribute('aria-valuetext');
      const textNum = valueText
        ? parseFloat(valueText.replace(/[^0-9.\-]/g, ''))
        : NaN;
      let v = !Number.isNaN(textNum)
        ? String(textNum)
        : element.getAttribute('aria-valuenow');
      if (v) {
        roles.push(`now:${v}`);
      }
      v = element.getAttribute('aria-valuemin');
      if (v) {
        roles.push(`min:${v}`);
      }
      v = element.getAttribute('aria-valuemax');
      if (v) {
        roles.push(`max:${v}`);
      }
    }
    return roles.length ? `role:slider(${roles.join(',')})` : null;
  };
}
