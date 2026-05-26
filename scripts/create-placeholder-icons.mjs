#!/usr/bin/env node
/**
 * Create minimal placeholder PNG icons for PWA.
 * These are temporary placeholders until proper design assets are processed.
 *
 * Usage: node scripts/create-placeholder-icons.mjs
 */

import fs from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import zlib from 'zlib'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const publicDir = resolve(__dirname, '..', 'public')

/**
 * Create a minimal valid PNG file.
 * This PNG is 1×1 pixel with a single blue color.
 * It's the minimal valid PNG structure for testing/placeholder purposes.
 */
function createPlaceholderPNG(width, height) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk (image header)
  // width: 4 bytes (big-endian)
  // height: 4 bytes (big-endian)
  // bit depth, color type, compression, filter, interlace
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type (RGB)
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Calculate CRC for IHDR
  function crc32(buf) {
    let crc = 0xffffffff
    for (let i = 0; i < buf.length; i++) {
      crc = crc ^ buf[i]
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
      }
    }
    return (crc ^ 0xffffffff) >>> 0
  }

  const ihdrType = Buffer.from('IHDR')
  const ihdrData = Buffer.concat([ihdrType, ihdr])
  const ihdrCrc = Buffer.alloc(4)
  ihdrCrc.writeUInt32BE(crc32(ihdrData), 0)

  // Create IHDR chunk: length (4) + type (4) + data (13) + crc (4)
  const ihdrLength = Buffer.alloc(4)
  ihdrLength.writeUInt32BE(13, 0)
  const ihdrChunk = Buffer.concat([ihdrLength, ihdrData, ihdrCrc])

  // IDAT chunk (image data) - minimal data for a solid blue image
  // For simplicity, create minimal valid compressed data
  // This is a very small compressed stream for a small image
  const imageData = Buffer.alloc(width * height * 3 + height)
  let pos = 0

  // Fill with simple blue color (#1A73E8) and filter bytes
  const blue = Buffer.from([26, 115, 232]) // #1A73E8 in RGB
  for (let y = 0; y < height; y++) {
    imageData[pos++] = 0 // filter type: None
    for (let x = 0; x < width; x++) {
      imageData[pos++] = blue[0]
      imageData[pos++] = blue[1]
      imageData[pos++] = blue[2]
    }
  }

  // Compress the image data (using zlib format)
  const compressed = zlib.deflateSync(imageData)

  const idatType = Buffer.from('IDAT')
  const idatData = Buffer.concat([idatType, compressed])
  const idatCrc = Buffer.alloc(4)
  idatCrc.writeUInt32BE(crc32(idatData), 0)

  const idatLength = Buffer.alloc(4)
  idatLength.writeUInt32BE(compressed.length, 0)
  const idatChunk = Buffer.concat([idatLength, idatData, idatCrc])

  // IEND chunk (end of file)
  const iendType = Buffer.from('IEND')
  const iendData = Buffer.concat([iendType, Buffer.alloc(0)])
  const iendCrc = Buffer.alloc(4)
  iendCrc.writeUInt32BE(crc32(iendData), 0)

  const iendLength = Buffer.alloc(4)
  iendLength.writeUInt32BE(0, 0)
  const iendChunk = Buffer.concat([iendLength, iendData, iendCrc])

  // Combine all chunks
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 512, name: 'icon-512-maskable.png' },
  { size: 180, name: 'apple-touch-icon.png' },
]

console.log('Creating placeholder PNG icons...\n')

try {
  for (const { size, name } of sizes) {
    const outputPath = resolve(publicDir, name)
    const pngBuffer = createPlaceholderPNG(size, size)
    fs.writeFileSync(outputPath, pngBuffer)
    console.log(`✓ Created ${name} (${size}×${size})`)
  }

  console.log('\n✓ Placeholder icons created successfully!')
  console.log('\nNote: These are temporary placeholder icons with a solid blue background.')
  console.log('Replace them with your actual design icons when ready.')
  console.log('\nSee docs/PWA_ICONS.md for instructions on processing your mockup designs.')
} catch (error) {
  console.error('Error creating icons:', error.message)
  process.exit(1)
}
