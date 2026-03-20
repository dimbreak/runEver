const hasProtocol = (value: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);

const domainLikePattern =
  /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d+)?([/?#].*)?$/i;

const toGoogleSearchUrl = (value: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(value)}`;

const isDomainLike = (value: string) => domainLikePattern.test(value);

/**
 * Normalises a URL value by adding https:// protocol if missing
 * @param value - The URL string to normalise
 * @returns The normalised URL or empty string if value is empty
 */
export const normalizeUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (hasProtocol(trimmed)) return trimmed;
  if (/\s/.test(trimmed) || !isDomainLike(trimmed)) {
    return toGoogleSearchUrl(trimmed);
  }
  return `https://${trimmed}`;
};

export const applyCtrlEnterUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (hasProtocol(trimmed) || /\s/.test(trimmed)) {
    return normalizeUrlValue(trimmed);
  }
  const slashIndex = trimmed.search(/[/?#]/);
  const host = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex);
  const rest = slashIndex === -1 ? '' : trimmed.slice(slashIndex);
  if (host.includes('.') || host.toLowerCase() === 'localhost') {
    return normalizeUrlValue(trimmed);
  }
  return `https://www.${host}.com${rest}`;
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

/**
 * Formats a byte value into a human-readable string with appropriate units
 * @param bytes - The number of bytes to format
 * @returns A formatted string with the value and unit (e.g., "1.5 MB", "500 KB")
 */
export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** idx;
  let precision = 2;
  if (idx === 0) precision = 0;
  else if (value >= 10) precision = 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
};
