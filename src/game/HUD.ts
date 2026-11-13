import type { GameState } from '../types';
import { BASE_HP, BUILT_IN_LEVELS, SIM_HZ } from './constants';
import type { RenderFrame } from './Game';

interface Banner {
  title: string;
  subtitle: string;
  tone: 'gold' | 'red';
}

const BANNERS: Partial<Record<GameState, Banner>> = {
  BOOT: { title: 'FREE-WARS', subtitle: 'Loading...', tone: 'gold' },
  MENU: { title: 'FREE-WARS', subtitle: 'Tap to play', tone: 'gold' },
  LOADING: { title: '', subtitle: 'Loading...', tone: 'gold' },
  PAUSED: { title: 'PAUSED', subtitle: 'Tap to resume', tone: 'gold' },
  WIN: { title: 'VICTORY!', subtitle: 'Tap to continue', tone: 'gold' },
  LOSE: { title: 'DEFEAT', subtitle: 'Tap to retry', tone: 'red' },
};

const LOSS_TEXT: Record<string, string> = {
  base: 'A rat crossed the goal line',
  boss: 'A boss crossed the goal line',
  swarm: 'Your swarm was wiped out',
};

/** How long the level name stays on screen at the start of a level. */
const LEVEL_NAME_SECONDS = 3;
/** Floating numbers that can be on screen at once. */
const POPUPS = 10;

function element(className: string, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  parent.appendChild(el);
  return el;
}

/**
 * Screen overlay, built from plain HTML on top of the canvas: status while
 * playing and banners for the other states. Styles live in index.html. The
 * overlay ignores pointer events, so drags always reach the game.
 *
 * Text is only written when it changes, so a steady frame touches no DOM.
 */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly cats: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly baseFill: HTMLDivElement;
  private readonly baseLabel: HTMLDivElement;
  private readonly waveFill: HTMLDivElement;
  private readonly waveLabel: HTMLDivElement;
  private readonly levelName: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly shown = new Map<HTMLElement, string>();
  private readonly popups: HTMLDivElement[] = [];
  private nextPopup = 0;

  constructor(host: HTMLElement) {
    this.root = element('hud', host);

    this.status = element('hud-status', this.root);
    this.cats = element('hud-pill hud-cats', this.status);
    this.base = element('hud-bar', this.status);
    this.baseFill = element('hud-fill hud-fill-base', this.base);
    this.baseLabel = element('hud-bar-label', this.base);
    const wave = element('hud-bar', this.status);
    this.waveFill = element('hud-fill hud-fill-wave', wave);
    this.waveLabel = element('hud-bar-label', wave);

    this.levelName = element('hud-level', this.root);
    for (let i = 0; i < POPUPS; i++) this.popups.push(element('hud-pop', this.root));

    this.banner = element('hud-banner', this.root);
    this.title = element('hud-title', this.banner);
    this.subtitle = element('hud-subtitle', this.banner);

    // The goal has no lives when BASE_HP is 1, so there is nothing to show.
    this.base.style.display = BASE_HP > 1 ? '' : 'none';
  }

  resize(width: number, height: number): void {
    // Shrink the banner type on small screens.
    const scale = Math.min(1, width / 520, height / 520);
    this.root.style.setProperty('--hud-scale', scale.toFixed(3));
  }

  /** Shows a number that floats up from (x, y), in screen pixels, and fades: "+10" when the swarm grows. */
  popup(text: string, x: number, y: number, color: string): void {
    const el = this.popups[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % POPUPS;
    el.textContent = text;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.color = color;
    // Restart the animation even if this element is still mid-flight.
    el.classList.remove('hud-pop-run');
    void el.offsetWidth;
    el.classList.add('hud-pop-run');
  }

  private text(el: HTMLElement, value: string): void {
    if (this.shown.get(el) === value) return;
    this.shown.set(el, value);
    el.textContent = value;
  }

  private style(el: HTMLElement, key: string, value: string): void {
    const cacheKey = el.className + key;
    const holder = this.styleCache;
    if (holder.get(cacheKey) === value) return;
    holder.set(cacheKey, value);
    el.style.setProperty(key, value);
  }
  private readonly styleCache = new Map<string, string>();

  update(frame: RenderFrame): void {
    const { state, sim } = frame;
    const banner = BANNERS[state];

    this.style(this.banner, 'display', banner ? 'flex' : 'none');
    if (banner) {
      let subtitle = banner.subtitle;
      if (state === 'MENU' && frame.notice !== '') subtitle = `${frame.notice}\n${subtitle}`;
      if (state === 'LOSE') subtitle = `${LOSS_TEXT[sim.lossReason] ?? ''}\n${subtitle}`;
      this.text(this.title, banner.title);
      this.text(this.subtitle, subtitle);
      this.style(this.title, 'color', banner.tone === 'red' ? '#ff6b6b' : '#ffd166');
    }

    const inLevel = state === 'PLAYING' || state === 'PAUSED' || state === 'WIN' || state === 'LOSE';
    this.style(this.status, 'display', inLevel ? 'flex' : 'none');
    if (!inLevel) {
      this.style(this.levelName, 'opacity', '0');
      return;
    }

    // The shooter counts as one cat.
    this.text(this.cats, `CATS ${sim.clones + 1}`);
    if (BASE_HP > 1) {
      this.style(this.baseFill, 'width', `${Math.round((sim.baseHp / BASE_HP) * 100)}%`);
      this.text(this.baseLabel, `BASE ${Math.ceil(sim.baseHp)}`);
    }
    // The label names the map out of the 44 built-in ones; the bar fills as its rows arrive (D5).
    const progress = sim.totalRows > 0 ? sim.nextRow / sim.totalRows : 0;
    this.style(this.waveFill, 'width', `${Math.round(progress * 100)}%`);
    const id = frame.map.id;
    this.text(this.waveLabel, /^[1-9]\d*$/.test(id) ? `MAP ${id}/${BUILT_IN_LEVELS}` : id === '0' ? 'DEV MAP' : frame.map.name);

    const seconds = sim.tick / SIM_HZ;
    const showName = state === 'PLAYING' && seconds < LEVEL_NAME_SECONDS && frame.map.name !== '';
    this.text(this.levelName, frame.map.name);
    this.style(this.levelName, 'opacity', showName ? '1' : '0');
  }
}
