import { Sfx } from './game/Audio';
import { Game } from './game/Game';
import { Input } from './game/Input';
import { builtInMaps } from './game/maps';
import { Music } from './game/Music';
import { Save } from './game/Save';
import { Screens } from './game/Screens';
import { Renderer3D } from './render/Renderer3D';

function boot(): void {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const sfx = new Sfx();
  const music = new Music();
  const renderer = new Renderer3D(host, sfx, music);

  // `?map=0` skips the map grid and opens the dev map.
  const levelId = new URLSearchParams(window.location.search).get('map') ?? undefined;

  const input = new Input();
  input.attach(renderer.canvas);
  const save = new Save();
  const game = new Game(renderer, input, builtInMaps, { levelId, progress: save });
  const screens = new Screens(host, game, save, sfx, music);
  game.ready();

  // Browsers only allow sound after a touch or a key press.
  window.addEventListener('pointerdown', () => {
    sfx.unlock();
    music.unlock();
  });
  window.addEventListener('keydown', (e) => {
    sfx.unlock();
    music.unlock();
    if (e.code === 'KeyM' && !e.repeat) {
      sfx.toggleMute();
      music.setMuted(sfx.isMuted);
    }
  });

  const loop = (now: number): void => {
    game.frame(now);
    screens.update();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Pause when hidden; on return, drop the elapsed time so nothing jumps.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.pause();
      sfx.suspend();
      music.setHidden(true);
    } else {
      game.resetClock();
      sfx.unlock();
      music.setHidden(false);
    }
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
