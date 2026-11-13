import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

const TRACK = /^\d+\.mp3$/;

/**
 * The owner keeps the music in `music/` at the project root (`0.mp3` to
 * `11.mp3`). This plugin makes it reachable as `music/<n>.mp3` beside the game:
 * the dev server serves the folder, and a build copies it next to the output.
 * A project without the folder builds and runs without music.
 */
export function musicFolder(root: string, outDir: string): Plugin {
  const source = join(root, 'music');
  return {
    name: 'free-wars-music',
    configureServer(server) {
      server.middlewares.use('/music', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = join(source, name);
        if (!TRACK.test(name) || !existsSync(file)) {
          next();
          return;
        }
        const size = statSync(file).size;
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        // Browsers ask for audio in ranges, and need them to loop and seek.
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (range && (range[1] !== '' || range[2] !== '')) {
          const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
          const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(size - 1, Number(range[2]));
          if (start > end || start >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.setHeader('Content-Length', size);
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!existsSync(source)) return;
      const target = join(root, outDir, 'music');
      mkdirSync(target, { recursive: true });
      for (const name of readdirSync(source)) {
        if (!TRACK.test(name)) continue;
        const to = join(target, name);
        // Tracks are large: copy only what is new or has changed.
        const from = statSync(join(source, name));
        if (existsSync(to) && statSync(to).size === from.size && statSync(to).mtimeMs >= from.mtimeMs) continue;
        copyFileSync(join(source, name), to);
      }
    },
  };
}
