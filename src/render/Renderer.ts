import { type Application, Container, Graphics, Sprite, type Texture, TilingSprite } from 'pixi.js';
import {
  BARRIER_TILE_GU,
  BARRIER_WALL_GU,
  COLS,
  ENEMY_STATS,
  FIRE_RATE,
  MARCH_SPEED,
  MINION_DRAW_SIZE,
  MUZZLE_OFFSET,
  PARALLAX_FAR,
  PARALLAX_NEAR,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  SCENERY_FAR_GU,
  SCENERY_NEAR_GU,
  SHOOTER_DRAW_SIZE,
  SHOOTER_ROWS_ABOVE_BASE,
  SIM_DT,
  TILE_REPEAT_GU,
  UNIT_ANCHOR_Y,
  WINDOW_ROWS,
} from '../game/constants';
import { FX_BASE, FX_HIT, FX_KILL } from '../game/Fx';
import type { GameView, RenderFrame } from '../game/Game';
import { HUD } from '../game/HUD';
import { BULLET_MINIGUN } from '../game/Projectile';
import { enemyTypeAt } from '../game/World';
import { ParticleSet } from './ParticleSet';
import type { BossTextures, CoreTextures } from './textures';

/** Sprites kept for E4 and the bosses, spawned or previewed. */
const BIG_SPRITES = 48;
/** Rows above the window that a tall portrait screen can show (D15). */
const MAX_PREVIEW_ROWS = 64;
/** Buckets of the painter's-order sort: three per gu from y = -34 upward. */
const SORT_BUCKETS = 256;
const SORT_ORIGIN = 34;
const SORT_PER_GU = 3;
/** Bigger enemies are drawn a little past their footprint so they read as bulky. */
const BIG_DRAW_SCALE = 1.08;
const HIT_TINT = 0xff8a8a;
const MUZZLE_FLASH_SECONDS = 0.07;

/** Squash-and-stretch table for the marching animation. */
const MARCH_WAVE = Array.from({ length: 16 }, (_, i) => Math.sin((i / 16) * Math.PI * 2));

/**
 * Scene graph (PLAN section 4):
 *   scenery   parallax layers, screen space
 *   mapLayer  lane, barriers, enemies, bullets, effects; slides horizontally. 1 unit = 1 gu.
 *   swarm     shooter, fixed at the horizontal centre of the screen
 *   hud       screen space
 */
export class Renderer implements GameView {
  private readonly far: TilingSprite;
  private readonly near: TilingSprite;
  private readonly mapLayer = new Container();
  private readonly lane: TilingSprite;
  private readonly wallLeft: TilingSprite;
  private readonly wallRight: TilingSprite;
  private readonly bigLayer = new Container();
  private readonly bigSprites: Sprite[] = [];
  /** Minions standing behind a big enemy, and all the others (D10: draw order is by row). */
  private readonly minionsBack: ParticleSet;
  private readonly minionsFront: ParticleSet;
  private readonly haze = new Graphics();
  private readonly baseline: TilingSprite;
  private readonly bullets: ParticleSet;
  private readonly fx: ParticleSet;
  private readonly swarmLayer = new Container();
  private readonly heroRing: Sprite;
  private readonly shooter: Sprite;
  private readonly muzzle: Sprite;
  private readonly hud: HUD;

  private readonly minionTextures: Texture[];
  private readonly bigTextures: Texture[];
  private readonly sortOrder = new Int32Array(POOL_ENEMIES);
  private readonly sortStart = new Int32Array(SORT_BUCKETS + 1);
  /** Left edge, right edge, top edge and front edge of each big enemy drawn this frame. */
  private readonly bigBoxes = new Float32Array(BIG_SPRITES * 4);
  private bigCount = 0;

  private width = 1;
  private cell = 1;
  /** Lane row at the top edge of the screen: 0 in landscape, negative in portrait. */
  private topRow = 0;

  constructor(
    private readonly app: Application,
    private readonly tex: CoreTextures,
  ) {
    const s = tex.sprites;
    this.minionTextures = [s.rat_e1, s.rat_e1, s.rat_e2, s.rat_e3];
    // Until the boss atlas arrives, bosses fall back to the E4 sprite.
    this.bigTextures = [s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4, s.rat_e4];

    this.far = new TilingSprite({ texture: tex.sceneryFar });
    this.near = new TilingSprite({ texture: tex.sceneryNear });

    this.lane = new TilingSprite({ texture: tex.lane });
    this.wallLeft = new TilingSprite({ texture: tex.barrier });
    this.wallRight = new TilingSprite({ texture: tex.barrier });
    this.wallRight.scale.x = -1;
    this.baseline = new TilingSprite({ texture: tex.baseline });

    this.bigLayer.sortableChildren = true;
    for (let i = 0; i < BIG_SPRITES; i++) {
      const sprite = new Sprite(s.rat_e4);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.bigSprites.push(sprite);
      this.bigLayer.addChild(sprite);
    }

    this.minionsBack = new ParticleSet(POOL_ENEMIES + MAX_PREVIEW_ROWS * COLS, s.rat_e1);
    this.minionsFront = new ParticleSet(POOL_ENEMIES, s.rat_e1);
    this.bullets = new ParticleSet(POOL_BULLETS, s.bullet);
    this.fx = new ParticleSet(POOL_PARTICLES, s.puff);

    this.mapLayer.addChild(
      this.lane,
      this.wallLeft,
      this.wallRight,
      this.minionsBack.container,
      this.bigLayer,
      this.minionsFront.container,
      this.haze,
      this.baseline,
      this.bullets.container,
      this.fx.container,
    );

    this.heroRing = new Sprite(s.hero_ring);
    this.heroRing.anchor.set(0.5);
    this.shooter = new Sprite(s.cat_black);
    this.shooter.anchor.set(0.5, UNIT_ANCHOR_Y);
    this.muzzle = new Sprite(s.spark);
    this.muzzle.anchor.set(0.5);
    this.muzzle.tint = 0xfff1a8;
    this.swarmLayer.addChild(this.heroRing, this.shooter, this.muzzle);

    this.hud = new HUD(s.cat_black);

    app.stage.addChild(this.far, this.near, this.mapLayer, this.swarmLayer, this.hud.root);
    app.renderer.on('resize', () => this.layout());
    this.layout();
  }

  /** Called when the boss atlas has loaded. */
  setBossTextures(bosses: BossTextures): void {
    this.bigTextures[5] = bosses.rat_e5;
    this.bigTextures[6] = bosses.rat_e6;
    this.bigTextures[7] = bosses.rat_e7;
    this.bigTextures[8] = bosses.rat_e8;
  }

  cellPx(): number {
    return this.cell;
  }

  /** D15: the 44-column lane fits the shorter screen side; extra rows show above. */
  private layout(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.width = w;
    const cell = Math.min(w, h) / COLS;
    this.cell = cell;

    const rowsVisible = h / cell;
    const topRow = WINDOW_ROWS - rowsVisible;
    this.topRow = topRow;
    // Tile phase so a tile boundary always sits on the base line.
    const phase = rowsVisible % TILE_REPEAT_GU;

    for (const layer of [this.far, this.near]) {
      layer.width = w;
      layer.height = h;
      layer.tilePosition.y = h;
    }
    this.far.tileScale.set((cell * SCENERY_FAR_GU) / this.far.texture.width);
    this.near.tileScale.set((cell * SCENERY_NEAR_GU) / this.near.texture.width);

    this.mapLayer.scale.set(cell);
    this.mapLayer.y = h - WINDOW_ROWS * cell;

    this.lane.position.set(0, topRow);
    this.lane.width = COLS;
    this.lane.height = rowsVisible;
    this.lane.tileScale.set(TILE_REPEAT_GU / this.lane.texture.height);
    this.lane.tilePosition.y = phase;

    for (const wall of [this.wallLeft, this.wallRight]) {
      wall.y = topRow;
      wall.width = BARRIER_TILE_GU;
      wall.height = rowsVisible;
      wall.tileScale.set(TILE_REPEAT_GU / wall.texture.height);
      wall.tilePosition.y = phase;
    }
    this.wallLeft.x = -BARRIER_WALL_GU;
    this.wallRight.x = COLS + BARRIER_WALL_GU;

    // Rows above the window are a look-ahead: visible, dimmed, not yet in play (B3).
    this.haze.clear();
    if (topRow < -0.01) {
      this.haze.rect(0, topRow, COLS, -topRow).fill({ color: 0x0f1330, alpha: 0.42 });
      this.haze.rect(0, -0.12, COLS, 0.12).fill({ color: 0xbfd0ff, alpha: 0.35 });
    }

    this.baseline.position.set(0, WINDOW_ROWS - 1);
    this.baseline.width = COLS;
    this.baseline.height = 1;
    this.baseline.tileScale.set(TILE_REPEAT_GU / this.baseline.texture.width);

    const shooterY = h - SHOOTER_ROWS_ABOVE_BASE * cell;
    this.shooter.position.set(w / 2, shooterY);
    this.heroRing.position.set(w / 2, shooterY + 0.55 * cell);
    this.heroRing.scale.set((SHOOTER_DRAW_SIZE * 1.5 * cell) / this.heroRing.texture.width);
    this.muzzle.position.set(w / 2, shooterY - (MUZZLE_OFFSET + 0.75) * cell);

    this.hud.resize(w, h);
  }

  render(frame: RenderFrame): void {
    const { sim, alpha } = frame;
    const { shooter } = sim;
    const cell = this.cell;
    const x = shooter.prevX + (shooter.x - shooter.prevX) * alpha;

    // The shooter stays at screen centre; everything else slides under it (D2).
    this.mapLayer.x = this.width / 2 - x * cell;
    const slide = (x - COLS / 2) * cell;
    this.far.tilePosition.x = this.width / 2 - slide * PARALLAX_FAR;
    this.near.tilePosition.x = this.width / 2 - slide * PARALLAX_NEAR;

    this.drawEnemies(frame);
    this.drawBullets(frame);
    this.drawFx(frame);

    // Idle bob, a lean into the direction of travel, and a flash at each shot.
    const size = (SHOOTER_DRAW_SIZE * cell) / this.shooter.texture.width;
    const bob = 1 + 0.035 * Math.sin(frame.timeMs / 130);
    this.shooter.scale.set(size * (2 - bob), size * bob);
    this.shooter.rotation = Math.max(-0.3, Math.min(0.3, shooter.v * 0.012));
    this.heroRing.alpha = 0.75 + 0.25 * Math.sin(frame.timeMs / 300);

    const sinceShot = 1 / FIRE_RATE - shooter.fireCooldown;
    const flash = sim.tick > 0 && sinceShot < MUZZLE_FLASH_SECONDS ? 1 - sinceShot / MUZZLE_FLASH_SECONDS : 0;
    this.muzzle.visible = flash > 0;
    this.muzzle.alpha = flash;
    this.muzzle.scale.set(((0.9 + 0.8 * flash) * cell) / this.muzzle.texture.width);

    this.hud.update(frame);
  }

  private drawEnemies(frame: RenderFrame): void {
    const { sim, map, alpha } = frame;
    const { items, high } = sim.enemies;
    const minionScale = MINION_DRAW_SIZE / this.minionTextures[1].width;
    const waveClock = Math.floor(frame.timeMs / 70);
    this.bigCount = 0;

    this.minionsBack.begin();
    this.minionsFront.begin();

    // 1. Rows that have not spawned yet, visible above the window on tall
    //    screens. Drawn straight from the grid, farthest row first.
    const scroll = sim.scroll - MARCH_SPEED * SIM_DT * (1 - alpha);
    if (this.topRow < -0.01 && sim.nextRow < sim.totalRows) {
      const lastVisible = Math.min(sim.totalRows - 1, Math.floor(scroll - this.topRow + 1), sim.nextRow + MAX_PREVIEW_ROWS - 1);
      for (let r = lastVisible; r >= sim.nextRow; r--) {
        const frontY = scroll - r;
        for (let c = 0; c < COLS; c++) {
          const type = enemyTypeAt(map, sim.seed, r, c);
          if (type === 0) continue;
          if (type <= 3) {
            const p = this.minionsBack.next();
            if (!p) break;
            p.texture = this.minionTextures[type];
            p.x = c + 0.5;
            p.y = frontY - 0.5;
            p.anchorY = UNIT_ANCHOR_Y;
            p.scaleX = minionScale;
            p.scaleY = minionScale;
            p.tint = 0xffffff;
          } else {
            const stats = ENEMY_STATS[type];
            const left = Math.min(c, COLS - stats.w);
            this.placeBig(type, left + stats.w / 2, frontY - stats.h / 2, stats.w, false);
          }
        }
      }
    }

    // 2. Spawned minions in painter's order (farthest first), by counting sort
    //    on y. Units are drawn larger than a cell, so the order matters.
    const start = this.sortStart;
    const order = this.sortOrder;
    start.fill(0);
    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active || e.type > 3) continue;
      start[this.sortBucket(e.y) + 1]++;
    }
    for (let b = 0; b < SORT_BUCKETS; b++) start[b + 1] += start[b];
    const total = start[SORT_BUCKETS];
    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active) continue;
      if (e.type > 3) {
        this.placeBig(e.type, e.x, e.prevY + (e.y - e.prevY) * alpha, e.w, e.flash > 0);
        continue;
      }
      order[start[this.sortBucket(e.y)]++] = i;
    }
    for (let n = 0; n < total; n++) {
      const e = items[order[n]];
      const p = this.isBehindBig(e.x, e.y) ? this.minionsBack.next() : this.minionsFront.next();
      if (!p) break;
      const wave = MARCH_WAVE[(waveClock + e.row * 5 + Math.floor(e.x) * 3) & 15];
      p.texture = this.minionTextures[e.type];
      p.x = e.x;
      p.y = e.prevY + (e.y - e.prevY) * alpha;
      p.anchorY = UNIT_ANCHOR_Y;
      p.scaleX = minionScale * (1 - 0.05 * wave);
      p.scaleY = minionScale * (1 + 0.07 * wave);
      p.tint = e.flash > 0 ? HIT_TINT : 0xffffff;
    }
    this.minionsBack.end();
    this.minionsFront.end();

    for (let i = this.bigCount; i < BIG_SPRITES; i++) this.bigSprites[i].visible = false;
  }

  /** True when a 1x1 enemy at (x, y) stands inside the footprint of a big enemy, behind its front edge. */
  private isBehindBig(x: number, y: number): boolean {
    const boxes = this.bigBoxes;
    for (let i = 0, n = this.bigCount * 4; i < n; i += 4) {
      if (x > boxes[i] && x < boxes[i + 1] && y > boxes[i + 2] && y + 0.5 < boxes[i + 3]) return true;
    }
    return false;
  }

  private sortBucket(y: number): number {
    const b = Math.floor((y + SORT_ORIGIN) * SORT_PER_GU);
    return b < 0 ? 0 : b >= SORT_BUCKETS ? SORT_BUCKETS - 1 : b;
  }

  private placeBig(type: number, x: number, y: number, size: number, flash: boolean): void {
    if (this.bigCount >= BIG_SPRITES) return;
    const slot = this.bigCount++;
    const boxes = this.bigBoxes;
    boxes[slot * 4] = x - size / 2;
    boxes[slot * 4 + 1] = x + size / 2;
    boxes[slot * 4 + 2] = y - size / 2;
    boxes[slot * 4 + 3] = y + size / 2;
    const sprite = this.bigSprites[slot];
    const texture = this.bigTextures[type];
    if (sprite.texture !== texture) sprite.texture = texture;
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.scale.set((size * BIG_DRAW_SCALE) / texture.width);
    sprite.tint = flash ? HIT_TINT : 0xffffff;
    // Nearer the base line draws on top.
    sprite.zIndex = y + size / 2;
  }

  private drawBullets(frame: RenderFrame): void {
    const { items, high } = frame.sim.bullets;
    const s = this.tex.sprites;
    const scale = 1.5 / s.bullet.height;
    this.bullets.begin();
    for (let i = 0; i < high; i++) {
      const b = items[i];
      if (!b.active) continue;
      const p = this.bullets.next();
      if (!p) break;
      p.texture = b.kind === BULLET_MINIGUN ? s.bullet_minigun : s.bullet;
      p.x = b.x;
      p.y = b.prevY + (b.y - b.prevY) * frame.alpha;
      p.scaleX = scale;
      p.scaleY = scale;
    }
    this.bullets.end();
  }

  private drawFx(frame: RenderFrame): void {
    const { items, high } = frame.sim.fx;
    const s = this.tex.sprites;
    this.fx.begin();
    for (let i = 0; i < high; i++) {
      const fx = items[i];
      if (!fx.active) continue;
      const p = this.fx.next();
      if (!p) break;
      const t = Math.min(1, fx.age / fx.life);
      let texture = s.puff;
      let size = fx.size;
      let tint = 0xffffff;
      let fade = 1 - t;
      if (fx.kind === FX_HIT) {
        texture = s.spark;
        size = 1.3 - 0.6 * t;
        tint = 0xfff1a8;
      } else if (fx.kind === FX_KILL) {
        size = fx.size * (1.0 + 1.1 * t);
        tint = 0xfff6e0;
        fade = (1 - t) * 0.9;
      } else if (fx.kind === FX_BASE) {
        texture = s.ring;
        size = fx.size * (1.0 + 2.2 * t);
        tint = 0xff8a5c;
      }
      p.texture = texture;
      p.x = fx.x;
      p.y = fx.y;
      p.scaleX = size / texture.width;
      p.scaleY = size / texture.width;
      p.tint = tint;
      p.alpha = fade;
    }
    this.fx.end();
  }
}
