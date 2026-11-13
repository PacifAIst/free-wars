import { describe, expect, it } from 'vitest';
import { cloneY } from '../src/game/Clone';
import {
  DROP_LASER,
  DROP_MINIGUN,
  DROP_ROCKET,
  DROP_TANK,
  E6_CHARGE_RANGE,
  E6_CHARGE_SPEED_SPEC,
  FIRE_RATE,
  LASER_BEAM_SECONDS,
  LASER_BIG_DMG,
  LASER_CHARGE_SECONDS,
  LASER_TOTAL_SECONDS,
  MARCH_SPEED,
  MINIGUN_CAP_SECONDS,
  MINIGUN_PICKUP_SECONDS,
  MINIGUN_RATE_FACTOR,
  PUNCH_KILLS,
  RAIL_LEFT_X,
  ROCKET_FIRE_RATE,
  ROCKET_SHOOTERS,
  SHOOTER_Y,
  SIM_DT,
  SIM_HZ,
  SMASH_INTERVAL,
  SPEED_SCALE,
  TANK_SECONDS,
} from '../src/game/constants';
import { FX_CAT, FX_PICKUP, FX_PUNCH } from '../src/game/Fx';
import { memoryProgress } from '../src/game/Game';
import { musicTrackFor } from '../src/game/Music';
import { grantDrop, spawnDrop } from '../src/game/Powerup';
import { BULLET_MINIGUN } from '../src/game/Projectile';
import { type KeyValueStore, Save } from '../src/game/Save';
import { createSim } from '../src/game/Sim';
import { LASER_CHARGING, LASER_FIRING, laserPhase } from '../src/game/Weapon';
import type { SimState } from '../src/types';
import { createScratch, gap, gatesOf, LONE, mapFromRows, rats, rowWith, run } from './helpers';

/** One rat far up the file, so the level stays in progress while a test sets things up. */
const FAR = mapFromRows([...gap(600), rowWith({ 0: 'E1' })]);
const give = (sim: SimState, drop: number): void => grantDrop(sim, drop, sim.shooter.x, SHOOTER_Y, FX_PICKUP);

describe('minigun (SPEC 8.1)', () => {
  it('doubles the fire rate for five seconds and fires minigun bullets', () => {
    const sim = createSim(FAR, 1, LONE);
    const scratch = createScratch();
    give(sim, DROP_MINIGUN);
    expect(sim.minigun).toBe(MINIGUN_PICKUP_SECONDS);
    run(sim, FAR, scratch, 4 * SIM_HZ);
    const expected = 4 * FIRE_RATE * MINIGUN_RATE_FACTOR;
    expect(sim.shots).toBeGreaterThanOrEqual(expected - 3);
    expect(sim.shots).toBeLessThanOrEqual(expected + 3);
    expect(sim.bullets.items.filter((b) => b.active).every((b) => b.kind === BULLET_MINIGUN)).toBe(true);
    run(sim, FAR, scratch, 2 * SIM_HZ);
    expect(sim.minigun).toBe(0);
    const before = sim.shots;
    run(sim, FAR, scratch, 4 * SIM_HZ);
    expect(sim.shots - before).toBeLessThanOrEqual(4 * FIRE_RATE + 3);
  });

  it('stacks up to its cap', () => {
    const sim = createSim(FAR, 1, LONE);
    for (let i = 0; i < 10; i++) give(sim, DROP_MINIGUN);
    expect(sim.minigun).toBe(MINIGUN_CAP_SECONDS);
  });
});

describe('rocket mode (SPEC 8, B6)', () => {
  it('the shooter fires rockets and no bullets', () => {
    const sim = createSim(FAR, 1, LONE);
    give(sim, DROP_ROCKET);
    run(sim, FAR, createScratch(), 4 * SIM_HZ);
    expect(sim.shots).toBe(0);
    expect(sim.rocketsFired).toBeGreaterThanOrEqual(4 * ROCKET_FIRE_RATE - 1);
    expect(sim.rocketsFired).toBeLessThanOrEqual(4 * ROCKET_FIRE_RATE + 2);
  });

  it('only the shooter and the first clones fire rockets; the rest keep their bullets', () => {
    const sim = createSim(FAR, 1, { startClones: 20 });
    give(sim, DROP_ROCKET);
    run(sim, FAR, createScratch(), 4 * SIM_HZ);
    expect(sim.rocketsFired).toBeGreaterThan(ROCKET_SHOOTERS * 4 * ROCKET_FIRE_RATE * 0.7);
    expect(sim.rocketsFired).toBeLessThan(ROCKET_SHOOTERS * 4 * ROCKET_FIRE_RATE * 1.3 + 2);
    expect(sim.shots).toBeGreaterThan(0);
  });

  it('a rocket kills every rat in its blast', () => {
    // Six minions side by side; the shooter stands under the fourth.
    const map = mapFromRows([rowWith({ 16: 'E1', 18: 'E1', 20: 'E1', 22: 'E1', 24: 'E1', 26: 'E1' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    give(sim, DROP_ROCKET);
    while (sim.kills === 0 && sim.tick < 3 * SIM_HZ) run(sim, map, scratch, 1);
    // The blast is 8 cells wide round x = 22: it covers the minions at columns 18 to 24.
    expect(sim.kills).toBe(4);
    expect(rats(sim).filter((e) => e.type === 1 && e.y > 0)).toHaveLength(2);
  });
});

describe('laser (SPEC 8, 8.1, B5)', () => {
  it('charges for two seconds, then kills every minion in its beam', () => {
    const ranks = [0, 2, 4].map(() => rowWith({ 20: 'E3', 30: 'E1' }));
    const map = mapFromRows([ranks[0], '', ranks[1], '', ranks[2], ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    give(sim, DROP_LASER);
    expect(laserPhase(sim)).toBe(LASER_CHARGING);
    run(sim, map, scratch, LASER_CHARGE_SECONDS * SIM_HZ - 2);
    expect(laserPhase(sim)).toBe(LASER_CHARGING);
    expect(sim.kills).toBe(0);
    run(sim, map, scratch, 4);
    expect(laserPhase(sim)).toBe(LASER_FIRING);
    expect(sim.laserCasts).toBe(1);
    // The elites at column 20 are in the beam, 8 cells wide round x = 22; the minions at column 30 are not.
    expect(sim.kills).toBe(3);
    expect(rats(sim).filter((e) => e.type === 1 && e.y > 0)).toHaveLength(3);
  });

  it('hurts a big rat once per cast', () => {
    const map = mapFromRows([rowWith({ 14: 'E4-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    give(sim, DROP_LASER);
    run(sim, map, scratch, LASER_CHARGE_SECONDS * SIM_HZ - 2);
    const fat = rats(sim).find((e) => e.type === 4)!;
    const before = fat.hp;
    run(sim, map, scratch, LASER_BEAM_SECONDS * SIM_HZ + 4);
    const lost = before - fat.hp;
    // One cast, plus the shooter's own bullets during that half second.
    expect(lost).toBeGreaterThanOrEqual(LASER_BIG_DMG);
    expect(lost).toBeLessThan(LASER_BIG_DMG + 6);
    expect(fat.cast).toBe(1);
  });

  it('fires twice in its ten seconds, then ends', () => {
    const sim = createSim(FAR, 1, LONE);
    give(sim, DROP_LASER);
    run(sim, FAR, createScratch(), LASER_TOTAL_SECONDS * SIM_HZ + 2);
    expect(sim.laserCasts).toBe(2);
    expect(sim.laser).toBe(0);
    expect(laserPhase(sim)).toBe(0);
  });
});

describe('tank (SPEC 8, 8.1, 9)', () => {
  it('fires tank rockets, crushes minions and keeps the swarm safe', () => {
    const map = mapFromRows([rowWith({ 16: 'E1', 18: 'E1', 20: 'E1', 22: 'E1', 24: 'E1', 26: 'E1' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 10 });
    const scratch = createScratch();
    give(sim, DROP_TANK);
    expect(sim.tank).toBe(TANK_SECONDS);
    run(sim, map, scratch, 4 * SIM_HZ);
    expect(sim.shots).toBe(0);
    expect(sim.rocketsFired).toBeGreaterThanOrEqual(7);
    expect(sim.kills).toBe(6);
    expect(sim.clones).toBe(10);
    run(sim, map, scratch, 2 * SIM_HZ);
    expect(sim.tank).toBe(0);
    expect(sim.shots).toBeGreaterThan(0);
  });

  it('a big rat cannot punch it', () => {
    const map = mapFromRows([rowWith({ 14: 'E4-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 10 });
    const scratch = createScratch();
    give(sim, DROP_TANK);
    run(sim, map, scratch, Math.round(4.8 * SIM_HZ));
    const fat = rats(sim).find((e) => e.type === 4)!;
    // The fat rat is on top of the tank by now, and has been crushed and shelled.
    expect(fat.y + fat.h / 2).toBeGreaterThan(SHOOTER_Y);
    expect(fat.hp).toBeLessThan(100000 - 20);
    expect(sim.clones).toBe(10);
    expect(sim.phase).toBe('playing');
  });

  it('comes in a bubble that shots open', () => {
    const sim = createSim(FAR, 1, { startClones: 60 });
    const scratch = createScratch();
    spawnDrop(sim, DROP_TANK, sim.shooter.x, 40);
    while (sim.tank === 0 && sim.tick < 5 * SIM_HZ) run(sim, FAR, scratch, 1);
    expect(sim.tank).toBeGreaterThan(0);
    expect(sim.powerups.live).toBe(0);
  });

  it('a bubble that is not shot open gives nothing, even when it touches the swarm', () => {
    const sim = createSim(FAR, 1, LONE);
    const scratch = createScratch();
    // The lone cat lands a dozen shots on it: not enough.
    spawnDrop(sim, DROP_TANK, sim.shooter.x, 40);
    run(sim, FAR, scratch, 12 * SIM_HZ);
    expect(sim.tank).toBe(0);
    expect(sim.powerups.live).toBe(0);
  });
});

describe('weapon pickups (SPEC 9)', () => {
  it('a weapon box is caught by touch', () => {
    const sim = createSim(FAR, 1, LONE);
    const scratch = createScratch();
    spawnDrop(sim, DROP_MINIGUN, sim.shooter.x, 100);
    while (sim.minigun === 0 && sim.tick < 5 * SIM_HZ) run(sim, FAR, scratch, 1);
    expect(sim.minigun).toBeGreaterThan(MINIGUN_PICKUP_SECONDS - 0.1);
    expect(sim.clones).toBe(0);
  });

  it('a panel on a rail can carry a weapon', () => {
    const map = mapFromRows([rowWith({ 0: 'G1-P7' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    run(sim, map, scratch, 1, { targetDelta: RAIL_LEFT_X - sim.shooter.x, keyDir: 0 });
    while (gatesOf(sim).length > 0 && sim.tick < 10 * SIM_HZ) run(sim, map, scratch, 1);
    expect(sim.rocketMode).toBeGreaterThan(0);
    expect(sim.clones).toBe(0);
  });
});

describe('punches (SPEC 7.3, A33)', () => {
  const BOSS = mapFromRows([rowWith({ 2: 'E5-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
  const boss = (sim: SimState) => rats(sim).find((e) => e.type === 5)!;

  it('a big rat winds up for half a second, then kills the cats nearest its fist', () => {
    const sim = createSim(BOSS, 1, { startClones: 60 });
    const scratch = createScratch();
    while (!boss(sim).winding && sim.tick < 30 * SIM_HZ) run(sim, BOSS, scratch, 1);
    expect(sim.clones).toBe(60);
    const start = sim.tick;
    while (sim.clones === 60 && sim.tick < start + 2 * SIM_HZ) run(sim, BOSS, scratch, 1);
    expect((sim.tick - start) / SIM_HZ).toBeCloseTo(SMASH_INTERVAL, 1);
    expect(sim.clones).toBe(60 - PUNCH_KILLS[5]);
    expect(boss(sim).punches).toBe(1);

    const fx = sim.fx.items.filter((f) => f.active);
    expect(fx.filter((f) => f.kind === FX_PUNCH)).toHaveLength(1);
    const dead = fx.filter((f) => f.kind === FX_CAT);
    expect(dead).toHaveLength(PUNCH_KILLS[5]);
    // The boss comes down the lane, so the cats it kills are the ones at the front of the swarm.
    expect(dead.reduce((sum, f) => sum + f.y, 0) / dead.length).toBeLessThan(SHOOTER_Y);
    // No cat at the rear of the formation was touched.
    expect(Math.max(...dead.map((f) => f.y))).toBeLessThan(cloneY(3) + 2);

    const second = sim.tick;
    while (sim.clones === 45 && sim.tick < second + 2 * SIM_HZ) run(sim, BOSS, scratch, 1);
    expect((sim.tick - second) / SIM_HZ).toBeCloseTo(SMASH_INTERVAL, 1);
    expect(sim.clones).toBe(60 - 2 * PUNCH_KILLS[5]);
  });

  it('a punch that finds too few clones takes the shooter as well', () => {
    const sim = createSim(BOSS, 1, { startClones: 3 });
    const scratch = createScratch();
    while (sim.phase === 'playing' && sim.tick < 30 * SIM_HZ) run(sim, BOSS, scratch, 1);
    expect(sim.phase).toBe('lost');
    expect(sim.lossReason).toBe('swarm');
    expect(sim.clones).toBe(0);
  });

  it('a swarm that gets clear during the wind-up is not hit', () => {
    const map = mapFromRows([rowWith({ 14: 'E4-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, { startClones: 6 });
    const scratch = createScratch();
    const fat = () => rats(sim).find((e) => e.type === 4)!;
    while (!fat().winding && sim.tick < 30 * SIM_HZ) run(sim, map, scratch, 1);
    const rat = fat();
    // Run for the right rail.
    run(sim, map, scratch, 1, { targetDelta: 34, keyDir: 0 });
    run(sim, map, scratch, SIM_HZ);
    expect(sim.clones).toBe(6);
    expect(rat.punches).toBe(0);
    expect(rat.winding).toBe(false);
  });

  it('the charger runs at the swarm once it is close (E6)', () => {
    const map = mapFromRows([rowWith({ 2: 'E6-100000' }), ...gap(600), rowWith({ 0: 'E1' })]);
    const sim = createSim(map, 1, LONE);
    const scratch = createScratch();
    const charger = () => rats(sim).find((e) => e.type === 6)!;
    const gapToSwarm = () => SHOOTER_Y - (charger().y + charger().h / 2);
    run(sim, map, scratch, 2);
    expect(charger().y - charger().prevY).toBeCloseTo(MARCH_SPEED * SIM_DT, 6);
    while (gapToSwarm() > E6_CHARGE_RANGE - 4 && sim.tick < 10 * SIM_HZ) run(sim, map, scratch, 1);
    expect(charger().y - charger().prevY).toBeCloseTo(E6_CHARGE_SPEED_SPEC * SPEED_SCALE * SIM_DT, 6);
  });
});

describe('music (A33)', () => {
  it('the 44 maps go round the eleven tracks; track 0 is kept for the menus', () => {
    expect(musicTrackFor('1')).toBe(1);
    expect(musicTrackFor('2')).toBe(2);
    expect(musicTrackFor('11')).toBe(11);
    expect(musicTrackFor('12')).toBe(1);
    expect(musicTrackFor('34')).toBe(1);
    expect(musicTrackFor('44')).toBe(11);
    for (let n = 1; n <= 44; n++) {
      expect(musicTrackFor(String(n))).toBeGreaterThanOrEqual(1);
      expect(musicTrackFor(String(n))).toBeLessThanOrEqual(11);
    }
    expect(musicTrackFor('0')).toBe(1);
    expect(musicTrackFor('custom-abc')).toBe(1);
  });
});

describe('saved progress (A34)', () => {
  function fakeStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }

  it('starts with map 1 open and opens the next map after each win', () => {
    const store = fakeStore();
    const save = new Save(store);
    expect(save.unlocked()).toBe(1);
    save.complete(1);
    expect(save.unlocked()).toBe(2);
    // Winning an old map again changes nothing.
    save.complete(1);
    expect(save.unlocked()).toBe(2);
    expect(new Save(store).unlocked()).toBe(2);
  });

  it('remembers the volumes, and clearing progress keeps them', () => {
    const store = fakeStore();
    const save = new Save(store);
    save.setMusic(0.2);
    save.setSfx(0.9);
    save.complete(5);
    save.clearProgress();
    const again = new Save(store);
    expect(again.unlocked()).toBe(1);
    expect(again.music).toBeCloseTo(0.2, 6);
    expect(again.sfx).toBeCloseTo(0.9, 6);
  });

  it('the last map finishes the game and stays open', () => {
    const save = new Save(fakeStore());
    save.complete(44);
    expect(save.finished).toBe(true);
    expect(save.unlocked()).toBe(44);
  });

  it('survives a damaged save and a browser without storage', () => {
    const store = fakeStore();
    store.data.set('free-wars:v1', '{not json');
    expect(new Save(store).unlocked()).toBe(1);
    store.data.set('free-wars:v1', '{"unlocked":999,"music":7,"sfx":"loud"}');
    const save = new Save(store);
    expect(save.unlocked()).toBe(44);
    expect(save.music).toBe(1);
    expect(save.sfx).toBeGreaterThan(0);
    const none = new Save(null);
    none.complete(3);
    expect(none.unlocked()).toBe(4);
  });

  it('in-memory progress behaves the same way', () => {
    const progress = memoryProgress();
    expect(progress.unlocked()).toBe(1);
    progress.complete(1);
    expect(progress.unlocked()).toBe(2);
  });
});
