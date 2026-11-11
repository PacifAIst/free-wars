import { Application } from 'pixi.js';
import { MAX_RENDER_RESOLUTION } from './game/constants';
import { Game } from './game/Game';
import { Input } from './game/Input';
import { builtInMaps, type MapSource } from './game/maps';
import { Renderer } from './render/Renderer';
import { loadBossTextures, loadCoreTextures } from './render/textures';

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    // D15: capped so low-end phones do not render at 3x.
    resolution: Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION),
    background: 0x0f1330,
  });
  app.canvas.style.touchAction = 'none';
  host.appendChild(app.canvas);

  const textures = await loadCoreTextures();
  const renderer = new Renderer(app, textures);

  // The boss atlas is large and not needed for the menu: it loads in the
  // background, and a level only waits for it when it starts.
  const bossesReady = loadBossTextures().then((bosses) => renderer.setBossTextures(bosses));
  bossesReady.catch(() => undefined);
  const maps: MapSource = {
    has: (id) => builtInMaps.has(id),
    load: async (id) => {
      const [map] = await Promise.all([builtInMaps.load(id), bossesReady]);
      return map;
    },
  };

  // Until the level select screen exists (M8), `?map=0` opens the dev map.
  const levelId = new URLSearchParams(window.location.search).get('map') ?? undefined;

  const input = new Input();
  input.attach(app.canvas);
  const game = new Game(renderer, input, maps, { levelId });
  game.ready();

  app.ticker.add(() => game.frame(performance.now()));

  // Pause when hidden; on return, drop the elapsed time so nothing jumps.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
    else game.resetClock();
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __freeWars: Game }).__freeWars = game;
  }
}

boot().catch((error: unknown) => {
  console.error(error);
  const message = document.createElement('p');
  message.textContent = 'FREE-WARS could not start. Please reload the page.';
  message.style.cssText = 'color:#fff;font:16px system-ui,sans-serif;text-align:center;margin-top:40vh';
  document.body.appendChild(message);
});
