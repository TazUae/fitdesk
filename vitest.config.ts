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
  // tsconfig sets `jsx: "preserve"` for Next.js's own build; Vite's transform
  // never consumes that, so `.tsx` imports fail without an explicit JSX
  // transform here. Vite 8 / vitest 4 use the oxc transformer (not esbuild), so
  // this must be set under `oxc`. The `automatic` runtime uses react/jsx-runtime
  // (React 18) so component-level tests can import `.tsx` files. Node env by
  // default; a test that renders can opt into jsdom with
  // `// @vitest-environment jsdom`.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', '.next-verify', 'dist'],
  },
})
