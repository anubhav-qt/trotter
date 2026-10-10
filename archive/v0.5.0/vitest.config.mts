import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every test gets a fresh in-memory database; nothing touches ./data.
    env: { TROTTER_DB_PATH: ':memory:' },
  },
})
