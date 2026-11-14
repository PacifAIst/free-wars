import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { musicFolder } from './vite.music';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// Single-file build (plan section 6): everything is inlined into one HTML file
// so the game opens by double-click from file://. Only the `music` folder sits
// beside it; without that folder the game plays with sound effects only.
function singleFileExtras(): Plugin {
  return {
    name: 'free-wars-single-file-extras',
    transformIndexHtml(html) {
      // The public folder is not copied, so drop links that would 404.
      return html.replace(/\s*<link rel="(icon|manifest)"[^>]*>/g, '');
    },
  };
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  publicDir: false,
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), singleFileExtras(), musicFolder(here('.'), 'dist-single')],
  build: {
    outDir: 'dist-single',
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
  },
});
