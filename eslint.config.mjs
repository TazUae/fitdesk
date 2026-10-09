import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'

// Next.js 16 removed "next lint"; use ESLint's flat configuration directly.
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**',
    '.next-verify/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])
