import { defineConfig } from 'vite';
import { createHash } from 'crypto';

// Polyfill for crypto.hash function to fix Vite 7 compatibility issues in CI
if (!globalThis.crypto?.hash) {
  try {
    Object.defineProperty(globalThis.crypto || {}, 'hash', {
      value: (alg) => createHash(alg),
      writable: true,
      configurable: true
    });
  } catch (e) {
    // If crypto is not available or read-only, create a new crypto object
    if (!globalThis.crypto) {
      globalThis.crypto = {
        hash: (alg) => createHash(alg)
      };
    }
  }
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
