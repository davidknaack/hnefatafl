import { defineConfig } from 'vite';

export default defineConfig({
  root: 'public',
  server: {
    open: true
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  }
});
