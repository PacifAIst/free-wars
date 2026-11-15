import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BIG_HEIGHT_FACTOR,
  BUBBLE_DEFAULT_HP,
  BUBBLE_TYPE,
  BULLET_SPEED,
  ENEMY_STATS,
  FIRE_RATE,
  MARCH_SPEED,
  PUNCH_KILLS,
  RAIL_ITEM_SPEED,
  SHOOTER_Y,
  SIM_DT,
  SIM_HZ,
} from '../src/game/constants';
import { formatFw, fwToMapData, mapDataToFw, parseFw, readMapText } from '../src/game/fw';
import { Game, type GameView, memoryProgress } from '../src/game/Game';
import type { InputSource } from '../src/game/Input';
import type { MapSource } from '../src/game/maps';
import { createSim } from '../src/game/Sim';
import type { MapData } from '../src/types';
import { createScratch, gap, gatesOf, LONE, mapFromRows, rats, rowWith, run } from './helpers';

const bubbles = (sim: Parameters<typeof rats>[0]) => rats(sim).filter((e) => e.type === BUBBLE_TYPE);

describe('pace (A38)', () => {
  it('rats are 44% slower, the cats fire 18% less often and their bullets fly 18% slower', () => {
    expect(MARCH_SPEED).toBeCloseTo(12 * 0.56, 6);
    expect(FIRE_RATE).toBeCloseTo(1.64, 6);
    expect(BULLET_SPEED).toBeCloseTo(65.6, 6);
  });

  it('rail items come down 44% faster than before, ahead of the rats', () => {
    expect(RAIL_ITEM_SPEED).toBeCloseTo(17.28, 6);
    const map = mapFromRows([rowWith({ 0: 'G1-P3', 20: 'E1' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    run(sim, map, createScratch(), 1, { targetDelta: 30, keyDir: 0 });
    const gate = gatesOf(sim)[0];
    const rat = rats(sim).find((e) => e.x === 21)!;
    expect(gate.y - gate.prevY).toBeCloseTo(RAIL_ITEM_SPEED * SIM_DT, 6);
    expect(rat.y - rat.prevY).toBeCloseTo(MARCH_SPEED * SIM_DT, 6);
  });

  it('every punch kills four times as many cats', () => {
    expect(PUNCH_KILLS.slice(4)).toEqual([40, 60, 120, 60, 120]);
  });

  it('the charger and the boss sniper stand 44% taller; the fat rat and the robo rat keep their size', () => {
    expect(BIG_HEIGHT_FACTOR.slice(4)).toEqual([1, 1, 1.44, 1.44, 1]);
  });
});

describe('tank bubble (A38)', () => {
  it('is written TB in a map, with an optional HP, and covers 20 by 20 cells', () => {
    const map = mapFromRows([rowWith({ 12: 'TB-80', 40: 'E1' }), ...gap(30), rowWith({ 12: 'TB' })]);
    const sim = createSim(map, 1, LONE);
    const [first, second] = bubbles(sim).sort((a, b) => b.y - a.y);
    expect(first).toMatchObject({ hp: 80, maxHp: 80, w: 20, h: 20, x: 22 });
    expect(second.hp).toBe(BUBBLE_DEFAULT_HP);
    expect(ENEMY_STATS[BUBBLE_TYPE].w).toBe(20);
  });

  it('marches like a minion, and shots open it: the tank rolls out', () => {
    const map = mapFromRows([rowWith({ 12: 'TB-20' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 10 });
    const scratch = createScratch();
    run(sim, map, scratch, 2);
    const bubble = bubbles(sim)[0];
    expect(bubble.y - bubble.prevY).toBeCloseTo(MARCH_SPEED * SIM_DT, 6);
    while (sim.tank === 0 && sim.tick < 10 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.tank).toBeGreaterThan(0);
    expect(bubbles(sim)).toHaveLength(0);
    // It is a prize, not a kill.
    expect(sim.kills).toBe(0);
    expect(sim.clones).toBe(10);
  });

  it('unopened, it runs over the cats in its way once, and is no loss at the goal line', () => {
    const map = mapFromRows([rowWith({ 12: 'TB-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 60 });
    const scratch = createScratch();
    // Step aside so that only one edge of the swarm is in its way: it covers x from 12 to 32.
    run(sim, map, scratch, 1, { targetDelta: 18, keyDir: 0 });
    while (bubbles(sim).length > 0 && sim.tick < 60 * SIM_HZ && sim.phase === 'playing') run(sim, map, scratch, 1);
    expect(sim.phase).toBe('playing');
    // Some cats were in its way, not all; the shooter, at x = 40, was not.
    expect(sim.clones).toBeGreaterThan(20);
    expect(sim.clones).toBeLessThan(60);
  });

  it('a swarm out of its way is not touched', () => {
    const map = mapFromRows([rowWith({ 12: 'TB-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 6 });
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: 26, keyDir: 0 });
    while (bubbles(sim).length > 0 && sim.tick < 60 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.clones).toBe(6);
    expect(bubbles(sim)).toHaveLength(0);
  });

  it('is saved in a .fw file with its HP', () => {
    const fw = parseFw('FREE-WARS MAP 1\n30,12,TB hp=80\n60,0,E1\n')!;
    expect(fw.enemies[0]).toMatchObject({ row: 30, col: 12, type: BUBBLE_TYPE, hp: 80 });
    expect(formatFw(fw)).toContain('\n30,12,TB hp=80\n');
    const data = fwToMapData(fw)!;
    expect(mapDataToFw(data).enemies.find((e) => e.type === BUBBLE_TYPE)).toMatchObject({ row: 30, col: 12, hp: 80 });
  });
});

describe('map files are read by what is in them (A38)', () => {
  const FW = 'FREE-WARS MAP 1\nname: Mine\n0,L,WALL hp=150\n0,R,+1\n50,L,+50\n70,L,TANK\n126,20,E3\n128,0,E1\n';
  const expectMine = (map: MapData): void => {
    expect(map.walls).toEqual([150, 0]);
    const sim = createSim(map, 1, LONE);
    expect(sim.walls[0].hp).toBe(150);
    run(sim, map, createScratch(), 1);
    expect(gatesOf(sim).length).toBeGreaterThanOrEqual(2);
  };

  it('a .fw file', () => {
    const result = readMapText(FW, '1');
    if ('error' in result) throw new Error(result.error);
    expect(result.map.id).toBe('1');
    expect(result.map.name).toBe('Mine');
    expectMine(result.map);
  });

  it('.fw lines pasted into a Markdown map in place of its grid', () => {
    const text = `# Map: Back Alley 1\n\n- id: 1\n- name: Back Alley 1\n- difficulty: 1\n- author: PacifAIst\n- description: Anything.\n\n## Grid\nColumns: 44\n\n\`\`\`\n${FW.split('\n').slice(2).join('\n')}\`\`\`\n`;
    const result = readMapText(text, '1');
    if ('error' in result) throw new Error(result.error);
    expect(result.map.name).toBe('Back Alley 1');
    expectMine(result.map);
  });

  it('a Markdown map with its grid of cells, as before', () => {
    const text = readFileSync('public/maps/3.md', 'utf8');
    const result = readMapText(text, '3');
    if ('error' in result) throw new Error(result.error);
    expect(result.map.rows).toBeGreaterThan(100);
    expect(result.map.walls[1]).toBeGreaterThan(0);
  });

  it('a boss map is dark unless the file says otherwise, in every format', () => {
    const boss = readMapText(FW, '11');
    const plain = readMapText(FW, '12');
    const light = readMapText(FW.replace('name: Mine', 'name: Mine\ndark: no'), '11');
    if ('error' in boss || 'error' in plain || 'error' in light) throw new Error('unreadable');
    expect([boss.map.dark, plain.map.dark, light.map.dark]).toEqual([true, false, false]);
  });

  it('says what is wrong with a file it cannot read', () => {
    expect(readMapText('FREE-WARS MAP 1\n5,99,E1\n', '1')).toHaveProperty('error');
    expect(readMapText('hello', '1')).toHaveProperty('error');
    expect(readMapText('FREE-WARS MAP 1\nname: Empty\n', '1')).toHaveProperty('error');
  });

  it('every built-in map goes through the editor format and back unchanged', () => {
    for (let n = 1; n <= 44; n++) {
      const first = readMapText(readFileSync(`public/maps/${n}.md`, 'utf8'), String(n));
      if ('error' in first) throw new Error(`map ${n}: ${first.error}`);
      const again = readMapText(formatFw(mapDataToFw(first.map)), String(n));
      if ('error' in again) throw new Error(`map ${n} after the editor: ${again.error}`);
      expect(Array.from(again.map.cells.slice(0, 44 * 60)), `map ${n}`).toHaveLength(44 * 60);
      expect(again.map.rows, `map ${n}`).toBe(first.map.rows);
      expect(again.map.walls, `map ${n}`).toEqual(first.map.walls);
      expect(again.map.dark, `map ${n}`).toBe(first.map.dark);
      const a = createSim(first.map, 5, LONE);
      const b = createSim(again.map, 5, LONE);
      expect(b.enemies.live, `map ${n}`).toBe(a.enemies.live);
    }
  });
});

describe('next map button (A38)', () => {
  class Quiet implements InputSource {
    consumeTargetDelta(): number {
      return 0;
    }
    keyDir(): number {
      return 0;
    }
    takeTap(): boolean {
      return false;
    }
    takePause(): boolean {
      return false;
    }
  }
  const view: GameView = { cellPx: () => 10, render: () => undefined };
  const QUICK = mapFromRows([rowWith({ 22: 'E1' })], '1');
  const LONG = mapFromRows([...gap(400), rowWith({ 0: 'E1' })], '2');
  const source = (maps: Record<string, MapData>): MapSource => ({
    has: (id) => id in maps,
    load: (id) => (id in maps ? Promise.resolve(maps[id]) : Promise.reject(new Error('none'))),
  });
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function win(maps: Record<string, MapData>): Promise<Game> {
    const game = new Game(view, new Quiet(), source(maps), { nextSeed: () => 7, progress: memoryProgress() });
    game.ready();
    game.play();
    game.chooseLevel('1');
    let now = 0;
    for (let i = 0; i < 20 * SIM_HZ && game.state !== 'WIN'; i++) {
      game.frame((now += 1000 / 60));
      if (game.state === 'LOADING') await settle();
    }
    expect(game.state).toBe('WIN');
    return game;
  }

  it('goes straight into the next map', async () => {
    const game = await win({ '1': QUICK, '2': LONG });
    expect(game.nextLevelId()).toBe('2');
    game.nextLevel();
    expect(game.state).toBe('LOADING');
    for (let i = 0; i < 5; i++) {
      game.frame(100000 + i * 16);
      await settle();
    }
    expect(game.state).toBe('PLAYING');
    expect(game.levelId).toBe('2');
    expect(game.sim.tick).toBeLessThan(10);
  });

  it('with no next map it goes back to the map grid', async () => {
    const game = await win({ '1': QUICK });
    expect(game.nextLevelId()).toBeNull();
    game.nextLevel();
    expect(game.state).toBe('LEVEL_SELECT');
  });

  it('keeps the shooter in its place: SHOOTER_Y is unchanged', () => {
    expect(SHOOTER_Y).toBe(136);
  });
});
