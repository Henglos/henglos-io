import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // The driver's logs would bury the test output.
    env: { HIO_LOG_LEVEL: 'silent' },
  },
})
