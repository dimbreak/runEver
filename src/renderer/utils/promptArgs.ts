export const extractPromptArgKeys = (text: string): string[] => {
  const keys = new Set<string>();
  const rx = /\$\{args\.([a-zA-Z0-9_]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(text))) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return Array.from(keys);
};

