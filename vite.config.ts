import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Hosting build (plan section 6): plain static files that work from a domain
// root, a subfolder or a WebView. No server features are assumed.
export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@assets': fileURLToPath(new URL('./src/assets/hosted.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
