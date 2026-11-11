import { type Application, Container, Sprite, TilingSprite } from 'pixi.js';
import {
  BARRIER_TILE_GU,
  BARRIER_WALL_GU,
  COLS,
  PARALLAX_FAR,
  PARALLAX_NEAR,
  SCENERY_FAR_GU,
  SCENERY_NEAR_GU,
  SHOOTER_DRAW_SIZE,
  SHOOTER_ROWS_ABOVE_BASE,
  TILE_REPEAT_GU,
  UNIT_ANCHOR_Y,
  WINDOW_ROWS,
} from '../game/constants';
import type { GameView, RenderFrame } from '../game/Game';
import { HUD } from '../game/HUD';
import type { CoreTextures } from './textures';

/**
 * Scene graph (PLAN section 4):
 *   scenery   parallax layers, screen space
 *   mapLayer  lane, barriers, base line; slides horizontally. 1 unit = 1 gu.
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
  private readonly baseline: TilingSprite;
  private readonly swarmLayer = new Container();
  private readonly heroRing: Sprite;
  private readonly shooter: Sprite;
  private readonly hud: HUD;

  private width = 1;
  private cell = 1;

  constructor(
    private readonly app: Application,
    tex: CoreTextures,
  ) {
    this.far = new TilingSprite({ texture: tex.sceneryFar });
    this.near = new TilingSprite({ texture: tex.sceneryNear });

    this.lane = new TilingSprite({ texture: tex.lane });
    this.wallLeft = new TilingSprite({ texture: tex.barrier });
    this.wallRight = new TilingSprite({ texture: tex.barrier });
    this.wallRight.scale.x = -1;
    this.baseline = new TilingSprite({ texture: tex.baseline });
    this.mapLayer.addChild(this.lane, this.wallLeft, this.wallRight, this.baseline);

    this.heroRing = new Sprite(tex.sprites.hero_ring);
    this.heroRing.anchor.set(0.5);
    this.shooter = new Sprite(tex.sprites.cat_black);
    this.shooter.anchor.set(0.5, UNIT_ANCHOR_Y);
    this.swarmLayer.addChild(this.heroRing, this.shooter);

    this.hud = new HUD(tex.sprites.cat_black);

    app.stage.addChild(this.far, this.near, this.mapLayer, this.swarmLayer, this.hud.root);
    app.renderer.on('resize', () => this.layout());
    this.layout();
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

    // Rows on screen, and the lane row at the top edge of the screen (<= 0).
    const rowsVisible = h / cell;
    const topRow = WINDOW_ROWS - rowsVisible;
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

    this.baseline.position.set(0, WINDOW_ROWS - 1);
    this.baseline.width = COLS;
    this.baseline.height = 1;
    this.baseline.tileScale.set(TILE_REPEAT_GU / this.baseline.texture.width);

    const shooterY = h - SHOOTER_ROWS_ABOVE_BASE * cell;
    this.shooter.position.set(w / 2, shooterY);
    this.heroRing.position.set(w / 2, shooterY + 0.55 * cell);
    this.heroRing.scale.set((SHOOTER_DRAW_SIZE * 1.5 * cell) / this.heroRing.texture.width);

    this.hud.resize(w, h);
  }

  render(frame: RenderFrame): void {
    const { shooter } = frame.sim;
    const cell = this.cell;
    const x = shooter.prevX + (shooter.x - shooter.prevX) * frame.alpha;

    // The shooter stays at screen centre; everything else slides under it (D2).
    this.mapLayer.x = this.width / 2 - x * cell;
    const slide = (x - COLS / 2) * cell;
    this.far.tilePosition.x = this.width / 2 - slide * PARALLAX_FAR;
    this.near.tilePosition.x = this.width / 2 - slide * PARALLAX_NEAR;

    // Idle bob, and a lean into the direction of travel.
    const size = (SHOOTER_DRAW_SIZE * cell) / this.shooter.texture.width;
    const bob = 1 + 0.035 * Math.sin(frame.timeMs / 130);
    this.shooter.scale.set(size * (2 - bob), size * bob);
    this.shooter.rotation = Math.max(-0.3, Math.min(0.3, shooter.v * 0.012));
    this.heroRing.alpha = 0.75 + 0.25 * Math.sin(frame.timeMs / 300);

    this.hud.update(frame);
  }
}
