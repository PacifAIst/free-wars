import { Application, Graphics, Text } from 'pixi.js';
import { MAX_RENDER_RESOLUTION } from './game/constants';

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (!host) throw new Error('Missing #game element');

  const app = new Application();
  await app.init({
    preference: 'webgl',
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION),
    background: 0x12142b,
  });
  host.appendChild(app.canvas);

  const frame = new Graphics();
  const title = new Text({
    text: 'FREE-WARS',
    style: { fill: 0xffd166, fontFamily: 'system-ui, sans-serif', fontSize: 48, fontWeight: '900' },
  });
  title.anchor.set(0.5);
  app.stage.addChild(frame, title);

  const layout = (): void => {
    const { width, height } = app.screen;
    frame.clear().rect(8, 8, width - 16, height - 16).stroke({ color: 0x4cc9f0, width: 4 });
    title.position.set(width / 2, height / 2);
    title.scale.set(Math.min(1, width / 420));
  };
  app.renderer.on('resize', layout);
  layout();
}

void boot();
