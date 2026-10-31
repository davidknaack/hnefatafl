import { readFileSync } from 'node:fs'
import { startRelay } from './relay.js'
import { configFromEnv } from './config.js'

// Entry point is emitted to dist-server/server/main.js; package metadata stays at repo root.
try {
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    const options = configFromEnv(process.env, version)
    const relay = await startRelay(options)
    console.log(`Relay listening on ${options.host}:${relay.port} (/relay, /health)`)
    const stop = () => { void relay.close().catch(() => { process.exitCode = 1 }) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
} catch (error) {
    console.error(error instanceof Error ? error.message : 'Relay startup failed')
    process.exitCode = 1
}
