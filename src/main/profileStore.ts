import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const storedUrlHistoryEntrySchema = z.object({
  url: z.string(),
  createdAt: z.number(),
  refreshedAt: z.number(),
  visitCount: z.number().int().nonnegative().default(0),
  title: z.string().optional(),
  icon: z.string().optional(),
});

const storedUrlHistoryMapSchema = z.record(
  z.string(),
  storedUrlHistoryEntrySchema,
);

const storedProfileSchema = z.object({
  urlHistory: storedUrlHistoryMapSchema.default({}),
});

const legacyStoredProfileSchema = z.object({
  urlHistory: storedUrlHistoryEntrySchema.array().default([]),
});

type StoredUrlHistoryEntry = z.infer<typeof storedUrlHistoryEntrySchema>;
export type RunEverProfile = z.infer<typeof storedProfileSchema>;
export type UrlSuggestionEntry = StoredUrlHistoryEntry;

interface ProfileStoreOptions {
  filePath?: string;
}

// eslint-disable-next-line no-use-before-define
let profileStoreInstance: ProfileStore | null = null;

export class ProfileStore {
  private cachedProfile: RunEverProfile | undefined;
  private readonly filePath: string;
  private readonly urlHistoryCache = new Map<string, StoredUrlHistoryEntry>();
  private readonly topVisitedUrls: string[] = [];
  private readonly sortedUrls: string[] = [];
  private initPromise: Promise<void> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  static getInstance() {
    if (profileStoreInstance === null) {
      profileStoreInstance = new ProfileStore();
    }
    return profileStoreInstance;
  }

  constructor(options: ProfileStoreOptions = {}) {
    this.filePath =
      options.filePath ??
      path.join(app.getPath('userData'), 'profile-store.json');
  }

  async initialize() {
    if (!this.initPromise) {
      this.initPromise = this.loadProfile();
    }
    await this.initPromise;
  }

  async refreshUrlHistory(
    url: string,
    details: { title?: string; icon?: string } = {},
    now = Date.now(),
  ) {
    if (!url) return;
    await this.enqueueMutation(async () => {
      const existing = this.urlHistoryCache.get(url);
      if (existing) {
        existing.refreshedAt = now;
        if (details.title) existing.title = details.title;
        if (details.icon) existing.icon = details.icon;
      } else {
        this.urlHistoryCache.set(url, {
          url,
          createdAt: now,
          refreshedAt: now,
          visitCount: 0,
          title: details.title,
          icon: details.icon,
        });
        this.insertSortedUrl(url);
      }
      this.syncCachedProfile();
      await this.persist();
    });
  }

  async recordUrlVisit(
    url: string,
    details: { title?: string; icon?: string } = {},
    now = Date.now(),
  ) {
    if (!url) return;
    await this.enqueueMutation(async () => {
      const existing = this.urlHistoryCache.get(url);
      if (existing) {
        existing.refreshedAt = now;
        existing.visitCount += 1;
        if (details.title) existing.title = details.title;
        if (details.icon) existing.icon = details.icon;
        this.promoteTopVisited(url);
      } else {
        this.urlHistoryCache.set(url, {
          url,
          createdAt: now,
          refreshedAt: now,
          visitCount: 1,
          title: details.title,
          icon: details.icon,
        });
        this.insertSortedUrl(url);
        this.insertTopVisitedUrl(url);
      }
      this.syncCachedProfile();
      await this.persist();
    });
  }

  async updateUrlHistoryMetadata(
    url: string,
    details: { title?: string; icon?: string },
  ) {
    if (!url || (!details.title && !details.icon)) return;
    await this.enqueueMutation(async () => {
      const existing = this.urlHistoryCache.get(url);
      if (existing) {
        if (details.title) existing.title = details.title;
        if (details.icon) existing.icon = details.icon;
      } else {
        this.urlHistoryCache.set(url, {
          url,
          createdAt: Date.now(),
          refreshedAt: Date.now(),
          visitCount: 0,
          title: details.title,
          icon: details.icon,
        });
        this.insertSortedUrl(url);
        this.insertTopVisitedUrl(url);
      }
      this.syncCachedProfile();
      await this.persist();
    });
  }

  async getUrlSuggestions(query = '', limit = 10) {
    await this.initialize();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return this.collectUniqueSuggestions(
        this.topVisitedUrls,
        () => true,
        limit,
      );
    }

    const normalizedQuery = ProfileStore.normalizeUrlLookup(trimmedQuery);
    const lowerQuery = trimmedQuery.toLowerCase();
    return this.collectUniqueSuggestions(
      this.sortedUrls,
      (entry) => {
        const normalizedUrl = ProfileStore.normalizeUrlLookup(entry.url);
        const title = entry.title?.toLowerCase() ?? '';
        return (
          normalizedUrl.includes(normalizedQuery) || title.includes(lowerQuery)
        );
      },
      limit,
    );
  }

  private async enqueueMutation(task: () => Promise<void>) {
    const nextTask = this.mutationQueue.then(async () => {
      await this.initialize();
      return task();
    });
    this.mutationQueue = nextTask.catch(() => {});
    await nextTask;
  }

  private async loadProfile() {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = storedProfileSchema.safeParse(parsed);
      if (result.success) {
        this.cachedProfile = result.data;
      } else {
        const legacyResult = legacyStoredProfileSchema.safeParse(parsed);
        if (legacyResult.success) {
          this.cachedProfile = {
            urlHistory: Object.fromEntries(
              legacyResult.data.urlHistory.map((entry) => [entry.url, entry]),
            ),
          };
        } else {
          console.warn('Failed to parse stored profile:', result.error);
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') {
        console.warn('Failed to read stored profile', error);
      }
    }
    if (!this.cachedProfile) {
      this.cachedProfile = { urlHistory: {} };
    }
    this.rebuildUrlHistoryCache();
    this.rebuildSuggestionIndexes();
    if (this.pruneExpiredUrlHistory()) {
      this.rebuildSuggestionIndexes();
      this.syncCachedProfile();
      await this.persist();
    }
  }

  private rebuildUrlHistoryCache() {
    this.urlHistoryCache.clear();
    Object.entries(this.cachedProfile?.urlHistory ?? {}).forEach(
      ([url, entry]) => {
        this.urlHistoryCache.set(url, { ...entry, url });
      },
    );
  }

  private rebuildSuggestionIndexes() {
    this.topVisitedUrls.splice(0, this.topVisitedUrls.length);
    this.sortedUrls.splice(0, this.sortedUrls.length);
    const entries = Array.from(this.urlHistoryCache.values());
    entries
      .slice()
      .filter((entry) => entry.visitCount > 0)
      .sort((left, right) => -ProfileStore.compareTopVisited(left, right))
      .slice(0, 10)
      .forEach((entry) => {
        this.topVisitedUrls.push(entry.url);
      });
    entries
      .slice()
      .sort((left, right) => ProfileStore.compareLookupKey(left.url, right.url))
      .forEach((entry) => {
        this.sortedUrls.push(entry.url);
      });
  }

  private pruneExpiredUrlHistory(now = Date.now()) {
    const threshold = now - NINETY_DAYS_MS;
    let changed = false;
    Array.from(this.urlHistoryCache.entries()).forEach(([url, entry]) => {
      if (entry.refreshedAt < threshold) {
        this.urlHistoryCache.delete(url);
        changed = true;
      }
    });
    return changed;
  }

  private insertTopVisitedUrl(url: string) {
    const entry = this.urlHistoryCache.get(url);
    if (!entry || entry.visitCount <= 0) return;
    if (this.topVisitedUrls.includes(url)) {
      this.promoteTopVisited(url);
      return;
    }
    if (this.topVisitedUrls.length < 10) {
      this.topVisitedUrls.push(url);
      this.promoteTopVisited(url);
      return;
    }
    const lastUrl = this.topVisitedUrls[this.topVisitedUrls.length - 1];
    const lastEntry = lastUrl ? this.urlHistoryCache.get(lastUrl) : undefined;
    if (!lastEntry) {
      this.topVisitedUrls[this.topVisitedUrls.length - 1] = url;
      this.promoteTopVisited(url);
      return;
    }
    if (ProfileStore.compareTopVisited(entry, lastEntry) >= 0) {
      this.topVisitedUrls[this.topVisitedUrls.length - 1] = url;
      this.promoteTopVisited(url);
    }
  }

  private promoteTopVisited(url: string) {
    const currentIndex = this.topVisitedUrls.indexOf(url);
    if (currentIndex === -1) {
      this.insertTopVisitedUrl(url);
      return;
    }
    const entry = this.urlHistoryCache.get(url);
    if (!entry) return;
    let nextIndex = currentIndex;
    while (nextIndex > 0) {
      const prevUrl = this.topVisitedUrls[nextIndex - 1];
      const prevEntry = prevUrl ? this.urlHistoryCache.get(prevUrl) : undefined;
      if (prevEntry && ProfileStore.compareTopVisited(entry, prevEntry) < 0) {
        break;
      }
      this.topVisitedUrls[nextIndex] = prevUrl;
      this.topVisitedUrls[nextIndex - 1] = url;
      nextIndex -= 1;
    }
  }

  private insertSortedUrl(url: string) {
    if (this.sortedUrls.includes(url)) return;
    const targetKey = ProfileStore.normalizeUrlLookup(url);
    let low = 0;
    let high = this.sortedUrls.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midUrl = this.sortedUrls[mid];
      const midKey = ProfileStore.normalizeUrlLookup(midUrl);
      if (
        midKey.localeCompare(targetKey) < 0 ||
        (midKey === targetKey && midUrl.localeCompare(url) < 0)
      ) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this.sortedUrls.splice(low, 0, url);
  }

  private collectUniqueSuggestions(
    urls: string[],
    match: (entry: StoredUrlHistoryEntry) => boolean,
    limit: number,
  ) {
    const suggestions: StoredUrlHistoryEntry[] = [];
    const indexByKey = new Map<string, number>();
    urls.some((url) => {
      const entry = this.urlHistoryCache.get(url);
      if (!entry || !match(entry)) {
        return false;
      }
      const dedupeKey = ProfileStore.getSuggestionDedupKey(entry.url);
      const existingIndex = indexByKey.get(dedupeKey);
      if (existingIndex === undefined) {
        indexByKey.set(dedupeKey, suggestions.length);
        suggestions.push(entry);
      } else {
        const existingEntry = suggestions[existingIndex];
        if (ProfileStore.compareSuggestionQuality(entry, existingEntry) > 0) {
          suggestions[existingIndex] = entry;
        }
      }
      return suggestions.length >= limit;
    });
    return suggestions;
  }

  private static normalizeUrlLookup(url: string) {
    return url
      .trim()
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/^www\./, '');
  }

  private static getSuggestionDedupKey(url: string) {
    const normalized = this.normalizeUrlLookup(url)
      .replace(/\/+$/, '')
      .replace(/\/\?/, '?');
    return normalized || '/';
  }

  private static getMetadataQuality(entry: StoredUrlHistoryEntry) {
    let score = 0;
    if (entry.icon) {
      score += 2;
    }
    if (entry.title) {
      score += 1;
      const title = entry.title.toLowerCase();
      const lookupKey = this.getSuggestionDedupKey(entry.url);
      const hostToken = lookupKey.split(/[/?#]/)[0]?.split('.')[0];
      if (hostToken && title.includes(hostToken)) {
        score += 3;
      }
    }
    return score;
  }

  private static compareSuggestionQuality(
    left: StoredUrlHistoryEntry,
    right: StoredUrlHistoryEntry,
  ) {
    return (
      this.getMetadataQuality(left) - this.getMetadataQuality(right) ||
      this.compareTopVisited(left, right)
    );
  }

  private static compareLookupKey(leftUrl: string, rightUrl: string) {
    const leftKey = this.normalizeUrlLookup(leftUrl);
    const rightKey = this.normalizeUrlLookup(rightUrl);
    return leftKey.localeCompare(rightKey) || leftUrl.localeCompare(rightUrl);
  }

  private static compareTopVisited(
    left: StoredUrlHistoryEntry,
    right: StoredUrlHistoryEntry,
  ) {
    return (
      left.visitCount - right.visitCount ||
      left.refreshedAt - right.refreshedAt ||
      -this.compareLookupKey(left.url, right.url)
    );
  }

  private syncCachedProfile() {
    if (!this.cachedProfile) {
      this.cachedProfile = { urlHistory: {} };
    }
    this.cachedProfile.urlHistory = Object.fromEntries(
      Array.from(this.urlHistoryCache.entries()).sort(
        (a, b) => b[1].refreshedAt - a[1].refreshedAt,
      ),
    );
  }

  private async persist() {
    if (!this.cachedProfile) {
      return;
    }
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify(this.cachedProfile, null, 2),
      'utf8',
    );
  }
}
