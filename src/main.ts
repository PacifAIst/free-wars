import { Game } from './game/Game';
import { Input } from './game/Input';
import { builtInMaps } from './game/maps';
import { Renderer3D } from './render/Renderer3D';

function boot(): void {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const renderer = new Renderer3D(host);

  // Until the level select screen exists (M8), `?map=0` opens the dev map.
  const levelId = new URLSearchParams(window.location.search).get('map') ?? undefined;

  const input = new Input();
  input.attach(renderer.canvas);
  const game = new Game(renderer, input, builtInMaps, { levelId });
  game.ready();

  const loop = (now: number): void => {
    game.frame(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Pause when hidden; on return, drop the elapsed time so nothing jumps.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
    else game.resetClock();
  });

  if (import.meta.env.DEV) {
    // For debugging in the browser console.
    (window as unknown as { __freeWars: Game }).__freeWars = game;
  }
}

try {
  boot();
} catch (error) {
  console.error(error);
  const message = document.createElement('p');
  message.textContent = 'FREE-WARS could not start. Please reload the page.';
  message.style.cssText = 'color:#fff;font:16px system-ui,sans-serif;text-align:center;margin-top:40vh';
  document.body.appendChild(message);
}
