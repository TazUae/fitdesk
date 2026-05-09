#!/usr/bin/env node
/**
 * Health endpoint latency smoke.
 *
 * Hits /api/health N times and reports min / p50 / p95 / max.
 * Independent of auth — safe to run anywhere FitDesk is up.
 *
 * Usage:
 *   node scripts/smoke/health-latency.mjs
 *   FITDESK_URL=http://localhost:3000 ITERATIONS=20 node scripts/smoke/health-latency.mjs
 */

import { performance } from 'node:perf_hooks'

const URL_BASE   = process.env.FITDESK_URL ?? 'http://localhost:3000'
const ITERATIONS = Number(process.env.ITERATIONS ?? '20')
const TIMEOUT_MS = 5000

async function timed(url) {
  const t0 = performance.now()
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const ms = performance.now() - t0
  return { ok: res.ok, status: res.status, ms }
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN
  const idx = Math.ceil(sorted.length * q) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

(async () => {
  const url = `${URL_BASE}/api/health`
  console.log(`Probing ${url} × ${ITERATIONS}…`)

  // Warmup
  await timed(url).catch(() => {})

  const samples = []
  let failures = 0
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      const { ok, status, ms } = await timed(url)
      if (!ok) {
        failures++
        console.log(`  [${i + 1}] FAIL ${status} (${ms.toFixed(1)} ms)`)
      } else {
        samples.push(ms)
      }
    } catch (err) {
      failures++
      console.log(`  [${i + 1}] ERR ${err.code ?? err.message}`)
    }
  }

  samples.sort((a, b) => a - b)
  console.log('')
  console.log(`Successful: ${samples.length} / ${ITERATIONS}  (${failures} failures)`)
  if (samples.length > 0) {
    console.log(`min  ${samples[0].toFixed(1)} ms`)
    console.log(`p50  ${quantile(samples, 0.50).toFixed(1)} ms`)
    console.log(`p95  ${quantile(samples, 0.95).toFixed(1)} ms`)
    console.log(`max  ${samples[samples.length - 1].toFixed(1)} ms`)
  }
  process.exit(failures > 0 ? 1 : 0)
})()
