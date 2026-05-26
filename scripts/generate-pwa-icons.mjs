#!/usr/bin/env node
/**
 * Generate PWA icons from SVG source.
 *
 * Requires: ImageMagick (convert command) or similar
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */

import { execSync } from 'child_process'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const publicDir = resolve(__dirname, '..', 'public')
const svgSource = resolve(publicDir, 'icon.svg')

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 512, name: 'icon-512-maskable.png' },
  { size: 180, name: 'apple-touch-icon.png' },
]

console.log('Generating PWA icons from SVG...\n')

try {
  for (const { size, name } of sizes) {
    const outputPath = resolve(publicDir, name)
    console.log(`Generating ${name} (${size}x${size})...`)

    // Use ImageMagick convert to render SVG to PNG
    // Windows-compatible syntax
    execSync(
      `convert "${svgSource}" -resize ${size}x${size} "${outputPath}"`,
      { stdio: 'inherit' }
    )

    console.log(`  ✓ Created ${name}\n`)
  }

  console.log('✓ Icon generation complete!')
  console.log('\nGenerated icons:')
  sizes.forEach(({ name }) => console.log(`  - ${name}`))
} catch (error) {
  console.error('Error generating icons:', error.message)
  console.error('\nTroubleshooting:')
  console.error('- Ensure ImageMagick is installed: https://imagemagick.org/')
  console.error('- On Windows, use the installer from: https://imagemagick.org/script/download.php#windows')
  console.error('- Or install via Chocolatey: choco install imagemagick')
  process.exit(1)
}
