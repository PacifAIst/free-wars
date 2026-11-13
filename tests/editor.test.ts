import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOMB_KILLS, COLS, ENEMY_ROCKETS, RAIL_LEFT_X, SIM_HZ } from '../src/game/constants';
import { FX_BLAST, FX_BOMB } from '../src/game/Fx';
import {
  emptyFwMap,
  eraseEnemyAt,
  eraseItemAt,
  formatFw,
  FW_HEADER,
  type FwMap,
  fwRows,
  fwToMapData,
  mapDataToFw,
  parseFw,
  placeEnemy,
  placeItem,
} from '../src/game/fw';
import { getLayout } from '../src/game/layout';
import { grantDrop } from '../src/game/Powerup';
import { createSim } from '../src/game/Sim';
import { parseMap } from '../src/parsers/markdownMapParser';
import type { SimState } from '../src/types';
import { createScratch, gap, gatesOf, LONE, mapFromRows, rats, rowWith, run } from './helpers';

const FAR = mapFromRows([...gap(600), rowWith({ 0: 'E1' })]);

function sample(): FwMap {
  const map = emptyFwMap('Test map');
  placeItem(map, { row: 0, side: 0, drop: 3 });
  placeItem(map, { row: 0, side: 1, drop: 7 });
  placeItem(map, { row: 8, side: 0, drop: 9 });
  placeItem(map, { row: 8, side: 1, drop: 0 });
  for (let c = 0; c < COLS; c += 2) placeEnemy(map, { row: 40, col: c, type: 1, hp: 0, drop: 0 });
  placeEnemy(map, { row: 60, col: 14, type: 4, hp: 320, drop: 4 });
  placeEnemy(map, { row: 60, col: 0, type: 0, hp: 0, drop: 0 });
  return map;
}

/** Everything on a map as sorted lines, so two maps can be compared whatever order they were built in. */
const contents = (map: FwMap): string[] =>
  [
    ...map.enemies.map((e) => `${e.row},${e.col},E${e.type},${e.hp},${e.drop}`),
    ...map.items.map((i) => `${i.row},${i.side === 0 ? 'L' : 'R'},${i.drop}`),
  ].sort();

describe('.fw map files (A35)', () => {
  it('a saved map reads back the same', () => {
    const map = sample();
    const text = formatFw(map);
    expect(text.startsWith(`${FW_HEADER}\nname: Test map\n`)).toBe(true);
    expect(text).toContain('\n0,L,+10\n');
    expect(text).toContain('\n0,R,ROCKET\n');
    expect(text).toContain('\n8,L,BOMB\n');
    expect(text).toContain('\n8,R,?\n');
    expect(text).toContain('\n60,14,E4 hp=320 drop=+50\n');
    expect(text).toContain('\n60,0,ER\n');
    const back = parseFw(text)!;
    expect(back.name).toBe('Test map');
    expect(contents(back)).toEqual(contents(map));
  });

  it('reads a file written by hand: comments, blank lines, any letter case', () => {
    const map = parseFw('free-wars map 1\n\n# my map\nName: Hand made\n 4 , l , +50 \n10,2,e2\r\n12,20,E5 HP=900\n')!;
    expect(map.name).toBe('Hand made');
    expect(map.items).toEqual([{ row: 4, side: 0, drop: 4 }]);
    expect(map.enemies).toEqual([
      { row: 10, col: 2, type: 2, hp: 0, drop: 0 },
      // A boss is 40 cells wide: it is moved in from the wall.
      { row: 12, col: 4, type: 5, hp: 900, drop: 0 },
    ]);
  });

  it('says no to a wrong file', () => {
    const wrong = [
      '',
      'hello',
      '# Map: The beginning\n- id: 1',
      `${FW_HEADER}\n1,2`,
      `${FW_HEADER}\n1,2,E9`,
      `${FW_HEADER}\n1,44,E1`,
      `${FW_HEADER}\n-1,2,E1`,
      `${FW_HEADER}\n1,L,E1`,
      `${FW_HEADER}\n1,L,+7`,
      `${FW_HEADER}\n1,2,E1 hp=0`,
      `${FW_HEADER}\n1,2,E1 drop=?`,
      `${FW_HEADER}\n1,2,E1 fast`,
      `${FW_HEADER}\n999999,2,E1`,
      `${FW_HEADER}\n1,2,+10`,
    ];
    for (const text of wrong) expect(parseFw(text), JSON.stringify(text)).toBeNull();
    expect(parseFw(`${FW_HEADER}\n`)).not.toBeNull();
  });

  it('whatever is placed takes the place of what it overlaps', () => {
    const map = emptyFwMap();
    for (let c = 0; c < COLS; c += 2) placeEnemy(map, { row: 10, col: c, type: 1, hp: 0, drop: 0 });
    expect(map.enemies).toHaveLength(22);
    // A fat rat is 16 by 16 cells: it replaces the eight minions under it.
    placeEnemy(map, { row: 10, col: 14, type: 4, hp: 0, drop: 0 });
    expect(map.enemies).toHaveLength(22 - 8 + 1);
    // A minion on the same cell replaces a minion; one on the fat rat replaces the fat rat.
    placeEnemy(map, { row: 10, col: 0, type: 2, hp: 0, drop: 0 });
    expect(map.enemies).toHaveLength(15);
    placeEnemy(map, { row: 20, col: 20, type: 3, hp: 0, drop: 0 });
    expect(map.enemies.some((e) => e.type === 4)).toBe(false);
    // On a rail, items closer than a panel's depth cannot both stand.
    placeItem(map, { row: 0, side: 0, drop: 1 });
    placeItem(map, { row: 2, side: 0, drop: 2 });
    placeItem(map, { row: 2, side: 1, drop: 2 });
    expect(map.items).toEqual([
      { row: 2, side: 0, drop: 2 },
      { row: 2, side: 1, drop: 2 },
    ]);
  });

  it('the rubber removes what it touches', () => {
    const map = sample();
    expect(eraseEnemyAt(map, 20, 70)).toBe(true);
    expect(map.enemies.some((e) => e.type === 4)).toBe(false);
    expect(eraseEnemyAt(map, 20, 70)).toBe(false);
    expect(eraseItemAt(map, 0, 9)).toBe(true);
    expect(map.items.some((i) => i.drop === 9)).toBe(false);
    expect(eraseItemAt(map, 1, 30)).toBe(false);
  });

  it('becomes a map the game plays: every enemy and rail item is there', () => {
    const map = sample();
    const data = fwToMapData(map)!;
    expect(data.id).toBe('custom');
    expect(data.name).toBe('Test map');
    expect(data.rows).toBe(fwRows(map) - 15);
    const layout = getLayout(data, 1);
    expect(layout.dropped).toBe(0);
    const sim = createSim(data, 1, LONE);
    run(sim, data, createScratch(), 1);
    // The 100 rows that start in the window hold all of it.
    expect(gatesOf(sim)).toHaveLength(4);
    expect(rats(sim).filter((e) => e.type === 1 || e.type === 2 || e.type === 3)).toHaveLength(23);
    const fat = rats(sim).find((e) => e.type === 4)!;
    expect(fat).toMatchObject({ hp: 320, drop: 4, x: 22 });
    expect(contents(mapDataToFw(data))).toEqual(contents(map));
  });

  it('a rail item and an enemy can share a row and a wall', () => {
    const map = emptyFwMap();
    placeEnemy(map, { row: 0, col: 0, type: 1, hp: 0, drop: 0 });
    placeEnemy(map, { row: 0, col: 42, type: 1, hp: 0, drop: 0 });
    placeItem(map, { row: 0, side: 0, drop: 3 });
    placeItem(map, { row: 0, side: 1, drop: 3 });
    const data = fwToMapData(map)!;
    expect(contents(mapDataToFw(data))).toEqual(contents(map));
  });

  it('an empty map cannot be played', () => {
    expect(fwToMapData(emptyFwMap())).toBeNull();
  });

  it('every built-in map survives the trip through the editor', () => {
    for (const n of [1, 4, 11, 22, 33, 44]) {
      const parsed = parseMap(readFileSync(`public/maps/${n}.md`, 'utf8'));
      if (!parsed.ok) throw new Error(`map ${n}`);
      const first = mapDataToFw(parsed.map);
      const again = mapDataToFw(fwToMapData(parseFw(formatFw(first))!, String(n))!);
      expect(contents(again), `map ${n}`).toEqual(contents(first));
      expect(first.enemies.length + first.items.length).toBeGreaterThan(20);
    }
  });
});

describe('bomb (A35)', () => {
  const BOMB = mapFromRows([rowWith({ 0: 'G1-P9' }), ...gap(600), rowWith({ 0: 'E1' })]);
  const toRail = (sim: SimState) => run(sim, BOMB, createScratch(), 1, { targetDelta: RAIL_LEFT_X - sim.shooter.x, keyDir: 0 });

  it('goes off when the swarm touches it and kills 18 cats', () => {
    const sim = createSim(BOMB, 1, { startClones: 30 });
    const scratch = createScratch();
    toRail(sim);
    while (gatesOf(sim).length > 0 && sim.tick < 10 * SIM_HZ) run(sim, BOMB, scratch, 1);
    expect(sim.clones).toBe(30 - BOMB_KILLS);
    expect(sim.phase).toBe('playing');
    const fx = sim.fx.items.find((f) => f.active && f.kind === FX_BOMB)!;
    expect(fx.size).toBe(BOMB_KILLS);
  });

  it('a swarm smaller than that is wiped out', () => {
    const sim = createSim(BOMB, 1, { startClones: 5 });
    const scratch = createScratch();
    toRail(sim);
    while (sim.phase === 'playing' && sim.tick < 10 * SIM_HZ) run(sim, BOMB, scratch, 1);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('swarm');
  });

  it('does nothing to a swarm that stays off its rail, or inside the tank', () => {
    const away = createSim(BOMB, 1, { startClones: 30 });
    run(away, BOMB, createScratch(), 6 * SIM_HZ);
    expect(away.clones).toBe(30);
    expect(gatesOf(away)).toHaveLength(0);

    const tank = createSim(FAR, 1, { startClones: 30 });
    tank.tank = 5;
    grantDrop(tank, 9, tank.shooter.x, 130, FX_BOMB);
    expect(tank.clones).toBe(30);
  });
});

describe('enemy rockets (SPEC 7.2)', () => {
  // The fat rat stands 60 rows up the file, so its first rocket flies before it arrives itself.
  const FAT = mapFromRows([...gap(60), rowWith({ 14: 'E4-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
  const launcher = ENEMY_ROCKETS[4]!;

  it('the fat rat fires after half its interval, then at every interval', () => {
    const sim = createSim(FAT, 1, LONE);
    const scratch = createScratch();
    // Out of the way, on the right rail.
    run(sim, FAT, scratch, 1, { targetDelta: 34, keyDir: 0 });
    run(sim, FAT, scratch, (launcher.interval / 2) * SIM_HZ - 3);
    expect(sim.enemyRocketsFired).toBe(0);
    run(sim, FAT, scratch, 6);
    expect(sim.enemyRocketsFired).toBe(1);
    // It flies straight down the lane from the rat, faster than the rat walks.
    const rocket = sim.rockets.items.find((r) => r.active)!;
    expect(rocket.x).toBe(22);
    expect(rocket.y - rocket.prevY).toBeCloseTo(launcher.speed / SIM_HZ, 6);
    // It misses a swarm that is not in its way, and is gone at the goal line.
    run(sim, FAT, scratch, 4 * SIM_HZ);
    expect(sim.rockets.live).toBe(0);
    expect(sim.phase).toBe('playing');
  });

  it('a rocket that reaches the swarm kills the cats in its blast, the shooter included', () => {
    const sim = createSim(FAT, 1, LONE);
    const scratch = createScratch();
    while (sim.phase === 'playing' && sim.tick < 8 * SIM_HZ) run(sim, FAT, scratch, 1);
    // The lone cat cannot shoot it down in time.
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('swarm');
    expect(sim.fx.items.some((f) => f.active && f.kind === FX_BLAST && f.tag === 2)).toBe(true);
  });

  it('a swarm under it shoots it down, and it bursts harmlessly', () => {
    const sim = createSim(FAT, 1, { startClones: 40 });
    const scratch = createScratch();
    let shotDown = false;
    while (sim.tick < 7 * SIM_HZ && sim.phase === 'playing') {
      run(sim, FAT, scratch, 1);
      if (sim.fx.items.some((f) => f.active && f.kind === FX_BLAST && f.tag === 3)) shotDown = true;
    }
    expect(sim.enemyRocketsFired).toBe(1);
    expect(shotDown).toBe(true);
    expect(sim.clones).toBe(40);
  });
});
