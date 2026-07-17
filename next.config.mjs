/** @type {import('next').NextConfig} */
const nextConfig = {
  // FITDESK_VERIFY_BUILD=1 → isolated output so `npm run build:verify` never
  // touches the running dev server's .next/ assets. Unset in Docker/Dokploy.
  distDir: process.env.FITDESK_VERIFY_BUILD === '1' ? '.next-verify' : '.next',
  output: 'standalone',

  async headers() {
    return [
      {
        // HTML pages — never cache so browsers always get the latest chunk manifest
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ]
  },
}

export default nextConfig
