import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    root: resolve(__dirname),
    include: ['server/**/*.test.ts', 'mcp/**/*.test.ts'],
    environment: 'node',
  },
});
