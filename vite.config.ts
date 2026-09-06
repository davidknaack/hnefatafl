import { defineConfig } from 'vitest/config'

export default defineConfig({
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
