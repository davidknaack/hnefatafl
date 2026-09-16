import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { version } = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8')
)

export default defineConfig({
    // The web root is public/, but developer environment files live beside
    // package.json. Without this, Vite looks for public/.env.local instead.
    envDir: fileURLToPath(new URL('.', import.meta.url)),
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
