import { defineConfig } from 'vite';
import crypto, { createHash } from 'crypto';

// Fix Vite 7 crypto.hash issue by providing proper polyfill if needed
if (!crypto.hash) {
  crypto.hash = (algorithm: string, data: string | Buffer) => {
    return createHash(algorithm).update(data).digest('hex');
  };
}

export default defineConfig({
  root: 'public',
  base: '/hnefatafl/',
  server: {
    open: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  test: {
    root: '.', // Use project root for tests
    include: ['**/*.test.ts'],
  }
});
