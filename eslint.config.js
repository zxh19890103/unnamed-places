import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';

const ignoredPaths = [
  '**/node_modules/**',
  '**/dist/**',
  '**/release/**',
  '**/.cache/**',
  '**/.temp/**',
  '**/.data/**',
  '**/.input/**',
  '**/.DS_Store',
  '**/.worktrees/**',
  '**/.tiles/**',
  '**/.composed/**',
  '**/.photos/**',
  '**/.env.local',
  '**/pipeline/output/**',
  '**/__legacy/**',
  '**/__deprecated/**',
  '**/.superpowers/**',
  '**/coverage/**',
];

export default [
  {
    ignores: ignoredPaths,
  },
  js.configs.recommended,
  {
    files: ['app/**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: false,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
  eslintConfigPrettier,
];
