import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// Minimal server-action test harness. Node environment; server modules + the `@/`
// path alias resolve via vite-tsconfig-paths. External boundaries (next/headers,
// Better Auth, trainer resolution, ERP client) are mocked per-test.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Next.js provides `server-only` at build time; it is not an installed
      // package, so the vitest node env cannot resolve it. Alias to an empty stub
      // so server-only modules (e.g. lib/clients/directory.ts) can be unit-tested.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', '.next-verify', 'dist'],
  },
})
