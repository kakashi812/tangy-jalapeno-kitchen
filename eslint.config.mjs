import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

// Next.js rules (React, hooks, accessibility, Next-specific) apply only to the web app.
const nextForWeb = nextCoreWebVitals.map((config) => ({
  ...config,
  files: ['apps/web/**/*.{ts,tsx}'],
  settings: { ...config.settings, next: { rootDir: 'apps/web' } },
}));

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/generated/**',
      '**/next-env.d.ts',
      'book/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextForWeb,
  prettier,
);
