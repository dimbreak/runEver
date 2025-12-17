/**
 * Normalises a URL value by adding https:// protocol if missing
 * @param value - The URL string to normalise
 * @returns The normalised URL or empty string if value is empty
 */
export const normalizeUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasProtocol ? trimmed : `https://${trimmed}`;
};

/**
 * Resolves the initial URL for a tab, falling back to 'about:blank' if empty
 * @param url - The URL string to resolve
 * @returns The resolved URL or 'about:blank' if empty
 */
export const resolveInitialUrl = (url: string) => {
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : 'about:blank';
};
