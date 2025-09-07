import { defineConfig } from 'vite';
import crypto, { createHash } from 'crypto';

// Fix Vite 7 crypto.hash issue by patching the crypto module directly
if (!crypto.hash) {
  crypto.hash = (algorithm: string) => createHash(algorithm);
}

export default defineConfig({
  root: 'public',
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
