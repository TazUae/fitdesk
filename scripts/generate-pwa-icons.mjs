#!/usr/bin/env node
/**
 * Generate FitDesk PWA icons from the approved master artwork.
 *
 * Source: design-assets/fitdesk/fitdesk-icon-master.png
 *   — 1254×1254 square PNG, full-bleed FitDesk blue background.
 *   — Approved final brand asset. Do not replace without explicit approval.
 *
 * No npm dependencies required.
 * Uses PowerShell System.Drawing (built into Windows/.NET) for high-quality
 * bicubic downscaling.
 *
 * Usage: node scripts/generate-pwa-icons.mjs
 */

import { execSync } from 'child_process'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const repoRoot   = resolve(__dirname, '..')
const masterPath = resolve(repoRoot, 'design-assets', 'fitdesk', 'fitdesk-icon-master.png')
const publicDir  = resolve(repoRoot, 'public')

// ── Guard: approved master must be present ──────────────────────────────────
if (!existsSync(masterPath)) {
  console.error('ERROR: Approved master icon not found at:')
  console.error(' ', masterPath)
  console.error('\nDo not generate icons from a placeholder.')
  console.error('Obtain the approved master artwork before regenerating.')
  process.exit(1)
}

// ── Verify PNG signature and dimensions ─────────────────────────────────────
const buf = readFileSync(masterPath)
const isPng = buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71
const srcW  = buf.readUInt32BE(16)
const srcH  = buf.readUInt32BE(20)

if (!isPng || srcW !== srcH || srcW < 512) {
  console.error('ERROR: Master icon failed validation.')
  console.error(`  PNG: ${isPng}, Dimensions: ${srcW}×${srcH}`)
  console.error('  Required: valid PNG, square, minimum 512×512.')
  process.exit(1)
}

console.log(`Source: fitdesk-icon-master.png (${srcW}×${srcH})\n`)

// ── Icon outputs ─────────────────────────────────────────────────────────────
const icons = [
  { name: 'icon-512.png',          size: 512, note: 'Standard PWA icon' },
  { name: 'icon-192.png',          size: 192, note: 'Android/PWA small icon' },
  { name: 'apple-touch-icon.png',  size: 180, note: 'Apple home-screen icon' },
  { name: 'icon-512-maskable.png', size: 512, note: 'Android maskable icon' },
]

// ── PowerShell System.Drawing resize (no npm dependency) ────────────────────
const psLines = [
  `Add-Type -AssemblyName System.Drawing`,
  `$src = [System.Drawing.Image]::FromFile('${masterPath.replace(/\\/g, '\\\\')}')`,
  ...icons.map(({ name, size }) => {
    const out = resolve(publicDir, name).replace(/\\/g, '\\\\')
    return [
      `$dst = New-Object System.Drawing.Bitmap(${size},${size})`,
      `$g = [System.Drawing.Graphics]::FromImage($dst)`,
      `$g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic`,
      `$g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality`,
      `$g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality`,
      `$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality`,
      `$g.DrawImage($src, 0, 0, ${size}, ${size})`,
      `$dst.Save('${out}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      `$g.Dispose(); $dst.Dispose()`,
      `Write-Host '  ✓ ${name} (${size}x${size})'`,
    ].join('; ')
  }),
  `$src.Dispose()`,
]

try {
  execSync(
    `powershell -NonInteractive -Command "${psLines.join('; ')}"`,
    { stdio: 'inherit', cwd: repoRoot }
  )
} catch (err) {
  console.error('\nIcon generation failed:', err.message)
  process.exit(1)
}

// ── Verify outputs ───────────────────────────────────────────────────────────
console.log('\nVerifying outputs:')
let allPass = true
for (const { name, size } of icons) {
  const outPath = resolve(publicDir, name)
  if (!existsSync(outPath)) {
    console.error(`  FAIL ${name} — file not created`)
    allPass = false
    continue
  }
  const b = readFileSync(outPath)
  const w = b.readUInt32BE(16)
  const h = b.readUInt32BE(20)
  const ok = w === size && h === size
  if (!ok) allPass = false
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name} — ${w}×${h} (${b.length}B)`)
}

if (!allPass) {
  console.error('\nOne or more icons failed verification.')
  process.exit(1)
}

console.log('\n✓ All PWA icons generated and verified.')
console.log('Generated from: design-assets/fitdesk/fitdesk-icon-master.png')
