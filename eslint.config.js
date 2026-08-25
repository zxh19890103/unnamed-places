import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';

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
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  eslintConfigPrettier,
];
