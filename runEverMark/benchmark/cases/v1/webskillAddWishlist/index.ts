import type { BenchmarkCase } from '../../../types';
import { ExecutorLlmResultSchema } from '../../../../../src/agentic/execution.schema';
import { loadPromptRecord } from '../promptRecord';

const addWishlistHref =
  'https://uat.fotopia.com.hk/skills/fotopiastore/SKILL.md';
const addWishlistFn = 'window._web_skills.fotopiaStore.addWishlist';
const fallbackArgKey = 'addedWideLensChoices';

type WishlistExpectation = {
  stockId: string;
  productId: string;
  allTokens: string[];
  anyTokens: string[];
};

const expectedWishlistItems: WishlistExpectation[] = [
  {
    stockId: 'b34b4287-a6fd-40ca-9e65-8f5e5acbc262',
    productId: '08d48132-e19e-49f1-be60-ab1d6a078d70',
    allTokens: ['summaron', '28mm'],
    anyTokens: ['rare', 'street', 'collectible', 'matte black'],
  },
  {
    stockId: '3b0b4cde-9b33-43bc-b864-4b1412be76ca',
    productId: '27746a8e-c9d0-4e9c-a98d-de526da3d0f9',
    allTokens: ['light lens lab', '28mm'],
    anyTokens: ['digital sensors', 'sharpness', 'fringing', 'asph'],
  },
  {
    stockId: 'fd9504ce-9708-464a-94b6-e3ea8cea58e8',
    productId: '98b5672d-cb87-4ded-a08f-b79ac2dc1752',
    allTokens: ['summaron', '28mm'],
    anyTokens: ['in stock', 'street', 'vintage', 'compact'],
  },
];

const allowedWishlistStockIds = [
  ...expectedWishlistItems.map((item) => item.stockId),
  'a58c2fc9-c347-494f-b335-5b8b100a0f96',
];

const { userPrompt, systemPrompt } = loadPromptRecord(
  'runEverMark/benchmark/cases/v1/webskillAddWishlist/prompt-record/log-20260407221053212.json',
);

const stripJsonFence = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed.startsWith('```')) {
    return {
      text: trimmed,
      hadFence: false,
    };
  }

  const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, '');
  return {
    text: withoutOpen.replace(/\s*```$/, '').trim(),
    hadFence: true,
  };
};

const parseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const hasAllTokens = (text: string, tokens: string[]) => {
  const normalized = normalizeText(text);
  return tokens.every((token) => normalized.includes(normalizeText(token)));
};

const hasAnyToken = (text: string, tokens: string[]) => {
  const normalized = normalizeText(text);
  return tokens.some((token) => normalized.includes(normalizeText(token)));
};

const hasRelevantWishlistComment = (
  text: string,
  expected: WishlistExpectation,
  mode: 'webskill' | 'setArg',
) => {
  if (mode === 'setArg') {
    return (
      hasAllTokens(text, expected.allTokens) && hasAnyToken(text, expected.anyTokens)
    );
  }

  return (
    hasAllTokens(text, expected.allTokens) ||
    (hasAnyToken(text, expected.allTokens) && hasAnyToken(text, expected.anyTokens))
  );
};

const evaluateWishlistLikeItems = (
  items: unknown,
  mode: 'webskill' | 'setArg',
) => {
  if (!Array.isArray(items)) {
    return {
      ok: false,
      validCount: 0,
      exactMatch: false,
      reason: 'items is not an array',
    };
  }

  const stockIds = items
    .map((item) =>
      item && typeof item === 'object' && typeof item.stockId === 'string'
        ? item.stockId
        : null,
    )
    .filter((value): value is string => Boolean(value));

  const extraStockIds = stockIds.filter(
    (stockId) => !allowedWishlistStockIds.includes(stockId),
  );
  let validCount = 0;

  for (const expected of expectedWishlistItems) {
    const matched = items.find(
      (item) =>
        item &&
        typeof item === 'object' &&
        item.stockId === expected.stockId,
    ) as
      | {
          stockId: string;
          productId?: string;
          comment?: string;
          note?: string;
        }
      | undefined;

    if (!matched) {
      continue;
    }

    if (mode === 'setArg') {
      if (typeof matched.productId !== 'string') {
        continue;
      }
      if (matched.productId !== expected.productId) {
        continue;
      }
    }

    const text = mode === 'webskill' ? matched.comment : matched.note;
    if (typeof text !== 'string') {
      continue;
    }

    if (!hasRelevantWishlistComment(text, expected, mode)) {
      continue;
    }

    validCount += 1;
  }

  const exactMatch =
    validCount === expectedWishlistItems.length &&
    items.length === expectedWishlistItems.length &&
    extraStockIds.length === 0;

  const allowedGreedyPass =
    validCount >= 2 &&
    items.length > 1 &&
    items.length <= allowedWishlistStockIds.length &&
    extraStockIds.length === 0;

  if (exactMatch) {
    return {
      ok: true,
      validCount,
      exactMatch,
    };
  }

  if (allowedGreedyPass) {
    return {
      ok: true,
      validCount,
      exactMatch,
    };
  }

  return {
    ok: false,
    validCount,
    exactMatch,
    reason:
      extraStockIds.length > 0
        ? 'wishlist item count or stock ids mismatch'
        : 'wishlist item count or stock ids mismatch',
  };
};

export const webskillAddWishlistTest: BenchmarkCase = {
  id: 'fotopia-webskill-add-wishlist',
  name: 'Fotopia WebSkill Add Wishlist',
  maxScore: 6,
  systemPrompt,
  userPrompt,
  score: ({ result }) => {
    let score = 0;
    const highlights: string[] = [];

    const stripped = stripJsonFence(result);
    if (!stripped.hadFence) {
      score += 1;
    }

    const resultJson = parseJson<unknown>(stripped.text);
    if (!resultJson) {
      return {
        score,
        highlights: ['invalid json'],
      };
    }

    const parsedResult = ExecutorLlmResultSchema.safeParse(resultJson);
    if (!parsedResult.success) {
      return {
        score,
        highlights: ['invalid executor schema'],
      };
    }

    score += 1;

    const addWishlistAction = parsedResult.data.a.find(
      (step) =>
        step.action.k === 'callWebSkill' &&
        step.action.href === addWishlistHref &&
        step.action.fnName === addWishlistFn,
    );

    if (addWishlistAction && addWishlistAction.action.k === 'callWebSkill') {
      score += 2;

      const payload = parseJson<{
        items?: unknown;
        navigateToWishlist?: boolean;
      }>(addWishlistAction.action.arg ?? '');

      if (!payload) {
        highlights.push('addWishlist arg is not valid json');
      } else {
        const evaluation = evaluateWishlistLikeItems(payload.items, 'webskill');
        if (payload.navigateToWishlist === false) {
          highlights.push('addWishlist should not disable wishlist navigation');
        }
        if (evaluation.ok) {
          score += 2;
        } else if (evaluation.validCount >= 2) {
          score += 1;
          if (evaluation.reason) {
            highlights.push(evaluation.reason);
          }
        } else if (evaluation.reason) {
          highlights.push(evaluation.reason);
        }
      }

      return {
        score,
        highlights,
      };
    }

    const fallbackSetArg = parsedResult.data.a.find(
      (step) =>
        step.action.k === 'setArg' &&
        typeof step.action.kv?.[fallbackArgKey] === 'string',
    );

    if (fallbackSetArg && fallbackSetArg.action.k === 'setArg') {
      const fallbackItems = parseJson<unknown>(
        String(fallbackSetArg.action.kv[fallbackArgKey]),
      );
      const evaluation = evaluateWishlistLikeItems(fallbackItems, 'setArg');
      if (evaluation.ok) {
        score += 2;
        highlights.push('no addWishlist call, fallback scored by setArg');
      } else if (evaluation.validCount >= 2) {
        score += 1;
        highlights.push('no addWishlist call, fallback partially scored by setArg');
        if (evaluation.reason) {
          highlights.push(evaluation.reason);
        }
      } else if (evaluation.reason) {
        highlights.push(evaluation.reason);
      }
    } else {
      highlights.push('missing addWishlist call');
    }

    return {
      score,
      highlights,
    };
  },
};
