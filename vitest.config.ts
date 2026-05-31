import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Minimal server-action test harness. Node environment; server modules + the `@/`
// path alias resolve via vite-tsconfig-paths. External boundaries (next/headers,
// Better Auth, trainer resolution, ERP client) are mocked per-test.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next', '.next-verify', 'dist'],
  },
})
