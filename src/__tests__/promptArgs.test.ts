import { extractPromptArgKeys } from '../renderer/utils/promptArgs';

describe('extractPromptArgKeys', () => {
  it('extracts unique arg keys from prompt text', () => {
    const dollar = String.fromCharCode(36);
    const name = `${dollar}{args.name}`;
    const count = `${dollar}{args.count}`;
    const keys = extractPromptArgKeys(
      `Hello ${name}, book ${count} tickets for ${name}.`,
    );
    expect(keys.sort()).toEqual(['count', 'name']);
  });

  it('ignores non-matching placeholders', () => {
    const dollar = String.fromCharCode(36);
    const nonMatch = `${dollar}{arg.name}`;
    const empty = `${dollar}{args.}`;
    const keys = extractPromptArgKeys(`no args here ${nonMatch} ${empty}`);
    expect(keys).toEqual([]);
  });
});
