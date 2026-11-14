// The map editor (decision A35). A grid of the lane and its two rails, a
// palette of the eight enemies and the items, and a rubber. Drag something
// from the palette onto the grid, or pick it and press on the grid; dragging
// on paints minions and rail items and rubs things out. Whatever is placed
// replaces what it covers. The grid has no end: scroll down for more rows.
//
// A map is saved as a .fw text file and loaded from one, from a link to one,
// or from one of the 44 built-in maps. Files are read in the browser and go
// nowhere. Styles live in index.html.

import { BUILT_IN_LEVELS, COLS, WALL_DEFAULT_HP, WALL_MAX_HP } from '../game/constants';
import {
  emptyFwMap,
  enemySize,
  eraseEnemyAt,
  eraseItemAt,
  formatFw,
  type FwMap,
  fwRows,
  fwToMapData,
  mapDataToFw,
  parseFw,
  placeEnemy,
  placeItem,
  RAIL_ITEM_ROWS,
} from '../game/fw';
import type { Game } from '../game/Game';
import type { MapSource } from '../game/maps';
import { brickCanvas, ITEMS, itemCanvas } from '../render/icons';

type Tool = { kind: 'erase' } | { kind: 'enemy'; type: number } | { kind: 'item'; drop: number } | { kind: 'wall' };

/** A place on the grid: a row, and either a rail (`side` 0 or 1) or a lane column (`side` -1). */
interface Spot {
  /** True when the pointer is on the strip at the top of the grid where a rail's wall is shown. */
  top: boolean;
  side: number;
  col: number;
  row: number;
}

const DRAFT_KEY = 'free-wars:editor';
/** Width of the row-number gutter and of the strip left free for scrolling by touch, in pixels. */
const GUTTER = 30;
const STRIP = 30;
/** A rail is drawn this many cells wide: half its real width, to leave room for the lane. */
const RAIL_CELLS = 8;
const ACROSS = RAIL_CELLS * 2 + COLS;
/** Empty rows kept below the last thing on the map, so there is always room to scroll on. */
const SPARE_ROWS = 160;
const WRONG_FILE = 'Wrong file';

/** Colours of the enemy types 0 (random minion) to 8, as in the game. */
const ENEMY_COLORS: readonly string[] = ['#8d93b8', '#a2978d', '#d0894d', '#9a5fd6', '#b5875f', '#e08a4f', '#e2505f', '#7fa06f', '#c9d3e3'];
const ENEMY_NAMES: readonly string[] = ['Random minion', 'Minion', 'Sergeant', 'Elite', 'Fat rat', 'Boss', 'Charger', 'Boss sniper', 'Robo rat'];
const INK = '#1b1736';

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== '') el.textContent = text;
  parent.appendChild(el);
  return el;
}

/** A square picture of an enemy type for the palette: its colour, two ears and its name. */
function enemyPicture(type: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.lineWidth = size * 0.07;
  g.strokeStyle = INK;
  g.fillStyle = '#f28ba8';
  for (const x of [0.24, 0.76]) {
    g.beginPath();
    g.arc(size * x, size * 0.24, size * 0.17, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.fillStyle = ENEMY_COLORS[type];
  g.beginPath();
  g.roundRect(size * 0.12, size * 0.22, size * 0.76, size * 0.7, size * 0.2);
  g.fill();
  g.stroke();
  g.font = `900 ${Math.round(size * 0.36)}px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.1;
  g.lineJoin = 'round';
  const text = type === 0 ? 'E?' : `E${type}`;
  g.strokeText(text, size / 2, size * 0.6);
  g.fillStyle = '#ffffff';
  g.fillText(text, size / 2, size * 0.6);
  return canvas;
}

/** The rubber. */
function rubberPicture(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.translate(size / 2, size / 2);
  g.rotate(-0.6);
  g.lineWidth = size * 0.07;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.fillStyle = '#ff9eb5';
  g.beginPath();
  g.roundRect(-size * 0.36, -size * 0.2, size * 0.72, size * 0.4, size * 0.08);
  g.fill();
  g.stroke();
  g.fillStyle = '#5aa9ff';
  g.beginPath();
  g.roundRect(-size * 0.36, -size * 0.2, size * 0.3, size * 0.4, size * 0.08);
  g.fill();
  g.stroke();
  return canvas;
}

export class Editor {
  /** True while a map from the editor is being played: the editor comes back when the level ends. */
  testing = false;

  private readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly message: HTMLDivElement;
  private readonly scroller: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly spacer: HTMLDivElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly toolButtons: HTMLButtonElement[] = [];
  private readonly darkBox: HTMLInputElement;
  private readonly wallHpInput: HTMLInputElement;
  private readonly brickPicture = brickCanvas(160, 60, 3);
  private readonly itemPictures: HTMLCanvasElement[] = ITEMS.map((_, drop) => itemCanvas(drop, 128, 64));

  private map: FwMap = emptyFwMap();
  private tool: Tool = { kind: 'enemy', type: 1 };
  private cell = 8;
  private painting = false;
  /** True when the press began on a palette button: the thing is dropped where the pointer is let go. */
  private fromPalette = false;
  /** Where the pointer is over the grid, for the outline of what would be placed; null when it is elsewhere. */
  private hover: Spot | null = null;
  /** The last placement of this drag, so one cell is not written sixty times a second. */
  private lastPlaced = '';
  private drawQueued = false;
  private isOpen = false;

  constructor(
    host: HTMLElement,
    private readonly game: Game,
    private readonly maps: MapSource,
  ) {
    this.root = make('div', 'ed', host);
    // Keys typed in the editor are not for the game: no pause, no mute, no PLAY.
    this.root.addEventListener('keydown', (e) => e.stopPropagation());

    // --- Top bar ---
    const bar = make('div', 'ed-bar', this.root);
    this.button(bar, 'BACK', () => this.close());
    this.nameInput = make('input', 'ed-name', bar);
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 60;
    this.nameInput.placeholder = 'Map name';
    this.nameInput.addEventListener('input', () => {
      this.map.name = this.nameInput.value;
      this.saveDraft();
    });

    const template = make('select', 'ed-select', bar);
    make('option', '', template, 'Template...').value = '';
    for (let n = 1; n <= BUILT_IN_LEVELS; n++) make('option', '', template, `Map ${n}`).value = String(n);
    template.addEventListener('change', () => {
      const id = template.value;
      template.value = '';
      if (id !== '') this.loadTemplate(id);
    });

    const file = make('input', 'ed-file', bar);
    file.type = 'file';
    file.accept = '.fw,.txt,text/plain';
    file.addEventListener('change', () => {
      const chosen = file.files?.[0];
      file.value = '';
      // The file is read here, in the browser. Nothing is sent anywhere.
      if (chosen) chosen.text().then((text) => this.loadText(text), () => this.say(WRONG_FILE));
    });
    this.button(bar, 'UPLOAD .FW', () => file.click());
    this.button(bar, 'LINK', () => this.loadLink());
    this.button(bar, 'NEW', () => this.load(emptyFwMap(), 'New map.'));

    // A night map: on by default for the boss maps.
    const darkLabel = make('label', 'ed-check', bar);
    this.darkBox = make('input', '', darkLabel);
    this.darkBox.type = 'checkbox';
    darkLabel.append(' DARK MAP');
    this.darkBox.addEventListener('change', () => {
      this.map.dark = this.darkBox.checked;
      this.saveDraft();
    });
    // HP of the brick walls: of the next one placed, and of those already there.
    const hpLabel = make('label', 'ed-check', bar, 'WALL HP ');
    this.wallHpInput = make('input', 'ed-number', hpLabel);
    this.wallHpInput.type = 'number';
    this.wallHpInput.min = '1';
    this.wallHpInput.max = String(WALL_MAX_HP);
    this.wallHpInput.value = String(WALL_DEFAULT_HP);
    this.wallHpInput.addEventListener('change', () => {
      const hp = this.wallHp();
      this.wallHpInput.value = String(hp);
      this.map.walls = [this.map.walls[0] > 0 ? hp : 0, this.map.walls[1] > 0 ? hp : 0];
      this.saveDraft();
      this.queueDraw();
    });
    this.button(bar, 'SAVE .FW', () => this.download()).classList.add('ed-strong');
    this.button(bar, 'TEST', () => this.test()).classList.add('ed-strong');

    this.message = make('div', 'ed-message', this.root);

    // --- Palette: the rubber, the enemies, the items ---
    const palette = make('div', 'ed-palette', this.root);
    this.toolButton(palette, { kind: 'erase' }, rubberPicture(40), 'Rubber: drag to erase');
    for (let type = 1; type <= 8; type++) {
      const { w, h } = enemySize(type);
      this.toolButton(palette, { kind: 'enemy', type }, enemyPicture(type, 40), `${ENEMY_NAMES[type]} (E${type}), ${w} by ${h} cells`);
    }
    this.toolButton(palette, { kind: 'enemy', type: 0 }, enemyPicture(0, 40), 'Random minion (ER)');
    this.toolButton(palette, { kind: 'wall' }, brickCanvas(80, 40), 'Brick wall: drop it on a rail. It stands at the start of the map and holds the items of that rail until it is shot down').classList.add('ed-wide');
    ITEMS.forEach((item, drop) => {
      this.toolButton(palette, { kind: 'item', drop }, itemCanvas(drop, 80, 40), `${item.text === '?' ? 'Surprise' : item.text}: a rail item`).classList.add('ed-wide');
    });

    // --- Grid ---
    this.scroller = make('div', 'ed-scroll', this.root);
    this.canvas = make('canvas', 'ed-canvas', this.scroller);
    this.spacer = make('div', 'ed-spacer', this.scroller);
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.scroller.addEventListener('scroll', () => this.queueDraw());
    window.addEventListener('resize', () => this.layout());

    // A press on the grid places the chosen thing. Dragging on paints minions and rail
    // items and rubs things out; a big rat is placed once per press, so a drag does not
    // plough through the map.
    this.canvas.addEventListener('pointerdown', (e) => {
      this.painting = true;
      this.fromPalette = false;
      this.canvas.setPointerCapture(e.pointerId);
      const spot = this.locate(e);
      if (spot) this.apply(spot);
    });
    window.addEventListener('pointermove', (e) => {
      const spot = this.locate(e);
      if (spot?.side !== this.hover?.side || spot?.col !== this.hover?.col || spot?.row !== this.hover?.row) {
        this.hover = spot;
        this.queueDraw();
      }
      if (!this.painting || !spot) return;
      const erase = this.tool.kind === 'erase';
      const small = this.tool.kind !== 'enemy' || enemySize(this.tool.type).w <= 2;
      if (erase || (small && !this.fromPalette)) this.apply(spot);
    });
    const stop = (e: PointerEvent): void => {
      // Something dragged out of the palette is dropped where the pointer is let go.
      if (this.painting && this.fromPalette) {
        const spot = this.locate(e);
        if (spot) this.apply(spot);
      }
      this.endPaint();
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', () => this.endPaint());

    this.loadDraft();
    this.selectTool(this.tool);
  }

  private button(parent: HTMLElement, text: string, action: () => void): HTMLButtonElement {
    const el = make('button', 'ed-button', parent, text);
    el.type = 'button';
    el.addEventListener('click', action);
    return el;
  }

  private toolButton(parent: HTMLElement, tool: Tool, picture: HTMLCanvasElement, title: string): HTMLButtonElement {
    const el = make('button', 'ed-tool', parent);
    el.type = 'button';
    el.title = title;
    el.setAttribute('aria-label', title);
    el.appendChild(picture);
    el.dataset.tool = JSON.stringify(tool);
    // Pressing a tool picks it, and the same press can be dragged straight onto the grid.
    el.addEventListener('pointerdown', (e) => {
      this.selectTool(tool);
      this.painting = true;
      this.fromPalette = true;
      el.releasePointerCapture?.(e.pointerId);
    });
    this.toolButtons.push(el);
    return el;
  }

  private selectTool(tool: Tool): void {
    this.tool = tool;
    const key = JSON.stringify(tool);
    for (const el of this.toolButtons) el.classList.toggle('ed-on', el.dataset.tool === key);
  }

  private say(text: string): void {
    this.message.textContent = text;
  }

  private summary(): string {
    const walls = this.map.walls.filter((hp) => hp > 0).length;
    return `${fwRows(this.map)} rows, ${this.map.enemies.length} enemies, ${this.map.items.length} rail items${walls > 0 ? `, ${walls} wall${walls > 1 ? 's' : ''}` : ''}.`;
  }

  /** The HP typed for walls, kept within what a map allows. */
  private wallHp(): number {
    const hp = Math.floor(Number(this.wallHpInput.value));
    return Number.isFinite(hp) ? Math.min(WALL_MAX_HP, Math.max(1, hp)) : WALL_DEFAULT_HP;
  }

  /** Height of the strip at the top of the grid where each rail's wall is shown, in pixels. */
  private stripHeight(): number {
    return Math.max(22, this.cell * 3);
  }

  /** Shows the map's night tick and wall HP in the bar. */
  private syncControls(): void {
    this.nameInput.value = this.map.name;
    this.darkBox.checked = this.map.dark;
    const hp = Math.max(this.map.walls[0], this.map.walls[1]);
    if (hp > 0) this.wallHpInput.value = String(hp);
  }

  // --- Opening, closing, loading, saving ---------------------------------------------

  get open(): boolean {
    return this.isOpen;
  }

  show(): void {
    this.isOpen = true;
    this.testing = false;
    this.game.menuBusy = true;
    this.root.classList.add('ed-show');
    this.layout();
    this.say(`Pick an enemy or an item, then drag over the grid. ${this.summary()}`);
  }

  close(): void {
    this.isOpen = false;
    this.game.menuBusy = false;
    this.root.classList.remove('ed-show');
    this.endPaint();
  }

  /** Call once per frame: when a test game is over, the editor comes back. */
  update(): void {
    if (this.testing && this.game.state === 'MENU') this.show();
  }

  private load(map: FwMap, note: string): void {
    this.map = map;
    this.syncControls();
    this.scroller.scrollTop = 0;
    this.saveDraft();
    this.layout();
    this.say(`${note} ${this.summary()}`);
  }

  private loadText(text: string): void {
    const map = parseFw(text);
    if (map) this.load(map, 'Map loaded.');
    else this.say(WRONG_FILE);
  }

  private loadTemplate(id: string): void {
    this.maps.load(id).then(
      (data) => this.load(mapDataToFw(data), `Map ${id} loaded as a template.`),
      () => this.say(`Map ${id} could not be loaded.`),
    );
  }

  private loadLink(): void {
    const url = window.prompt('Link to a .fw file:');
    if (!url) return;
    this.say('Loading...');
    fetch(url.trim()).then(
      (response) => (response.ok ? response.text().then((text) => this.loadText(text)) : this.say(WRONG_FILE)),
      () => this.say('The link could not be opened. The site it is on must allow other pages to read it.'),
    );
  }

  private download(): void {
    if (fwRows(this.map) === 0) {
      this.say('The map is empty.');
      return;
    }
    const name = (this.map.name.trim() || 'map').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-') || 'map';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([formatFw(this.map)], { type: 'text/plain' }));
    link.download = `${name}.fw`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    this.say(`Saved ${name}.fw. ${this.summary()}`);
  }

  private test(): void {
    const data = fwToMapData(this.map);
    if (!data) {
      this.say('Put at least one enemy or item on the map first.');
      return;
    }
    this.close();
    this.testing = true;
    this.game.playCustom(data);
  }

  private saveDraft(): void {
    try {
      localStorage.setItem(DRAFT_KEY, formatFw(this.map));
    } catch {
      // No storage: the map lives until the page is closed.
    }
  }

  private loadDraft(): void {
    try {
      const text = localStorage.getItem(DRAFT_KEY);
      const map = text ? parseFw(text) : null;
      if (map) this.map = map;
    } catch {
      // No storage.
    }
    this.syncControls();
  }

  // --- Painting ----------------------------------------------------------------------

  private endPaint(): void {
    if (!this.painting) return;
    this.painting = false;
    this.fromPalette = false;
    this.lastPlaced = '';
    this.saveDraft();
    this.layout();
    if (this.isOpen) this.say(this.summary());
  }

  /** The place on the grid under the pointer, or null when the pointer is not over the grid. */
  private locate(e: PointerEvent): Spot | null {
    if (!this.isOpen) return null;
    const box = this.canvas.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX >= box.right || e.clientY < box.top || e.clientY >= box.bottom) return null;
    const across = Math.floor((e.clientX - box.left - GUTTER) / this.cell);
    // The strip at the top is kept for the walls; the rows start below it.
    const top = e.clientY - box.top < this.stripHeight();
    const row = top ? 0 : Math.floor((e.clientY - box.top - this.stripHeight() + this.scroller.scrollTop) / this.cell);
    if (across < 0 || across >= ACROSS) return null;
    const side = across < RAIL_CELLS ? 0 : across >= RAIL_CELLS + COLS ? 1 : -1;
    return { top, side, col: across - RAIL_CELLS, row };
  }

  /** Left cell of the chosen enemy when the pointer is over lane column `col`. */
  private leftFor(type: number, col: number): number {
    const { w } = enemySize(type);
    // A minion goes under the pointer; a big rat is centred on it.
    const left = w <= 2 ? col : Math.round(col - w / 2);
    return Math.min(Math.max(0, left - (left % 2)), COLS - w);
  }

  /** Uses the chosen tool on a place of the grid. */
  private apply(spot: Spot): void {
    const { side, col, row } = spot;
    const { tool, map } = this;

    // A wall always stands at the start of its rail, wherever on the rail it is dropped.
    if (tool.kind === 'wall') {
      if (side < 0 || this.lastPlaced === `w${side}`) return;
      this.lastPlaced = `w${side}`;
      map.walls[side] = this.wallHp();
      this.queueDraw();
      return;
    }
    if (tool.kind === 'erase' && side >= 0 && spot.top && map.walls[side] > 0) {
      map.walls[side] = 0;
      this.queueDraw();
      return;
    }
    // Nothing else can stand in the strip kept for the walls.
    if (spot.top) return;

    if (tool.kind === 'erase') {
      const erased = side >= 0 ? eraseItemAt(map, side, row) : eraseEnemyAt(map, col, row);
      if (erased) this.queueDraw();
      return;
    }
    // Units cover two cells each way, so everything snaps to that grid.
    const top = row - (row % 2);
    if (tool.kind === 'item') {
      if (side < 0) return;
      const key = `i${side}:${top}`;
      if (key === this.lastPlaced) return;
      this.lastPlaced = key;
      placeItem(map, { row: top, side, drop: tool.drop });
    } else {
      if (side >= 0) return;
      const left = this.leftFor(tool.type, col);
      const key = `e${left}:${top}`;
      if (key === this.lastPlaced) return;
      this.lastPlaced = key;
      placeEnemy(map, { row: top, col: left, type: tool.type, hp: 0, drop: 0 });
    }
    this.queueDraw();
  }

  // --- Drawing -----------------------------------------------------------------------

  /** Fits the grid to the window and makes the scroll area long enough for the map plus spare rows. */
  private layout(): void {
    if (!this.isOpen) return;
    const width = this.scroller.clientWidth;
    const height = this.scroller.clientHeight;
    this.cell = Math.max(4, Math.floor((width - GUTTER - STRIP) / ACROSS));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = GUTTER + ACROSS * this.cell;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(height * ratio);
    const rows = fwRows(this.map) + SPARE_ROWS;
    // The canvas stays in view; the spacer below it gives the scroll bar its length.
    this.spacer.style.height = `${Math.max(0, rows * this.cell + this.stripHeight() - height)}px`;
    this.queueDraw();
  }

  private queueDraw(): void {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  private draw(): void {
    if (!this.isOpen) return;
    const { g, cell, map } = this;
    const ratio = this.canvas.width / (GUTTER + ACROSS * cell);
    const height = this.canvas.height / ratio;
    const scroll = this.scroller.scrollTop;
    const head = this.stripHeight();
    const first = Math.max(0, Math.floor((scroll - head) / cell));
    const last = first + Math.ceil(height / cell) + 1;
    const y = (row: number): number => head + row * cell - scroll;
    const laneX = GUTTER + RAIL_CELLS * cell;
    const rightX = laneX + COLS * cell;

    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.fillStyle = '#141230';
    g.fillRect(0, 0, GUTTER + ACROSS * cell, height);
    g.fillStyle = '#20264d';
    g.fillRect(GUTTER, 0, RAIL_CELLS * cell, height);
    g.fillRect(rightX, 0, RAIL_CELLS * cell, height);
    g.fillStyle = '#414c80';
    g.fillRect(laneX, 0, COLS * cell, height);

    // A chequer of units (two cells each way) shows where things will snap to.
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let row = first - (first % 2); row <= last; row += 2) {
      for (let c = (row / 2) % 2 === 0 ? 0 : 2; c < COLS; c += 4) g.fillRect(laneX + c * cell, y(row), 2 * cell, 2 * cell);
    }
    // Row numbers every ten rows. Row 0 is the first to reach the swarm.
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let row = first - (first % 10); row <= last; row += 10) {
      if (row < 0) continue;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(GUTTER, y(row), ACROSS * cell, 1);
      g.fillStyle = '#9aa3d6';
      g.fillText(String(row), GUTTER - 4, y(row) + 6);
    }

    for (const item of map.items) {
      if (item.row + RAIL_ITEM_ROWS < first || item.row > last) continue;
      const x = item.side === 0 ? GUTTER : rightX;
      g.drawImage(this.itemPictures[item.drop], x + 1, y(item.row) + 1, RAIL_CELLS * cell - 2, RAIL_ITEM_ROWS * cell - 2);
    }

    g.textAlign = 'center';
    g.lineJoin = 'round';
    for (const e of map.enemies) {
      const { w, h } = enemySize(e.type);
      if (e.row + h < first || e.row > last) continue;
      const x = laneX + e.col * cell;
      const top = y(e.row);
      const width = w * cell;
      const depth = h * cell;
      g.fillStyle = ENEMY_COLORS[e.type];
      g.strokeStyle = INK;
      g.lineWidth = Math.max(1, cell * 0.16);
      g.beginPath();
      g.roundRect(x + 0.5, top + 0.5, width - 1, depth - 1, Math.min(width, depth) * 0.22);
      g.fill();
      g.stroke();
      if (width < 24) continue;
      // Big rats carry their name, and what they were given, so a template can be read.
      const size = Math.min(34, width * 0.22);
      g.font = `900 ${size}px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif`;
      g.lineWidth = size * 0.22;
      const text = `E${e.type}`;
      g.strokeText(text, x + width / 2, top + depth / 2);
      g.fillStyle = '#ffffff';
      g.fillText(text, x + width / 2, top + depth / 2);
      const extra = `${e.hp > 0 ? `${e.hp} HP ` : ''}${e.drop > 0 ? `drops ${ITEMS[e.drop].text}` : ''}`.trim();
      if (extra !== '') {
        g.font = `700 ${Math.max(9, size * 0.42)}px system-ui, sans-serif`;
        g.fillText(extra, x + width / 2, top + depth / 2 + size * 0.8);
      }
    }

    // Outline of what the chosen tool would place, or rub out, under the pointer.
    const { hover, tool } = this;
    if (hover) {
      const top = hover.row - (hover.row % 2);
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.strokeStyle = tool.kind === 'erase' ? '#ff6b6b' : '#ffd166';
      if (hover.top && tool.kind !== 'wall' && tool.kind !== 'erase') {
        // Only walls go in the strip at the top.
      } else if (tool.kind === 'enemy' && hover.side < 0) {
        const { w, h } = enemySize(tool.type);
        g.strokeRect(laneX + this.leftFor(tool.type, hover.col) * cell, y(top), w * cell, h * cell);
      } else if (tool.kind === 'item' && hover.side >= 0) {
        g.strokeRect(hover.side === 0 ? GUTTER : rightX, y(top), RAIL_CELLS * cell, RAIL_ITEM_ROWS * cell);
      } else if (hover.side >= 0 && (tool.kind === 'wall' || (tool.kind === 'erase' && hover.top && map.walls[hover.side] > 0))) {
        g.strokeRect(hover.side === 0 ? GUTTER + 1 : rightX + 1, 1, RAIL_CELLS * cell - 2, this.stripHeight() - 2);
      } else if (tool.kind === 'erase') {
        const x = hover.side === 0 ? GUTTER : hover.side === 1 ? rightX : laneX + (hover.col - (hover.col % 2)) * cell;
        g.strokeRect(x, y(top), (hover.side >= 0 ? RAIL_CELLS : 2) * cell, 2 * cell);
      }
      g.setLineDash([]);
    }

    // Walls: pinned to the top of their rail, whatever row is in view, because a wall
    // stands at the start of the map and nowhere else.
    const strip = head;
    g.fillStyle = '#0f0d26';
    g.fillRect(0, 0, GUTTER + ACROSS * cell, strip);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.font = '700 10px system-ui, sans-serif';
    g.fillStyle = '#7d86bd';
    g.fillText('WALLS STAND HERE, AT THE START OF THE MAP, AND HOLD THE ITEMS OF THEIR RAIL', laneX + (COLS * cell) / 2, strip / 2, COLS * cell - 8);
    // An empty place for a wall on each rail.
    g.setLineDash([4, 3]);
    g.strokeStyle = '#59619a';
    g.lineWidth = 1;
    for (const x of [GUTTER, rightX]) {
      g.strokeRect(x + 2.5, 2.5, RAIL_CELLS * cell - 5, strip - 5);
      g.fillText('WALL', x + (RAIL_CELLS * cell) / 2, strip / 2);
    }
    g.setLineDash([]);
    map.walls.forEach((hp, side) => {
      if (hp <= 0) return;
      const x = side === 0 ? GUTTER : rightX;
      const width = RAIL_CELLS * cell;
      g.drawImage(this.brickPicture, x + 1, 1, width - 2, strip - 2);
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(x + 1, 1, width - 2, strip - 2);
      const size = Math.min(13, strip * 0.5);
      g.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
      g.lineWidth = 3;
      g.strokeText(`WALL ${hp}`, x + width / 2, strip / 2);
      g.fillStyle = '#ffffff';
      g.fillText(`WALL ${hp}`, x + width / 2, strip / 2);
    });
    g.textBaseline = 'middle';

    if (first === 0) {
      g.fillStyle = '#ffd166';
      g.font = '700 11px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText('ROW 0 ARRIVES FIRST. SCROLL DOWN FOR MORE.', laneX + 4, y(0) + 9);
    }
  }
}
