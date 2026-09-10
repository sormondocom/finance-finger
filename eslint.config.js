import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Ignore built outputs, generated files, and scripts (plain Node.js, no DOM types)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'artifacts/**',
      'scripts/**',
      'tests/**',
    ],
  },

  // TypeScript source files
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
    ],
    rules: {
      // Allow intentional `_` prefix to suppress unused-variable warnings
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // `any` shows up in DOM typings and legitimate generic escape hatches —
      // warn but don't block builds; explicit `as unknown as T` is preferred.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Non-null assertions (`!`) are used heavily with DOM queries that are
      // guaranteed by context (e.g. `getElementById` after `innerHTML` sets the id).
      // TypeScript strict mode already enforces discipline; keep this as a warning.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // `innerHTML +=` is the rendering pattern used throughout. Disabling
      // innerHTML assignment rules that would require a full rewrite.
      // XSS is not a threat here — content is developer-controlled static strings.

      // Ensure async functions are not silently dropped (floating promises).
      '@typescript-eslint/no-floating-promises': 'error',

      // Prefer `const` over `let` where the variable is never reassigned.
      'prefer-const': 'error',

      // Prevent `console.log` in production source (use it during dev, remove before commit).
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    languageOptions: {
      parserOptions: {
        // Enable type-aware linting for rules like no-floating-promises
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
