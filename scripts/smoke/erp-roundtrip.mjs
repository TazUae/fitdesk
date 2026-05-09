#!/usr/bin/env node
/**
 * ERP roundtrip smoke.
 *
 * Signs a 5-min HMAC JWT inside a node process and times the typical
 * dashboard fetch sequence (Customer + Sales Invoice + FD Session) via
 * the Control Plane proxy. Reports per-call ms.
 *
 * Run from inside the fitdesk container so it has FITDESK_JWT_SECRET +
 * CONTROL_PLANE_URL in env:
 *
 *   docker exec axis-local-fitdesk-1 node /app/scripts/smoke/erp-roundtrip.mjs
 *
 * Or locally with env exported manually.
 */

import crypto from 'node:crypto'
import http from 'node:http'
import { performance } from 'node:perf_hooks'

const TENANT_ID  = process.env.SMOKE_TENANT_ID ?? '8168e424-ea93-4cf7-9903-a1b5241354d5'
const CP_URL     = process.env.CONTROL_PLANE_URL
const SECRET     = process.env.FITDESK_JWT_SECRET

if (!CP_URL || !SECRET) {
  console.error('Missing CONTROL_PLANE_URL or FITDESK_JWT_SECRET in env')
  process.exit(2)
}

const cleanCP = CP_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')
const [host, port] = cleanCP.split(':')

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}
function signJWT() {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { tenantId: TENANT_ID, iat: now, exp: now + 300 }
  const a = b64url(JSON.stringify(header))
  const b = b64url(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', SECRET).update(`${a}.${b}`).digest()
  return `${a}.${b}.${b64url(sig)}`
}

function call(label, path) {
  const token = signJWT()
  return new Promise(resolve => {
    const t0 = performance.now()
    const req = http.request({
      host, port: Number(port), path, method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    }, res => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        const ms = performance.now() - t0
        let summary = ''
        try {
          const parsed = JSON.parse(body)
          summary = Array.isArray(parsed.data) ? `array len=${parsed.data.length}` : (parsed.data?.name ?? 'object')
        } catch { summary = body.slice(0, 80) }
        console.log(`  ${String(res.statusCode).padEnd(4)} ${label.padEnd(28)} ${ms.toFixed(1).padStart(7)} ms  ${summary}`)
        resolve({ ok: res.statusCode === 200, ms })
      })
    })
    req.on('error', e => {
      console.log(`  ERR  ${label.padEnd(28)} ${e.code ?? e.message}`)
      resolve({ ok: false, ms: 0 })
    })
    req.on('timeout', () => {
      req.destroy()
      console.log(`  T/O  ${label.padEnd(28)}`)
      resolve({ ok: false, ms: 0 })
    })
    req.end()
  })
}

(async () => {
  console.log(`Tenant: ${TENANT_ID}`)
  console.log(`CP:     ${host}:${port}`)
  console.log('---')

  const results = []
  results.push(await call('Customer list',          '/api/erp/doctype/Customer?fields=%5B%22name%22%5D&limit_page_length=20'))
  results.push(await call('Sales Invoice list',     '/api/erp/doctype/Sales%20Invoice?fields=%5B%22name%22%5D&limit_page_length=20'))
  results.push(await call('FD Session list',        '/api/erp/doctype/FD%20Session?fields=%5B%22name%22%5D&limit_page_length=20'))
  results.push(await call('Trainer Settings',       '/api/erp/doctype/FitDesk%20Trainer%20Settings/FitDesk%20Trainer%20Settings'))
  results.push(await call('Session Type list',      '/api/erp/doctype/FitDesk%20Session%20Type?fields=%5B%22name%22%5D&limit_page_length=20'))

  const ok = results.filter(r => r.ok)
  const total = results.reduce((s, r) => s + r.ms, 0)
  console.log('---')
  console.log(`Successful: ${ok.length} / ${results.length}`)
  console.log(`Total time: ${total.toFixed(1)} ms`)
  process.exit(ok.length === results.length ? 0 : 1)
})()
