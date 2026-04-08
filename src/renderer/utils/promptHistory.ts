const PROMPT_HISTORY_STORAGE_KEY = 'runEver.agentPromptHistory.v1';
const PROMPT_HISTORY_LIMIT = 50;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

type PromptHistoryNavigationParams = {
  entries: string[];
  currentIndex: number | null;
  currentValue: string;
  draft: string;
  direction: -1 | 1;
};

export type PromptHistoryNavigationResult = {
  nextIndex: number | null;
  nextValue: string | null;
  nextDraft: string;
};

export const normalizePromptHistoryEntry = (value: string) => value.trim();

export const appendPromptHistoryEntry = (
  entries: string[],
  value: string,
  limit = PROMPT_HISTORY_LIMIT,
) => {
  const normalized = normalizePromptHistoryEntry(value);
  if (!normalized) return entries;
  if (entries[entries.length - 1] === normalized) return entries;
  return [...entries, normalized].slice(-limit);
};

const getDefaultStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const loadPromptHistory = (storage = getDefaultStorage()): string[] => {
  if (!storage) return [];

  try {
    const raw = storage.getItem(PROMPT_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map(normalizePromptHistoryEntry)
      .filter(Boolean)
      .slice(-PROMPT_HISTORY_LIMIT);
  } catch {
    return [];
  }
};

export const savePromptHistory = (
  entries: string[],
  storage = getDefaultStorage(),
) => {
  if (!storage) return;
  storage.setItem(
    PROMPT_HISTORY_STORAGE_KEY,
    JSON.stringify(entries.slice(-PROMPT_HISTORY_LIMIT)),
  );
};

export const navigatePromptHistory = ({
  entries,
  currentIndex,
  currentValue,
  draft,
  direction,
}: PromptHistoryNavigationParams): PromptHistoryNavigationResult => {
  if (entries.length === 0) {
    return {
      nextIndex: currentIndex,
      nextValue: null,
      nextDraft: draft,
    };
  }

  if (direction === -1) {
    if (currentIndex === null) {
      return {
        nextIndex: entries.length - 1,
        nextValue: entries[entries.length - 1] ?? null,
        nextDraft: currentValue,
      };
    }

    const nextIndex = Math.max(currentIndex - 1, 0);
    return {
      nextIndex,
      nextValue: entries[nextIndex] ?? null,
      nextDraft: draft,
    };
  }

  if (currentIndex === null) {
    return {
      nextIndex: null,
      nextValue: null,
      nextDraft: draft,
    };
  }

  if (currentIndex >= entries.length - 1) {
    return {
      nextIndex: null,
      nextValue: draft,
      nextDraft: draft,
    };
  }

  const nextIndex = currentIndex + 1;
  return {
    nextIndex,
    nextValue: entries[nextIndex] ?? null,
    nextDraft: draft,
  };
};
