import { CommonUtil } from './utils/common';

const test = (
  name: string,
  args: Record<string, string>,
  tpl: string,
  expected: string,
) => {
  try {
    const result = CommonUtil.replaceJsTpl(tpl, args);
    if (result === expected) {
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name}: Expected "${expected}", got "${result}"`);
    }
  } catch (e: any) {
    console.log(`[FAIL] ${name}: Threw error: ${e.message}`);
  }
};

console.log('--- Running Tests ---');

test('Simple substitution', { foo: 'bar' }, '${args.foo}', 'bar');

test(
  'Dotted key substitution (currently fails or needs fix)',
  { 'foo.bar': 'baz' },
  '${args.foo.bar}',
  'baz',
);

test(
  'Dotted key with method call',
  { 'foo.bar': 'baz' },
  '${args.foo.bar.toUpperCase()}',
  'BAZ',
);

test(
  'Destructuring crash check',
  { 'invalid.key': 'val', valid: 'ok' },
  '${args.valid}',
  'ok',
);
