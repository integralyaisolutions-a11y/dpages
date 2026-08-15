// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      // Placeholder de Michel: sin código propio todavía.
      'packages/frontend/**',
    ],
  },
  js.configs.recommended,
  {
    // El type-checking (y projectService, que necesita un tsconfig.json que
    // "include" cada archivo) sólo se aplica a TypeScript. Los .js sueltos de
    // la raíz (este archivo, commitlint.config.js, lint-staged.config.js) se
    // lintean como JS plano, sin necesitar pertenecer a ningún tsconfig.
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  prettier,
);
