import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      'eslint.config.mjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  // eslint-config-prettier sets `curly` off (special case); re-enable after it.
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      curly: ['error', 'all'],
    },
  },
);
