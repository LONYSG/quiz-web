import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'client/src/**/*.test.ts', 'server/src/**/*.test.ts', 'pipeline/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    reporters: ['default'],
  },
});
