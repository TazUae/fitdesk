/**
 * Vitest stub for the `server-only` marker package.
 *
 * Next.js provides `server-only` at build time to guarantee a module never ends
 * up in a client bundle. It is not an installed npm package, so the vitest node
 * environment cannot resolve it. This empty stub is aliased in vitest.config.ts
 * so server-only modules can be unit-tested. It has no runtime effect.
 */
export {}
