import { spawn } from 'node:child_process'

function runNodeScript(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${label} failed (code=${code ?? 'null'}, signal=${signal ?? 'null'})`))
    })
  })
}

async function main() {
  console.log('[startup] running auth schema migration')
  await runNodeScript(['scripts/migrate.mjs'], 'auth migration')

  console.log('[startup] running app schema migration')
  await runNodeScript(['scripts/migrate-app.mjs'], 'app migration')

  const entrypoint = process.env.FITDESK_SERVER_ENTRYPOINT ?? 'server.js'
  console.log(`[startup] starting app via ${entrypoint}`)
  await runNodeScript([entrypoint], 'server')
}

main().catch((error) => {
  console.error('[startup] fatal error', error)
  process.exit(1)
})
