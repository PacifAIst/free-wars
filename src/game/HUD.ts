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
  LOADING: { title: '', subtitle: 'Loading...', tone: 'gold' },
};

/** How long the level name stays on screen at the start of a level. */
const LEVEL_NAME_SECONDS = 3;
/** Floating numbers that can be on screen at once. */
const POPUPS = 10;
/** HP bars that can be on screen at once: big rats and tank bubbles. */
const HP_BARS = 12;

/** The timed weapons, in the order they are shown: name and colour. */
const WEAPONS: readonly [string, string][] = [
  ['MINIGUN', '#f2701d'],
  ['ROCKET', '#3b6cf0'],
  ['LASER', '#e5383b'],
  ['TANK', '#4f9a3a'],
];

interface WeaponChip {
  /** The most seconds this weapon has had since it was last picked up from nothing: a full bar. */
  peak: number;
  root: HTMLDivElement;
  fill: HTMLDivElement;
  label: HTMLDivElement;
}

interface HpBar {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  label: HTMLDivElement;
  shown: boolean;
  text: string;
  ratio: number;
}

function element(className: string, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  parent.appendChild(el);
  return el;
}

/**
 * Screen overlay, built from plain HTML on top of the canvas: status while
 * playing, HP bars, weapon timers and floating numbers. The menus and the
 * panels with buttons are in Screens.ts. Styles live in index.html. The
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
  private readonly weapons: WeaponChip[] = [];
  private readonly hpBars: HpBar[] = [];

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

    const weapons = element('hud-weapons', this.root);
    for (const [, color] of WEAPONS) {
      const root = element('hud-weapon', weapons);
      const fill = element('hud-weapon-fill', root);
      fill.style.background = color;
      this.weapons.push({ peak: 0, root, fill, label: element('hud-weapon-label', root) });
    }

    for (let i = 0; i < HP_BARS; i++) {
      const root = element('hud-hp', this.root);
      const fill = element('hud-hp-fill', root);
      this.hpBars.push({ root, fill, label: element('hud-hp-label', root), shown: false, text: '', ratio: -1 });
    }

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

  /**
   * Places HP bar `index` with its middle at (x, y), in screen pixels. `ratio` is the
   * HP left, 0 to 1; `text` is the number shown on it, or empty for a thin bar.
   * Returns false when every bar is in use.
   */
  hpBar(index: number, x: number, y: number, width: number, ratio: number, text: string): boolean {
    const bar = this.hpBars[index];
    if (!bar) return false;
    if (!bar.shown) {
      bar.shown = true;
      bar.root.style.display = 'block';
    }
    const thin = text === '';
    const height = thin ? 7 : 16;
    bar.root.style.width = `${Math.round(width)}px`;
    bar.root.style.height = `${height}px`;
    bar.root.style.transform = `translate(${Math.round(x - width / 2)}px, ${Math.round(y - height / 2)}px)`;
    const shown = Math.round(ratio * 100);
    if (shown !== bar.ratio) {
      bar.ratio = shown;
      bar.fill.style.width = `${shown}%`;
      // Green when healthy, through amber, to red when nearly dead.
      bar.fill.style.background = shown > 55 ? '#5fd66a' : shown > 25 ? '#f2b21d' : '#ef4444';
    }
    if (text !== bar.text) {
      bar.text = text;
      bar.label.textContent = text;
    }
    return true;
  }

  /** Hides the HP bars from `count` on: the ones not placed this frame. */
  endHpBars(count: number): void {
    for (let i = count; i < this.hpBars.length; i++) {
      const bar = this.hpBars[i];
      if (!bar.shown) continue;
      bar.shown = false;
      bar.root.style.display = 'none';
    }
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
      this.text(this.title, banner.title);
      this.text(this.subtitle, banner.subtitle);
      this.style(this.title, 'color', banner.tone === 'red' ? '#ff6b6b' : '#ffd166');
    }

    const inLevel = state === 'PLAYING' || state === 'PAUSED' || state === 'WIN' || state === 'LOSE';
    this.style(this.status, 'display', inLevel ? 'flex' : 'none');
    // Weapon timers: a chip for each weapon that is running, emptying as its time runs out.
    const seconds_ = [sim.minigun, sim.rocketMode, sim.laser, sim.tank];
    for (let i = 0; i < WEAPONS.length; i++) {
      const chip = this.weapons[i];
      const left = inLevel ? seconds_[i] : 0;
      if (left <= 0) {
        chip.peak = 0;
        if (this.shown.get(chip.root) !== 'off') {
          this.shown.set(chip.root, 'off');
          chip.root.style.display = 'none';
        }
        continue;
      }
      if (this.shown.get(chip.root) !== 'on') {
        this.shown.set(chip.root, 'on');
        chip.root.style.display = 'block';
      }
      // A pickup fills the bar; it then runs down. Another pickup tops it up again.
      if (left > chip.peak) chip.peak = left;
      const width = `${Math.round((left / chip.peak) * 100)}%`;
      if (this.shown.get(chip.fill) !== width) {
        this.shown.set(chip.fill, width);
        chip.fill.style.width = width;
      }
      this.text(chip.label, `${WEAPONS[i][0]} ${Math.ceil(left)}`);
    }

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
