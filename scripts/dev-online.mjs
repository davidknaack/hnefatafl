import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const node = process.execPath
const commands = {
    build: [
        'node_modules/typescript/bin/tsc',
        '--project',
        'tsconfig.server.json',
    ],
    watchServer: [
        'node_modules/typescript/bin/tsc',
        '--project',
        'tsconfig.server.json',
        '--watch',
        '--preserveWatchOutput',
    ],
    relay: ['--watch', 'dist-server/server/main.js'],
    client: ['node_modules/vite/bin/vite.js', '--open', '/debug.html'],
}

function start(args) {
    return spawn(node, args, { cwd: projectRoot, stdio: 'inherit' })
}

const initialBuild = start(commands.build)
const buildExit = await new Promise((resolve, reject) => {
    initialBuild.once('error', reject)
    initialBuild.once('exit', (code, signal) => resolve({ code, signal }))
})

if (buildExit.code !== 0) {
    console.error(
        `Server build failed${buildExit.signal ? ` (${buildExit.signal})` : ''}.`
    )
    process.exitCode = buildExit.code ?? 1
} else {
    const children = [
        start(commands.watchServer),
        start(commands.relay),
        start(commands.client),
    ]
    let stopping = false

    function stop(exitCode = 0) {
        if (stopping) return
        stopping = true
        for (const child of children) child.kill()
        process.exitCode = exitCode
    }

    for (const child of children) {
        child.once('error', (error) => {
            console.error(error)
            stop(1)
        })
        child.once('exit', (code, signal) => {
            if (!stopping && code !== 0) {
                console.error(
                    `Development process stopped${signal ? ` (${signal})` : ` with code ${code}`}.`
                )
                stop(code ?? 1)
            }
        })
    }

    process.once('SIGINT', () => stop())
    process.once('SIGTERM', () => stop())

    await Promise.all(
        children.map(
            (child) => new Promise((resolve) => child.once('exit', resolve))
        )
    )
}
