import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Single-file build (plan section 6): everything is inlined into one HTML file
// so the game opens by double-click from file://. Only bgm.mp3 sits beside it.
function singleFileExtras(): Plugin {
  return {
    name: 'free-wars-single-file-extras',
    transformIndexHtml(html) {
      // The public folder is not copied, so drop links that would 404.
      return html.replace(/\s*<link rel="(icon|manifest)"[^>]*>/g, '');
    },
    closeBundle() {
      const bgm = here('./public/assets/audio/bgm.mp3');
      if (existsSync(bgm)) copyFileSync(bgm, here('./dist-single/bgm.mp3'));
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), singleFileExtras()],
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
});
