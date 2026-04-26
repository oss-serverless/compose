'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const importX = require('eslint-plugin-import-x');
const n = require('eslint-plugin-n');
const eslintConfigPrettier = require('eslint-config-prettier/flat');

const devDependencyFiles = [
  '**/*.test.js',
  '**/scripts/**',
  '**/test/**',
  '**/tests/**',
  'eslint.config.js',
  'prettier.config.js',
];

module.exports = [
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  {
    ignores: ['**/.*'],
  },
  js.configs.recommended,
  n.configs['flat/recommended-script'],
  importX.flatConfigs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.{cjs,js,mjs}', 'bin/serverless-compose'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
    rules: {
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: devDependencyFiles,
        },
      ],
      'import-x/no-unresolved': ['error', { commonjs: true }],
      'no-unused-vars': [
        'error',
        {
          caughtErrors: 'all',
        },
      ],
      'n/no-unsupported-features/node-builtins': ['error', { allowExperimental: true }],
      'n/no-extraneous-require': 'off',
      'n/no-unpublished-require': 'off',
      'n/no-missing-require': 'off',
      'n/no-process-exit': 'off',
      'n/no-deprecated-api': 'off',
      'n/hashbang': 'off',
    },
  },
  {
    files: ['bin/serverless-compose', 'components/**/*.js', 'src/**/*.js'],
    rules: {
      'n/no-unpublished-require': 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.test.js', '**/test/**'],
    languageOptions: {
      globals: globals.mocha,
    },
    rules: {
      'no-unused-expressions': 'off',
    },
  },
];
