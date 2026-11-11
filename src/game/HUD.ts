import { Container, Graphics, Sprite, Text, type TextStyleOptions, type Texture } from 'pixi.js';
import type { GameState } from '../types';
import { BASE_HP, SIM_HZ } from './constants';
import type { RenderFrame } from './Game';

const FONT = '"Arial Rounded MT Bold", "Baloo 2", "Fredoka", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const INK = 0x1b1736;
const GOLD = 0xffd166;
const RED = 0xff6b6b;

const TITLE_STYLE: TextStyleOptions = {
  fontFamily: FONT,
  fontSize: 76,
  fontWeight: '900',
  fill: GOLD,
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

const LABEL_STYLE: TextStyleOptions = {
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: '900',
  fill: 0xffffff,
  stroke: { color: INK, width: 4, join: 'round' },
};

interface Banner {
  title: string;
  subtitle: string;
  dim: number;
  mascot: boolean;
  color: number;
}

const BANNERS: Partial<Record<GameState, Banner>> = {
  BOOT: { title: 'FREE-WARS', subtitle: 'Loading...', dim: 0.55, mascot: true, color: GOLD },
  MENU: { title: 'FREE-WARS', subtitle: 'Tap to play', dim: 0.55, mascot: true, color: GOLD },
  LOADING: { title: '', subtitle: 'Loading...', dim: 0.3, mascot: false, color: GOLD },
  PAUSED: { title: 'PAUSED', subtitle: 'Tap to resume', dim: 0.5, mascot: false, color: GOLD },
  WIN: { title: 'VICTORY!', subtitle: 'Tap to continue', dim: 0.45, mascot: true, color: GOLD },
  LOSE: { title: 'DEFEAT', subtitle: 'Tap to retry', dim: 0.55, mascot: false, color: RED },
};

const BAR_WIDTH = 190;
const BAR_HEIGHT = 24;
const BAR_GAP = 14;
const BAR_MARGIN = 12;
/** How long the level name stays on screen at the start of a level. */
const LEVEL_NAME_SECONDS = 3;

/** One labelled progress bar. Redraws only when its value changes. */
class Bar {
  readonly root = new Container();
  private readonly fill = new Graphics();
  private readonly label = new Text({ text: '', style: LABEL_STYLE });
  private shownValue = -1;
  private shownText = '';

  constructor() {
    const back = new Graphics()
      .roundRect(0, 0, BAR_WIDTH, BAR_HEIGHT, BAR_HEIGHT / 2)
      .fill({ color: INK, alpha: 0.8 })
      .stroke({ color: INK, width: 3 });
    this.label.anchor.set(0.5);
    this.label.position.set(BAR_WIDTH / 2, BAR_HEIGHT / 2);
    this.root.addChild(back, this.fill, this.label);
  }

  set(fraction: number, color: number, text: string): void {
    const value = Math.round(Math.max(0, Math.min(1, fraction)) * (BAR_WIDTH - 6));
    if (value !== this.shownValue) {
      this.shownValue = value;
      this.fill.clear();
      if (value > 0) {
        const width = Math.max(value, BAR_HEIGHT - 6);
        this.fill.roundRect(3, 3, width, BAR_HEIGHT - 6, (BAR_HEIGHT - 6) / 2).fill({ color });
        this.fill.roundRect(8, 5, Math.max(0, width - 10), 4, 2).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
    if (text !== this.shownText) {
      this.shownText = text;
      this.label.text = text;
    }
  }
}

/** Screen-space overlay: status bars while playing, banners for the other states. */
export class HUD {
  readonly root = new Container();
  private readonly dim = new Graphics();
  private readonly title = new Text({ text: '', style: TITLE_STYLE });
  private readonly subtitle = new Text({ text: '', style: SUBTITLE_STYLE });
  private readonly mascot: Sprite;
  private readonly bars = new Container();
  private readonly baseBar = new Bar();
  private readonly waveBar = new Bar();
  private readonly levelName = new Text({ text: '', style: SUBTITLE_STYLE });
  private shown: GameState | null = null;
  private shownSubtitle = '';
  private width = 0;
  private height = 0;

  constructor(mascotTexture: Texture) {
    this.mascot = new Sprite(mascotTexture);
    this.mascot.anchor.set(0.5, 1);
    this.title.anchor.set(0.5);
    this.subtitle.anchor.set(0.5, 0);
    this.levelName.anchor.set(0.5);
    this.waveBar.root.x = BAR_WIDTH + BAR_GAP;
    this.bars.addChild(this.baseBar.root, this.waveBar.root);
    this.root.addChild(this.bars, this.levelName, this.dim, this.mascot, this.title, this.subtitle);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.shown = null;

    const total = BAR_WIDTH * 2 + BAR_GAP;
    const scale = Math.min(1, (width - 2 * BAR_MARGIN) / total);
    this.bars.scale.set(scale);
    this.bars.position.set((width - total * scale) / 2, BAR_MARGIN);
    this.levelName.scale.set(Math.min(1, width / 560));
    this.levelName.position.set(width / 2, height * 0.3);
  }

  update(frame: RenderFrame): void {
    const { state, sim } = frame;
    const banner = BANNERS[state];
    const subtitle = this.subtitleFor(frame, banner);
    if (state !== this.shown || subtitle !== this.shownSubtitle) {
      this.shown = state;
      this.shownSubtitle = subtitle;
      this.layoutBanner(banner, subtitle);
    }
    if (banner) {
      // Gentle pulse on the call to action.
      this.subtitle.alpha = 0.72 + 0.28 * Math.sin(frame.timeMs / 260);
    }

    const inLevel = state === 'PLAYING' || state === 'PAUSED' || state === 'WIN' || state === 'LOSE';
    this.bars.visible = inLevel;
    this.levelName.visible = false;
    if (!inLevel) return;

    // B1: base integrity. D5: progress is rows spawned out of total rows.
    const base = sim.baseHp / BASE_HP;
    this.baseBar.set(base, base > 0.5 ? 0x7ae582 : base > 0.25 ? GOLD : RED, `BASE ${Math.ceil(sim.baseHp)}`);
    this.waveBar.set(
      sim.totalRows > 0 ? sim.nextRow / sim.totalRows : 0,
      0x4cc9f0,
      `WAVE ${sim.nextRow}/${sim.totalRows}`,
    );

    const seconds = sim.tick / SIM_HZ;
    if (state === 'PLAYING' && seconds < LEVEL_NAME_SECONDS && frame.map.name !== '') {
      this.levelName.visible = true;
      this.levelName.text = frame.map.name;
      this.levelName.alpha = Math.min(1, (LEVEL_NAME_SECONDS - seconds) / 0.8);
    }
  }

  private subtitleFor(frame: RenderFrame, banner: Banner | undefined): string {
    if (!banner) return '';
    if (frame.state === 'MENU' && frame.notice !== '') return `${frame.notice}\n${banner.subtitle}`;
    if (frame.state === 'LOSE') {
      const reason = frame.sim.lossReason === 'boss' ? 'A boss broke through' : 'The base has fallen';
      return `${reason}\n${banner.subtitle}`;
    }
    return banner.subtitle;
  }

  private layoutBanner(banner: Banner | undefined, subtitle: string): void {
    const visible = banner !== undefined;
    this.dim.visible = visible;
    this.title.visible = visible && banner.title !== '';
    this.subtitle.visible = visible;
    this.mascot.visible = visible && banner.mascot;
    if (!banner) return;

    const { width: w, height: h } = this;
    const scale = Math.min(1, w / 560, h / 520);
    const centre = h * 0.42;

    this.dim.clear().rect(0, 0, w, h).fill({ color: 0x0b0a1f, alpha: banner.dim });

    this.title.text = banner.title;
    this.title.style.fill = banner.color;
    this.title.scale.set(scale);
    this.title.position.set(w / 2, centre);

    this.subtitle.text = subtitle;
    this.subtitle.scale.set(scale);
    this.subtitle.position.set(w / 2, centre + 62 * scale);

    this.mascot.scale.set(scale * 2.6);
    this.mascot.position.set(w / 2, centre - 44 * scale);
  }
}
