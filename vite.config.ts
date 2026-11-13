import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { musicFolder } from './vite.music';

const root = fileURLToPath(new URL('.', import.meta.url));

// Hosting build (plan section 6): plain static files that work from a domain
// root, a subfolder or a WebView. No server features are assumed.
export default defineConfig({
  base: './',
  plugins: [musicFolder(root, 'dist')],
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
