import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration suites share one database; run files one at a time.
    fileParallelism: false,
  },
});
