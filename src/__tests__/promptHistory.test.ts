import {
  appendPromptHistoryEntry,
  loadPromptHistory,
  navigatePromptHistory,
  savePromptHistory,
} from '../renderer/utils/promptHistory';

describe('promptHistory', () => {
  it('appends trimmed entries and ignores empty input', () => {
    expect(appendPromptHistoryEntry([], '   ')).toEqual([]);
    expect(appendPromptHistoryEntry([], '  first prompt  ')).toEqual([
      'first prompt',
    ]);
  });

  it('avoids duplicate consecutive entries', () => {
    expect(
      appendPromptHistoryEntry(['first prompt'], ' first prompt '),
    ).toEqual(['first prompt']);
  });

  it('navigates backward through history and restores the draft on the way out', () => {
    const entries = ['first prompt', 'second prompt'];

    const fromDraft = navigatePromptHistory({
      entries,
      currentIndex: null,
      currentValue: 'draft prompt',
      draft: '',
      direction: -1,
    });
    expect(fromDraft).toEqual({
      nextIndex: 1,
      nextValue: 'second prompt',
      nextDraft: 'draft prompt',
    });

    const toOlder = navigatePromptHistory({
      entries,
      currentIndex: fromDraft.nextIndex,
      currentValue: fromDraft.nextValue ?? '',
      draft: fromDraft.nextDraft,
      direction: -1,
    });
    expect(toOlder).toEqual({
      nextIndex: 0,
      nextValue: 'first prompt',
      nextDraft: 'draft prompt',
    });

    const restoreDraft = navigatePromptHistory({
      entries,
      currentIndex: 1,
      currentValue: 'second prompt',
      draft: 'draft prompt',
      direction: 1,
    });
    expect(restoreDraft).toEqual({
      nextIndex: null,
      nextValue: 'draft prompt',
      nextDraft: 'draft prompt',
    });
  });

  it('loads and saves prompt history with bounded entries', () => {
    let storedValue = '';
    const storage = {
      getItem: jest.fn((): string => storedValue),
      setItem: jest.fn((_: string, nextValue: string) => {
        storedValue = nextValue;
      }),
    };

    savePromptHistory(['one', 'two'], storage);
    expect(storage.setItem).toHaveBeenCalled();
    expect(loadPromptHistory(storage)).toEqual(['one', 'two']);
  });
});
