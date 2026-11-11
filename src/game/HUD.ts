import { Container, Graphics, Sprite, Text, type TextStyleOptions, type Texture } from 'pixi.js';
import type { GameState } from '../types';
import type { RenderFrame } from './Game';

const FONT = '"Arial Rounded MT Bold", "Baloo 2", "Fredoka", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const INK = 0x1b1736;

const TITLE_STYLE: TextStyleOptions = {
  fontFamily: FONT,
  fontSize: 76,
  fontWeight: '900',
  fill: 0xffd166,
  stroke: { color: INK, width: 14, join: 'round' },
  dropShadow: { color: 0x0b0a1f, alpha: 0.55, blur: 0, distance: 7, angle: Math.PI / 2 },
  align: 'center',
  letterSpacing: 2,
};

const SUBTITLE_STYLE: TextStyleOptions = {
  fontFamily: FONT,
  fontSize: 30,
  fontWeight: '900',
  fill: 0xffffff,
  stroke: { color: INK, width: 8, join: 'round' },
  align: 'center',
};

interface Banner {
  title: string;
  subtitle: string;
  dim: number;
  mascot: boolean;
}

const BANNERS: Partial<Record<GameState, Banner>> = {
  BOOT: { title: 'FREE-WARS', subtitle: 'Loading...', dim: 0.55, mascot: true },
  MENU: { title: 'FREE-WARS', subtitle: 'Tap to play', dim: 0.55, mascot: true },
  LOADING: { title: '', subtitle: 'Loading...', dim: 0.3, mascot: false },
  PAUSED: { title: 'PAUSED', subtitle: 'Tap to resume', dim: 0.5, mascot: false },
};

/** Screen-space overlay: banners for the non-playing states. */
export class HUD {
  readonly root = new Container();
  private readonly dim = new Graphics();
  private readonly title = new Text({ text: '', style: TITLE_STYLE });
  private readonly subtitle = new Text({ text: '', style: SUBTITLE_STYLE });
  private readonly mascot: Sprite;
  private shown: GameState | null = null;
  private width = 0;
  private height = 0;

  constructor(mascotTexture: Texture) {
    this.mascot = new Sprite(mascotTexture);
    this.mascot.anchor.set(0.5, 1);
    this.title.anchor.set(0.5);
    this.subtitle.anchor.set(0.5);
    this.root.addChild(this.dim, this.mascot, this.title, this.subtitle);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.shown = null;
  }

  update(frame: RenderFrame): void {
    const banner = BANNERS[frame.state];
    if (frame.state !== this.shown) {
      this.shown = frame.state;
      this.layout(banner);
    }
    if (banner) {
      // Gentle pulse on the call to action.
      this.subtitle.alpha = 0.72 + 0.28 * Math.sin(frame.timeMs / 260);
    }
  }

  private layout(banner: Banner | undefined): void {
    this.root.visible = banner !== undefined;
    if (!banner) return;
    const { width: w, height: h } = this;
    const scale = Math.min(1, w / 560, h / 520);

    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0b0a1f, alpha: banner.dim });

    this.title.text = banner.title;
    this.title.visible = banner.title !== '';
    this.title.scale.set(scale);
    this.title.position.set(w / 2, h * 0.42);

    this.subtitle.text = banner.subtitle;
    this.subtitle.scale.set(scale);
    this.subtitle.position.set(w / 2, h * 0.42 + 86 * scale);

    this.mascot.visible = banner.mascot;
    this.mascot.scale.set(scale * 2.6);
    this.mascot.position.set(w / 2, h * 0.42 - 44 * scale);
  }
}
