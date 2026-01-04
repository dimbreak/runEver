type SessionValue = string | number | boolean | object | null;

export function readSession<T>(key: string, fallback: T): T {
  const raw = sessionStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Failed to parse sessionStorage for ${key}`, error);
    return fallback;
  }
}

export function writeSession(key: string, value: SessionValue) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

export function removeSession(key: string) {
  sessionStorage.removeItem(key);
}
