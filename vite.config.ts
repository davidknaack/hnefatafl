import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

export default defineConfig({
    define: {
        __HNEFATAFL_CLIENT_VERSION__: JSON.stringify(version),
    },
    root: 'public',
    base: '/hnefatafl/',
    server: {
        open: true,
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
    test: {
        root: '.', // Use project root for tests
        include: ['**/*.test.ts'],
    },
})
