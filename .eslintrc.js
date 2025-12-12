/* eslint-disable no-restricted-syntax */
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');

function softenRules(rules = {}) {
  const out = {};
  for (const [name, value] of Object.entries(rules)) {
    if (value === 'error' || value === 2) out[name] = 'warn';
    else if (Array.isArray(value) && (value[0] === 'error' || value[0] === 2)) {
      out[name] = ['warn', ...value.slice(1)];
    } else out[name] = value;
  }
  return out;
}

module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    ...softenRules(js.configs.recommended.rules),
    ...softenRules(tseslint.configs.recommendedTypeChecked[0].rules),
    ...softenRules(importPlugin.configs.recommended.rules),
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'react/function-component-definition': 'off',
    'jsx-a11y/anchor-is-valid': 'off',
    'import/prefer-default-export': 'off',
    'react/require-default-props': 'off',
    'jsx-a11y/label-has-associated-control': 'warn',
    'no-useless-constructor': 'warn',
    'no-empty-function': 'warn',
    'lines-between-class-members': 'warn',
    'prettier/prettier': 'warn',
    'promise/always-return': 'warn',
    'no-promise-executor-return': 'off',
    'class-methods-use-this': 'warn',
    'no-await-in-loop': 'warn',
    'consistent-return': 'warn',
    'import/no-cycle': 'warn',
    'no-script-url': 'warn',
    'prefer-destructuring': 'warn',
    'no-restricted-syntax': 'warn',
    'no-plusplus': 'warn',
    'no-use-before-define': [
      'warn',
      { functions: false, classes: true, variables: true },
    ],
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
