// The .fw map file (decision A35): the format the map editor saves and loads.
//
// A plain text file, one thing per line:
//
//   FREE-WARS MAP 1
//   name: My map
//   0,L,+10          row 0, left rail: a +10 panel
//   0,R,ROCKET       row 0, right rail: a rocket panel
//   0,L,WALL hp=150  a brick wall across the left rail (row 0 only)
//   dark: yes        a night map
//   112,0,E1         row 112, column 0: a minion
//   230,14,E4 hp=320 drop=+50
//
// Rows count from 0, the first to reach the swarm. A lane column is 0 to 43
// and names the left cell of the unit; L and R are the rails. Lines that
// start with # are comments. Anything else makes the file a wrong file.
//
// A .fw file becomes the same MapData as a built-in map, so the game plays
// both the same way.

import { formatIssue, parseMap } from '../parsers/markdownMapParser';
import { cellSpec } from '../parsers/tokens';
import type { MapData } from '../types';
import { COLS, DROP_CODE_MAX, ENEMY_STATS, ENEMY_TYPE_COUNT, GATE_TYPE, WALL_MAX_HP } from './constants';

export interface FwEnemy {
  row: number;
  /** Left cell of its footprint. */
  col: number;
  /** 1 to 8, or 0 for a random minion (`ER`). */
  type: number;
  /** HP it is given, or 0 for the HP of its type. */
  hp: number;
  /** What it drops when it dies (a drop code), or 0. */
  drop: number;
}

export interface FwItem {
  row: number;
  /** 0 the left rail, 1 the right. */
  side: number;
  /** Drop code; 0 is a surprise. */
  drop: number;
}

export interface FwMap {
  name: string;
  enemies: FwEnemy[];
  items: FwItem[];
  /** A night map. */
  dark: boolean;
  /** HP of the brick wall on the left and on the right rail; 0 for none. */
  walls: [number, number];
}

export const FW_HEADER = 'FREE-WARS MAP 1';
/** Names of the items in a .fw file, indexed by drop code. */
export const FW_ITEM_NAMES: readonly string[] = ['?', '+1', '+3', '+10', '+50', 'MINIGUN', 'LASER', 'ROCKET', 'TANK', 'BOMB'];
/** A map longer than this is refused: it is more likely a mistake than a map. */
export const FW_MAX_ROWS = 6000;
/** Rows a panel takes up on its rail. */
export const RAIL_ITEM_ROWS = ENEMY_STATS[GATE_TYPE].h;
/** Columns of the lane edge where a rail item may be written in the grid of a built-in map. */
const EDGE = 4;

export function emptyFwMap(name = 'My map'): FwMap {
  return { name, enemies: [], items: [], dark: false, walls: [0, 0] };
}

/** Footprint of an enemy type in cells. A random minion is a minion. */
export function enemySize(type: number): { w: number; h: number } {
  return ENEMY_STATS[type === 0 ? 1 : type];
}

function overlaps(a: FwEnemy, b: FwEnemy): boolean {
  const sa = enemySize(a.type);
  const sb = enemySize(b.type);
  return a.col < b.col + sb.w && b.col < a.col + sa.w && a.row < b.row + sb.h && b.row < a.row + sa.h;
}

/** Puts an enemy on the map. It takes the place of whatever it overlaps. */
export function placeEnemy(map: FwMap, enemy: FwEnemy): void {
  const { w } = enemySize(enemy.type);
  enemy.col = Math.min(Math.max(0, enemy.col), COLS - w);
  map.enemies = map.enemies.filter((other) => !overlaps(enemy, other));
  map.enemies.push(enemy);
}

/** Puts an item on a rail. It takes the place of whatever it overlaps there. */
export function placeItem(map: FwMap, item: FwItem): void {
  map.items = map.items.filter((other) => other.side !== item.side || Math.abs(other.row - item.row) >= RAIL_ITEM_ROWS);
  map.items.push(item);
}

/** Removes what stands on a cell of the lane. Returns true if something was removed. */
export function eraseEnemyAt(map: FwMap, col: number, row: number): boolean {
  const before = map.enemies.length;
  map.enemies = map.enemies.filter((e) => {
    const { w, h } = enemySize(e.type);
    return !(col >= e.col && col < e.col + w && row >= e.row && row < e.row + h);
  });
  return map.enemies.length !== before;
}

/** Removes the item that covers a row of a rail. Returns true if something was removed. */
export function eraseItemAt(map: FwMap, side: number, row: number): boolean {
  const before = map.items.length;
  map.items = map.items.filter((i) => !(i.side === side && row >= i.row && row < i.row + RAIL_ITEM_ROWS));
  return map.items.length !== before;
}

/** Rows the map needs: one past the last row anything covers. */
export function fwRows(map: FwMap): number {
  let rows = 0;
  for (const e of map.enemies) rows = Math.max(rows, e.row + enemySize(e.type).h);
  for (const i of map.items) rows = Math.max(rows, i.row + RAIL_ITEM_ROWS);
  return rows;
}

const enemyToken = (e: FwEnemy): string => (e.type === 0 ? 'ER' : `E${e.type}`);

/** The text of a .fw file. */
export function formatFw(map: FwMap): string {
  const lines = [
    FW_HEADER,
    `name: ${map.name.replace(/\s+/g, ' ').trim()}`,
    '# row,column,what. Column 0-43 is the left cell of a unit in the lane; L and R are the rails.',
    '# In the lane: E1-E8 or ER, then optional hp=<number> and drop=<item>.',
    `# On a rail, an item: ${FW_ITEM_NAMES.join(' ')}`,
  ];
  const entries: [number, number, string][] = [];
  for (const i of map.items) entries.push([i.row, i.side === 0 ? -1 : COLS, `${i.row},${i.side === 0 ? 'L' : 'R'},${FW_ITEM_NAMES[i.drop]}`]);
  for (const e of map.enemies) {
    const hp = e.hp > 0 ? ` hp=${e.hp}` : '';
    const drop = e.drop > 0 ? ` drop=${FW_ITEM_NAMES[e.drop]}` : '';
    entries.push([e.row, e.col, `${e.row},${e.col},${enemyToken(e)}${hp}${drop}`]);
  }
  entries.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (map.dark) lines.splice(2, 0, 'dark: yes');
  // A wall stands at the start of its rail, so it is always written on row 0.
  map.walls.forEach((hp, side) => {
    if (hp > 0) lines.push(`0,${side === 0 ? 'L' : 'R'},WALL hp=${hp}`);
  });
  for (const entry of entries) lines.push(entry[2]);
  return `${lines.join('\n')}\n`;
}

const wholeNumber = (text: string): number => (/^\d{1,6}$/.test(text) ? Number(text) : -1);

/** Reads a .fw file. Returns null for a wrong file: there is no partial result. */
export function parseFw(text: string): FwMap | null {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  if (lines.length === 0 || lines[0].toUpperCase() !== FW_HEADER) return null;

  const map = emptyFwMap('');
  for (const line of lines.slice(1)) {
    const name = /^name\s*:\s*(.*)$/i.exec(line);
    if (name) {
      map.name = name[1].slice(0, 80);
      continue;
    }
    const dark = /^dark\s*:\s*(\w+)$/i.exec(line);
    if (dark) {
      map.dark = /^(yes|true|1|on)$/i.test(dark[1]);
      continue;
    }
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length !== 3) return null;
    const row = wholeNumber(parts[0]);
    if (row < 0 || row >= FW_MAX_ROWS) return null;
    const column = parts[1].toUpperCase();

    if (column === 'L' || column === 'R') {
      // A wall: only at the start of the map, with its HP.
      const wall = /^WALL\s+HP=(\d{1,6})$/i.exec(parts[2]);
      if (wall) {
        const hp = Number(wall[1]);
        if (row !== 0 || hp < 1 || hp > WALL_MAX_HP) return null;
        map.walls[column === 'L' ? 0 : 1] = hp;
        continue;
      }
      const drop = FW_ITEM_NAMES.indexOf(parts[2].toUpperCase());
      if (drop < 0) return null;
      placeItem(map, { row, side: column === 'L' ? 0 : 1, drop });
      continue;
    }

    const col = wholeNumber(column);
    if (col < 0 || col >= COLS) return null;
    const [token, ...options] = parts[2].toUpperCase().split(/\s+/);
    const kind = /^E([1-8R])$/.exec(token);
    if (!kind) return null;
    const type = kind[1] === 'R' ? 0 : Number(kind[1]);
    if (type > ENEMY_TYPE_COUNT) return null;
    const enemy: FwEnemy = { row, col, type, hp: 0, drop: 0 };
    for (const option of options) {
      const hp = /^HP=(\d{1,7})$/.exec(option);
      const drop = /^DROP=(.+)$/.exec(option);
      if (hp && Number(hp[1]) >= 1) enemy.hp = Number(hp[1]);
      else if (drop && FW_ITEM_NAMES.indexOf(drop[1]) >= 1) enemy.drop = FW_ITEM_NAMES.indexOf(drop[1]);
      else return null;
    }
    placeEnemy(map, enemy);
  }
  if (map.name === '') map.name = 'My map';
  return map;
}

/**
 * Turns an editor map into the map the game plays, with the given id. Returns
 * null when there is nothing on it, or when the game's own map check refuses it.
 */
export function fwToMapData(map: FwMap, id = 'custom'): MapData | null {
  const count = fwRows(map);
  if (count === 0 || count > FW_MAX_ROWS) return null;
  const grid: string[][] = Array.from({ length: count }, () => Array.from({ length: COLS }, () => ''));
  for (const e of map.enemies) {
    const hp = e.hp > 0 ? `-${e.hp}` : '';
    const drop = e.drop > 0 && e.drop <= DROP_CODE_MAX ? `-P${e.drop}` : '';
    grid[e.row][e.col] = `${enemyToken(e)}${hp}${drop}`;
  }
  // A rail item is written in one of the four edge columns of its side: the first that is free.
  for (const i of map.items) {
    const token = `G1${i.drop > 0 ? `-P${i.drop}` : ''}`;
    for (let k = 0; k < EDGE; k++) {
      const c = i.side === 0 ? k : COLS - 1 - k;
      if (grid[i.row][c] === '') {
        grid[i.row][c] = token;
        break;
      }
    }
  }
  const name = map.name.replace(/\s+/g, ' ').trim() || 'My map';
  const rows = grid.map((cells) => cells.join('\t').replace(/\t+$/, ''));
  const walls = `${map.walls[0] > 0 ? `- wall-left: ${map.walls[0]}\n` : ''}${map.walls[1] > 0 ? `- wall-right: ${map.walls[1]}\n` : ''}`;
  const text = `# Map: ${name}\n\n- id: ${id}\n- name: ${name}\n- difficulty: 1\n- dark: ${map.dark ? 'yes' : 'no'}\n${walls}\n## Grid\nColumns: ${COLS}\n\n\`\`\`\n${rows.join('\n')}\n\`\`\`\n`;
  const result = parseMap(text);
  if (!result.ok) {
    console.warn(`[free-wars] map refused: ${result.errors.map(formatIssue).join('; ')}`);
    return null;
  }
  return result.map;
}

/** Turns a map the game plays, such as a built-in one, into an editor map. */
export function mapDataToFw(data: MapData): FwMap {
  const map = emptyFwMap(data.name || data.title || 'My map');
  map.dark = data.dark;
  map.walls = [data.walls[0], data.walls[1]];
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = data.cells[r * COLS + c];
      if (id === 0) continue;
      const spec = cellSpec(data, id);
      if (spec.kind === 'gate') placeItem(map, { row: r, side: c < COLS / 2 ? 0 : 1, drop: spec.drop });
      else if (spec.kind === 'enemy') placeEnemy(map, { row: r, col: c, type: spec.type, hp: spec.hp, drop: spec.drop });
      else if (spec.kind === 'random') placeEnemy(map, { row: r, col: c, type: 0, hp: spec.hp, drop: spec.drop });
    }
  }
  return map;
}
