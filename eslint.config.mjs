import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      'packages/vscode-ext/scripts/**',
      'commitlint.config.cjs',
      '.releaserc.cjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  // eslint-config-prettier sets `curly` off (special case); re-enable after it.
  {
    files: [
      'eslint.config.mjs',
      'packages/*/src/**/*.ts',
      'packages/*/test/**/*.ts',
      'packages/core/scripts/**/*.ts',
    ],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      curly: ['error', 'all'],
    },
  },
);
