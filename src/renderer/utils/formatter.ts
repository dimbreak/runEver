export const normalizeUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasProtocol ? trimmed : `https://${trimmed}`;
};
