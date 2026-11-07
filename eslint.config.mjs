// Shared lint rules for the packages that opt in with a `lint` script (server, worker, db, shared,
// root scripts). apps/web and the SDK hooks are owned by the frontend agent and lint on their own terms.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'apps/web/**', 'packages/sdk/**', 'uploads/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,mts,cts,js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Handlers receive Fastify requests already validated against openapi.yaml; `any` there is deliberate.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-console': 'off',
    },
  },
  {
    // Fastify handlers and outbox consumers are async by contract even when a body needs no await.
    files: ['apps/server/src/handlers/**', 'apps/server/src/worker/handlers.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
)
