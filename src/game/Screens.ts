// The screens round the game (decision A34): the splash menu, the grid of 44
// maps, and the pause, defeat, victory and final panels. Plain HTML over the
// canvas, like the HUD; styles live in index.html. Unlike the HUD these take
// pointer events, so while one is up a tap cannot reach the lane.

import type { Sfx } from './Audio';
import { BUILT_IN_LEVELS } from './constants';
import type { Game } from './Game';
import type { Music } from './Music';
import type { Save } from './Save';

const REPOSITORY = 'https://github.com/PacifAIst/free-wars';
/** Maps per row of the grid. The last map of each row is a boss map. */
const GRID_COLUMNS = 11;
/** A panel ignores presses for this long after it appears, so a finger still dragging does not hit a button. */
const ARM_MS = 350;

/** What the RULES pop-up says, one line each. */
const RULES: readonly string[] = [
  'Drag left or right to move your cats. They shoot on their own.',
  'You start with one cat. Step onto a rail and let a panel reach you: more cats, or a weapon.',
  'Do not touch a bomb: it kills 18 of your cats.',
  'A rat that touches a cat kills it. Big rats punch, and some fire rockets: shoot the rockets down.',
  'Fat rats drop a box when they die. Catch it. A tank comes in a bubble: shoot it open.',
  'The first rat to cross the gold line loses the map. So does losing every cat.',
  'Kill every rat to win the map and open the next one. Maps 11, 22, 33 and 44 have a boss.',
  'Keys: arrows or A and D move, P or Escape pauses, M mutes.',
];

/** What the ABOUT pop-up says. The last line is followed by a link to the repository. */
const ABOUT: readonly string[] = [
  `FREE WARS ${__APP_VERSION__}`,
  'A free and open-source game. Licence: AGPL-3.0.',
  'Make your own maps in the map editor, or take the code and make your own game.',
  'Music from Pixabay and Unminus. Drawn with three.js; every model and sound effect is made in code.',
  'By PacifAIst.',
];

const LOSS_TEXT: Record<string, string> = {
  base: 'A rat crossed the goal line',
  boss: 'A boss crossed the goal line',
  swarm: 'Your swarm was wiped out',
};

type PanelName = 'splash' | 'levels' | 'pause' | 'lose' | 'win' | 'final' | 'none';

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
  text = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== '') el.textContent = text;
  parent.appendChild(el);
  return el;
}

export class Screens {
  private readonly panels: Record<Exclude<PanelName, 'none'>, HTMLDivElement>;
  private readonly levelButtons: HTMLButtonElement[] = [];
  private readonly musicSliders: HTMLInputElement[] = [];
  private readonly sfxSliders: HTMLInputElement[] = [];
  private readonly notice: HTMLDivElement;
  private readonly lossReason: HTMLDivElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly popup: HTMLDivElement;
  private readonly popupTitle: HTMLDivElement;
  private readonly popupBody: HTMLDivElement;
  private shown: PanelName = 'none';
  private shownAt = 0;
  private clearArmedAt = 0;
  private gridUnlocked = -1;

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly save: Save,
    private readonly sfx: Sfx,
    private readonly music: Music,
    /** Opens the map editor. */
    private readonly onEditor: () => void,
  ) {
    const root = make('div', 'ui', host);
    const panel = (name: string): HTMLDivElement => make('div', `ui-panel ui-${name}`, root);

    // --- Splash ---
    const splash = panel('splash');
    make('div', 'ui-logo', splash, 'FREE WARS');
    const tag = make('div', 'ui-tag', splash, 'Create your own game - ');
    const link = make('a', 'ui-link', tag, 'Available on GitHub');
    link.href = REPOSITORY;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    this.button(splash, 'PLAY', 'ui-button ui-primary', () => this.game.play());
    this.sliders(splash);
    const row = make('div', 'ui-row', splash);
    this.button(row, 'MAP EDITOR', 'ui-button ui-small', () => this.onEditor());
    this.clearButton = this.button(row, 'CLEAR PROGRESS', 'ui-button ui-small ui-danger', () => this.clearProgress());
    const more = make('div', 'ui-row', splash);
    this.button(more, 'RULES', 'ui-button ui-small', () => this.showPopup('RULES', RULES, false));
    this.button(more, 'ABOUT', 'ui-button ui-small', () => this.showPopup('ABOUT', ABOUT, true));
    this.notice = make('div', 'ui-notice', splash);

    // --- Map grid ---
    const levels = panel('levels');
    make('div', 'ui-title', levels, 'SELECT MAP');
    const grid = make('div', 'ui-grid', levels);
    grid.style.gridTemplateColumns = `repeat(${GRID_COLUMNS}, 1fr)`;
    for (let n = 1; n <= BUILT_IN_LEVELS; n++) {
      const id = String(n);
      this.levelButtons.push(this.button(grid, id, 'ui-level', () => this.game.chooseLevel(id)));
    }
    this.button(levels, 'MAIN MENU', 'ui-button ui-small', () => this.game.toMenu());

    // --- Pause ---
    const pause = panel('pause');
    make('div', 'ui-title', pause, 'PAUSED');
    this.sliders(pause);
    this.button(pause, 'RESUME', 'ui-button ui-primary', () => this.game.resume());
    this.button(pause, 'MAIN MENU', 'ui-button ui-small', () => this.game.toMenu());

    // --- Defeat ---
    const lose = panel('lose');
    make('div', 'ui-title ui-red', lose, 'DEFEAT');
    this.lossReason = make('div', 'ui-text', lose);
    this.button(lose, 'RETRY', 'ui-button ui-primary', () => this.game.retry());
    this.button(lose, 'MAIN MENU', 'ui-button ui-small', () => this.game.toMenu());

    // --- Victory ---
    const win = panel('win');
    make('div', 'ui-title', win, 'VICTORY!');
    this.button(win, 'CONTINUE', 'ui-button ui-primary', () => this.game.continueAfterWin());
    this.button(win, 'MAIN MENU', 'ui-button ui-small', () => this.game.toMenu());

    // --- The last map is won ---
    const final = panel('final');
    make('div', 'ui-logo', final, 'YOU WON!');
    make('div', 'ui-text ui-big', final, 'Thanks for playing!!!');
    this.button(final, 'MAIN MENU', 'ui-button ui-primary', () => this.game.toMenu());

    // --- Pop-up for the rules and the about text: a card over the splash screen ---
    this.popup = make('div', 'ui-popup', root);
    const card = make('div', 'ui-card', this.popup);
    this.popupTitle = make('div', 'ui-title ui-card-title', card);
    this.popupBody = make('div', 'ui-card-body', card);
    const close = make('button', 'ui-button ui-small', card, 'CLOSE');
    close.type = 'button';
    close.addEventListener('click', () => this.hidePopup());
    // A press beside the card, or Escape, closes it too.
    this.popup.addEventListener('click', (e) => {
      if (e.target === this.popup) this.hidePopup();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.hidePopup();
    });

    this.panels = { splash, levels, pause, lose, win, final };
    this.applyVolumes();
  }

  private button(parent: HTMLElement, text: string, className: string, action: () => void): HTMLButtonElement {
    const el = make('button', className, parent, text);
    el.type = 'button';
    el.addEventListener('click', () => {
      if (performance.now() - this.shownAt < ARM_MS) return;
      action();
    });
    return el;
  }

  /** The two volume sliders. They appear on the splash and on the pause panel and stay in step. */
  private sliders(parent: HTMLElement): void {
    const box = make('div', 'ui-sliders', parent);
    const slider = (label: string, list: HTMLInputElement[], change: (volume: number) => void): void => {
      const line = make('label', 'ui-slider', box);
      make('span', 'ui-slider-name', line, label);
      const input = make('input', 'ui-range', line);
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.addEventListener('input', () => {
        change(Number(input.value) / 100);
        this.applyVolumes();
      });
      list.push(input);
    };
    slider('MUSIC', this.musicSliders, (v) => this.save.setMusic(v));
    slider('SOUND', this.sfxSliders, (v) => {
      this.save.setSfx(v);
      // Let the player hear the level being set.
      this.sfx.tap();
    });
  }

  private applyVolumes(): void {
    this.music.setVolume(this.save.music);
    this.sfx.setVolume(this.save.sfx);
    for (const input of this.musicSliders) input.value = String(Math.round(this.save.music * 100));
    for (const input of this.sfxSliders) input.value = String(Math.round(this.save.sfx * 100));
  }

  private showPopup(title: string, lines: readonly string[], withLink: boolean): void {
    this.popupTitle.textContent = title;
    this.popupBody.replaceChildren();
    for (const line of lines) make('p', 'ui-card-line', this.popupBody, line);
    if (withLink) {
      const link = make('a', 'ui-link', make('p', 'ui-card-line', this.popupBody), REPOSITORY.replace('https://', ''));
      link.href = REPOSITORY;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    this.popup.classList.add('ui-show');
    // While it is up, Enter and Space are not for the PLAY button.
    this.game.menuBusy = true;
  }

  private hidePopup(): void {
    if (!this.popup.classList.contains('ui-show')) return;
    this.popup.classList.remove('ui-show');
    this.game.menuBusy = false;
  }

  /** Shows a line of text on the splash screen. */
  say(text: string): void {
    this.notice.textContent = text;
  }

  /** Clearing takes two presses, so one slip of the finger does not wipe the progress. */
  private clearProgress(): void {
    const now = performance.now();
    if (now - this.clearArmedAt > 4000) {
      this.clearArmedAt = now;
      this.clearButton.textContent = 'PRESS AGAIN TO CLEAR';
      return;
    }
    this.clearArmedAt = 0;
    this.save.clearProgress();
    this.clearButton.textContent = 'CLEAR PROGRESS';
    this.say('Progress cleared. Map 1 is open.');
  }

  /** Marks each map open, done, locked or boss. */
  private paintGrid(): void {
    const unlocked = this.save.unlocked();
    if (unlocked === this.gridUnlocked) return;
    this.gridUnlocked = unlocked;
    this.levelButtons.forEach((el, i) => {
      const n = i + 1;
      const locked = n > unlocked;
      const done = n < unlocked || (n === BUILT_IN_LEVELS && this.save.finished);
      const boss = n % GRID_COLUMNS === 0;
      el.className = `ui-level${boss ? ' ui-boss' : ''}${locked ? ' ui-locked' : done ? ' ui-done' : ' ui-open'}`;
      el.disabled = locked;
      el.setAttribute('aria-label', locked ? `Map ${n}, locked` : `Map ${n}`);
    });
  }

  /** Shows the panel that belongs to the game's state. Call once per frame. */
  update(): void {
    const { game } = this;
    let want: PanelName = 'none';
    switch (game.state) {
      case 'MENU':
        want = 'splash';
        break;
      case 'LEVEL_SELECT':
        want = 'levels';
        break;
      case 'PAUSED':
        want = 'pause';
        break;
      case 'LOSE':
        want = 'lose';
        break;
      case 'WIN':
        want = game.levelId === String(BUILT_IN_LEVELS) ? 'final' : 'win';
        break;
      default:
        break;
    }
    if (want === this.shown) return;

    if (this.shown !== 'none') this.panels[this.shown].classList.remove('ui-show');
    this.shown = want;
    this.shownAt = performance.now();
    if (want === 'none') return;
    if (want === 'splash') {
      this.say(game.notice);
      this.clearArmedAt = 0;
      this.clearButton.textContent = 'CLEAR PROGRESS';
    } else if (want === 'levels') {
      this.gridUnlocked = -1;
      this.paintGrid();
    } else if (want === 'lose') {
      this.lossReason.textContent = LOSS_TEXT[game.sim.lossReason] ?? '';
    }
    this.applyVolumes();
    this.panels[want].classList.add('ui-show');
  }
}
