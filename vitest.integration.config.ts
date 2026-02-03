import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup/node-crypto.ts'],
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30000,
  },
});
