import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  Fog,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cloneY, SLOT_X } from '../game/Clone';
import {
  BIG_DRAW_SCALE,
  BIG_HEIGHT_SCALE,
  CAMERA_AHEAD,
  CAMERA_BACK,
  CAMERA_HEIGHT,
  CAMERA_MIN_FOV,
  CLONE_BOX_AMOUNTS,
  CLONE_CAP,
  COLS,
  ENEMY_STATS,
  ENEMY_TYPE_COUNT,
  FIRE_RATE,
  GATE_TYPE,
  GATE_WIDTH,
  MARCH_SPEED,
  MAX_RENDER_RESOLUTION,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_PARTICLES,
  POOL_POWERUPS,
  POWERUP_WIDTH,
  PREVIEW_ROWS,
  SHADOW_MAP_SIZE,
  SHOOTER_DRAW_SCALE,
  SHOOTER_HALF_WIDTH,
  SHOOTER_Y,
  SIM_DT,
  UNIT_DRAW_SCALE,
  VIEW_COLS,
  WINDOW_ROWS,
} from '../game/constants';
import { FX_BASE, FX_CAT, FX_HIT, FX_KILL, FX_PICKUP } from '../game/Fx';
import type { GameView, RenderFrame } from '../game/Game';
import { HUD } from '../game/HUD';
import { getLayout } from '../game/layout';
import { cellSpec } from '../parsers/tokens';
import {
  blobGeometry,
  bulletGeometry,
  CAT_BLACK,
  CAT_WHITE,
  catGeometry,
  glowGeometry,
  ratGeometry,
} from './models';

// Lane coordinates map straight onto the 3D world: sim x is world x, sim y is
// world z (0 = top of the window, 44 = goal line), and world y is up.

/** Segments round a solid: crowd units are drawn by the thousand, big enemies only a few at a time. */
const CROWD_DETAIL = 7;
const BIG_DETAIL = 22;
const HERO_DETAIL = 18;
/** Instances kept for each big enemy type. */
const BIG_CAPACITY = 24;
/** Width of the big-enemy model at scale 1, so a footprint of w cells is filled. */
const BIG_MODEL_WIDTH = 1.22;
const LANE_FAR = -90;
const LANE_NEAR = WINDOW_ROWS + 9;
const WALL_WIDTH = 1.6;
const SKY = 0x0d1029;

/** Hop height of the marching animation, sampled per unit. */
const HOP = Array.from({ length: 16 }, (_, i) => Math.max(0, Math.sin((i / 16) * Math.PI * 2)));

/** Small seeded generator so the backdrop is the same on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One instanced mesh with a fixed number of slots, filled from scratch every
 * frame. Instances are only ever scaled and moved, never rotated, so the
 * matrix is written directly. Nothing is allocated per frame.
 */
class Batch {
  readonly mesh: InstancedMesh;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array | null;
  private readonly capacity: number;
  private count = 0;

  constructor(geometry: BufferGeometry, material: Material | Material[], capacity: number, tinted = false) {
    this.capacity = capacity;
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.matrices.fill(0);
    if (tinted) {
      this.colors = new Float32Array(capacity * 3).fill(1);
      this.mesh.instanceColor = new InstancedBufferAttribute(this.colors, 3);
      this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    } else {
      this.colors = null;
    }
  }

  begin(): void {
    this.count = 0;
  }

  /** Adds an instance. Returns false when every slot is taken. */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number): boolean {
    if (this.count >= this.capacity) return false;
    const o = this.count * 16;
    const m = this.matrices;
    m[o] = sx;
    m[o + 5] = sy;
    m[o + 10] = sz;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    m[o + 15] = 1;
    if (this.colors) {
      const c = this.count * 3;
      this.colors[c] = 1;
      this.colors[c + 1] = 1;
      this.colors[c + 2] = 1;
    }
    this.count++;
    return true;
  }

  /** Colours the instance added last. Only for batches created with `tinted`. */
  tint(r: number, g: number, b: number): void {
    if (!this.colors || this.count === 0) return;
    const c = (this.count - 1) * 3;
    this.colors[c] = r;
    this.colors[c + 1] = g;
    this.colors[c + 2] = b;
  }

  end(): void {
    const { mesh } = this;
    mesh.count = this.count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, this.count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

function laneTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#414c80';
  g.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      g.fillStyle = (i + j) % 2 === 0 ? '#566199' : '#4e5991';
      g.beginPath();
      g.roundRect(i * 128 + 3, j * 128 + 3, 122, 122, 14);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(COLS / 4, (LANE_NEAR - LANE_FAR) / 4);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A label such as "+10" for the faces of a box or a gate, twice as wide as it is tall. */
function labelTexture(text: string, background: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = background;
  g.fillRect(0, 0, 256, 128);
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.strokeRect(6, 6, 244, 116);
  g.font = '900 76px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = '#1b1736';
  g.strokeText(text, 128, 70);
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Face and side colours of the four clone boxes, then of a gate whose reward is a surprise. */
const BOX_COLORS: readonly [string, number][] = [
  ['#2fb85c', 0x1f8a43],
  ['#1fa7b8', 0x157887],
  ['#8a5cf0', 0x6238c4],
  ['#f2a000', 0xbf7a00],
  ['#e0448f', 0xa82566],
];
const MYSTERY = 4;
/** Which label a gate carries: its clone box, or a question mark for anything else. */
const gateLabel = (drop: number): number => (drop >= 1 && drop <= 4 ? drop - 1 : MYSTERY);

/**
 * The 3D view (decision A20). A perspective camera looks down the lane from
 * behind the swarm. The swarm stays at the horizontal centre of the screen:
 * the camera follows the shooter, so the map slides under it (D2).
 */
export class Renderer3D implements GameView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_MIN_FOV, 1, 1, 420);
  private readonly hud: HUD;

  /** Indexed by enemy type 1..8. */
  private readonly rats: Batch[] = [];
  private readonly clones: Batch;
  private readonly hero: Batch;
  private readonly blobs: Batch;
  private readonly bulletCores: Batch;
  private readonly bulletGlows: Batch;
  private readonly boxes: Batch[] = [];
  private readonly gates: Batch[] = [];
  private readonly fx: Batch;
  private readonly heroRing: Mesh;

  private pxPerGu = 1;
  private readonly probe = new Vector3();

  constructor(private readonly host: HTMLElement) {
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = new Color(SKY);
    this.scene.fog = new Fog(SKY, 100, 185);
    this.buildLights();
    this.buildLane();
    this.buildBackdrop();

    // --- units ---
    // Cats and big enemies use physically based materials, lit by the sun, the sky fill
    // and the environment map. The rat crowd, drawn by the thousand, uses the cheaper
    // Lambert model: on integrated graphics that doubles the frame rate of a full lane.
    const crowd = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
    const cats = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, side: DoubleSide });
    const smooth = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.04 });
    const metal = new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.7 });

    this.rats.push(new Batch(new BoxGeometry(), crowd, 1));
    for (let type = 1; type <= ENEMY_TYPE_COUNT; type++) {
      const big = type > 3;
      const batch = new Batch(
        ratGeometry(type, big ? BIG_DETAIL : CROWD_DETAIL),
        big ? (type === 8 ? metal : smooth) : crowd,
        big ? BIG_CAPACITY : POOL_ENEMIES + PREVIEW_ROWS * COLS,
        true,
      );
      batch.mesh.castShadow = big;
      this.rats.push(batch);
      this.scene.add(batch.mesh);
    }

    this.clones = new Batch(catGeometry(CAT_WHITE, CROWD_DETAIL), cats, CLONE_CAP);
    this.hero = new Batch(catGeometry(CAT_BLACK, HERO_DETAIL), smooth, 1);
    this.hero.mesh.castShadow = true;
    this.scene.add(this.clones.mesh, this.hero.mesh);

    this.blobs = new Batch(
      blobGeometry(),
      new MeshBasicMaterial({ color: 0x070818, transparent: true, opacity: 0.36, depthWrite: false }),
      POOL_ENEMIES + PREVIEW_ROWS * COLS + CLONE_CAP + 1,
    );
    this.blobs.mesh.renderOrder = 1;
    this.scene.add(this.blobs.mesh);

    this.heroRing = new Mesh(
      new PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    this.heroRing.position.set(0, 0.05, SHOOTER_Y);
    this.heroRing.renderOrder = 2;
    this.scene.add(this.heroRing);

    // --- projectiles, boxes, effects ---
    this.bulletCores = new Batch(bulletGeometry(0.075, 0.75), new MeshBasicMaterial({ color: 0xfff7c9 }), POOL_BULLETS);
    this.bulletGlows = new Batch(
      bulletGeometry(0.2, 1.0),
      new MeshBasicMaterial({
        color: 0xffb300,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      POOL_BULLETS,
    );
    this.bulletGlows.mesh.renderOrder = 3;
    this.scene.add(this.bulletCores.mesh, this.bulletGlows.mesh);

    // Boxes and gates are as wide as the side strips (A27). A gate is an upright panel,
    // leaning back so its label faces the camera; a box is the crate it drops.
    const crate = new BoxGeometry(POWERUP_WIDTH - 0.5, 1.5, 1.7).translate(0, 0.9, 0);
    const panel = new BoxGeometry(GATE_WIDTH - 0.25, 2.1, 0.5).rotateX(-0.6).translate(0, 1.0, 0);
    BOX_COLORS.forEach(([face, sideColor], i) => {
      const side = new MeshLambertMaterial({ color: sideColor });
      const text = i === MYSTERY ? '?' : `+${CLONE_BOX_AMOUNTS[i]}`;
      const label = new MeshLambertMaterial({ map: labelTexture(text, face) });
      // Box faces: +x, -x, +y, -y, +z, -z.
      const gate = new Batch(panel, [side, side, side, side, label, side], POOL_POWERUPS, true);
      gate.mesh.castShadow = true;
      this.gates.push(gate);
      this.scene.add(gate.mesh);
      if (i === MYSTERY) return;
      // On a box the label shows on top and towards the camera.
      const box = new Batch(crate, [side, side, label, side, label, side], POOL_POWERUPS);
      box.mesh.castShadow = true;
      this.boxes.push(box);
      this.scene.add(box.mesh);
    });

    this.fx = new Batch(
      glowGeometry(),
      new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }),
      POOL_PARTICLES,
      true,
    );
    this.fx.mesh.renderOrder = 4;
    this.scene.add(this.fx.mesh);

    this.hud = new HUD(host);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  cellPx(): number {
    return this.pxPerGu;
  }

  private buildLights(): void {
    // Image-based lighting from a generated studio room: soft fill and highlights
    // on every physically based material, with no texture file to ship.
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    this.scene.add(new HemisphereLight(0xe6ecff, 0x2f3570, 0.75));
    const sun = new DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(COLS / 2 - 36, 58, 78);
    sun.target.position.set(COLS / 2, 0, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const s = sun.shadow.camera;
    s.left = -38;
    s.right = 38;
    s.top = 52;
    s.bottom = -34;
    s.near = 1;
    s.far = 190;
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
  }

  private buildLane(): void {
    const length = LANE_NEAR - LANE_FAR;
    const centreZ = (LANE_NEAR + LANE_FAR) / 2;
    const side = new MeshLambertMaterial({ color: 0x252d5c });
    const top = new MeshLambertMaterial({ map: laneTexture() });
    const lane = new Mesh(new BoxGeometry(COLS, 4, length), [side, side, top, side, side, side]);
    lane.position.set(COLS / 2, -2, centreZ);
    lane.receiveShadow = true;
    this.scene.add(lane);

    // Raised walls with lamp posts along both edges.
    const wallMaterial = new MeshLambertMaterial({ color: 0x2ec4b0 });
    const posts: [number, number][] = [];
    for (const x of [-WALL_WIDTH / 2, COLS + WALL_WIDTH / 2]) {
      const wall = new Mesh(new BoxGeometry(WALL_WIDTH, 1.7, length), wallMaterial);
      wall.position.set(x, 0.35, centreZ);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      for (let z = LANE_FAR + 3; z <= LANE_NEAR; z += 6) posts.push([x, z]);
    }
    const postBatch = new Batch(new BoxGeometry(2, 2.8, 1), new MeshLambertMaterial({ color: 0x178f84 }), posts.length);
    const lampBatch = new Batch(new SphereGeometry(0.36, 10, 8), new MeshBasicMaterial({ color: 0xfff1a8 }), posts.length);
    for (const [x, z] of posts) {
      postBatch.add(x, 0.7, z, 1, 1, 1);
      lampBatch.add(x, 2.3, z, 1, 1, 1);
    }
    postBatch.end();
    lampBatch.end();
    postBatch.mesh.castShadow = true;
    this.scene.add(postBatch.mesh, lampBatch.mesh);

    // Goal line: the first enemy to cross it loses the level.
    const goal = new Mesh(new BoxGeometry(COLS, 0.08, 0.6), new MeshBasicMaterial({ color: 0xffd166 }));
    goal.position.set(COLS / 2, 0.04, WINDOW_ROWS);
    const home = new Mesh(
      new PlaneGeometry(COLS, LANE_NEAR - WINDOW_ROWS).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    home.position.set(COLS / 2, 0.03, (WINDOW_ROWS + LANE_NEAR) / 2);
    // Top of the window: bullets expire here and enemies beyond it cannot be hit yet (B3).
    const range = new Mesh(
      new PlaneGeometry(COLS, 0.25).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    range.position.set(COLS / 2, 0.03, 0);
    this.scene.add(goal, home, range);
  }

  /** D16: scenery outside the barriers. A night city far below gives real parallax as the map slides. */
  private buildBackdrop(): void {
    const random = seeded(2026);
    const count = 320;
    const towers = new Batch(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), count, true);
    const lights = new Batch(
      new BoxGeometry(1, 0.3, 1),
      new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }),
      count * 3,
      true,
    );
    const roofs = [
      [0.16, 0.2, 0.46],
      [0.2, 0.25, 0.55],
      [0.13, 0.17, 0.4],
      [0.24, 0.22, 0.52],
    ];
    const glows = [
      [1.0, 0.82, 0.4],
      [0.48, 0.87, 0.95],
      [1.0, 0.5, 0.72],
    ];
    for (let i = 0; i < count; i++) {
      const x = -190 + random() * 424;
      const z = -230 + random() * 360;
      const w = 9 + random() * 16;
      const d = 9 + random() * 16;
      const topY = -30 - random() * 46;
      const height = 70;
      towers.add(x, topY - height / 2, z, w, height, d);
      const roof = roofs[Math.floor(random() * roofs.length)];
      towers.tint(roof[0], roof[1], roof[2]);
      for (let k = 0; k < 3; k++) {
        const glow = glows[Math.floor(random() * glows.length)];
        const size = 1 + random() * 2.2;
        lights.add(x + (random() - 0.5) * (w - 3), topY + 0.2, z + (random() - 0.5) * (d - 3), size, 1, size);
        const power = 0.35 + random() * 0.5;
        lights.tint(glow[0] * power, glow[1] * power, glow[2] * power);
      }
    }
    towers.end();
    lights.end();
    this.scene.add(towers.mesh, lights.mesh);
  }

  /**
   * Fits the camera to the screen. On a portrait screen VIEW_COLS columns span
   * the width at the shooter's depth, which gives units the size they have in
   * crowd-battle games; a wide screen keeps the same vertical framing and
   * simply shows more to the sides.
   */
  private layout(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h);

    const aspect = w / h;
    const distance = Math.hypot(CAMERA_HEIGHT, CAMERA_BACK);
    const halfWidth = VIEW_COLS / 2 / distance;
    const fov = (2 * Math.atan(halfWidth / aspect) * 180) / Math.PI;
    this.camera.fov = Math.max(CAMERA_MIN_FOV, fov);
    this.camera.aspect = aspect;
    this.camera.position.set(COLS / 2, CAMERA_HEIGHT, SHOOTER_Y + CAMERA_BACK);
    this.camera.lookAt(COLS / 2, 0, SHOOTER_Y - CAMERA_AHEAD);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // Screen pixels per grid unit at the shooter: converts drag distance to lane distance.
    const a = this.probe.set(COLS / 2, 0, SHOOTER_Y).project(this.camera).x;
    const b = this.probe.set(COLS / 2 + 1, 0, SHOOTER_Y).project(this.camera).x;
    this.pxPerGu = Math.max(1, ((b - a) * w) / 2);

    this.hud.resize(w, h);
  }

  render(frame: RenderFrame): void {
    const { sim, alpha } = frame;
    const { shooter } = sim;
    const time = frame.timeMs / 1000;
    const x = shooter.prevX + (shooter.x - shooter.prevX) * alpha;

    // The camera only ever moves sideways, so its orientation never changes.
    this.camera.position.x = x;

    this.blobs.begin();
    this.drawSwarm(frame, x, time);
    this.drawEnemies(frame, time);
    this.blobs.end();
    this.drawBullets(frame);
    this.drawBoxes(frame, time);
    this.drawFx(frame);

    this.renderer.render(this.scene, this.camera);
    this.hud.update(frame);
  }

  private drawSwarm(frame: RenderFrame, x: number, time: number): void {
    const { sim } = frame;
    const min = SHOOTER_HALF_WIDTH;
    const max = COLS - SHOOTER_HALF_WIDTH;

    // The shooter recoils a little with each shot.
    const sinceShot = 1 / FIRE_RATE - sim.shooter.fireCooldown;
    const kick = sim.tick > 0 && sinceShot < 0.1 ? 1 - sinceShot / 0.1 : 0;
    const bob = 1 + 0.03 * Math.sin(time * 7);
    const s = SHOOTER_DRAW_SCALE;
    this.hero.begin();
    this.hero.add(x, 0, SHOOTER_Y + 0.12 * kick, s, s * bob, s);
    this.hero.end();
    this.blobs.add(x + 0.15, 0.02, SHOOTER_Y + 0.12, s, 1, s);
    this.heroRing.position.x = x;
    (this.heroRing.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(time * 3.2);

    const u = UNIT_DRAW_SCALE;
    this.clones.begin();
    for (let slot = 0; slot < sim.clones; slot++) {
      const raw = x + SLOT_X[slot];
      const cx = raw < min ? min : raw > max ? max : raw;
      const cz = cloneY(slot);
      const wobble = 1 + 0.035 * Math.sin(time * 8 + slot * 1.7);
      this.clones.add(cx, 0, cz, u, u * wobble, u);
      this.blobs.add(cx + 0.12, 0.02, cz + 0.1, u, 1, u);
    }
    this.clones.end();
  }

  private drawEnemies(frame: RenderFrame, time: number): void {
    const { sim, map, alpha } = frame;
    const { items, high } = sim.enemies;
    const u = UNIT_DRAW_SCALE;
    const clock = Math.floor(time * 14);
    for (let type = 1; type <= ENEMY_TYPE_COUNT; type++) this.rats[type].begin();
    for (const gate of this.gates) gate.begin();

    // Rows that have not spawned yet, visible beyond the top of the window
    // (decision A9). Drawn straight from the grid, a little darker.
    if (sim.nextRow < sim.totalRows) {
      const scroll = sim.scroll - MARCH_SPEED * SIM_DT * (1 - alpha);
      const last = Math.min(sim.totalRows - 1, sim.nextRow + PREVIEW_ROWS - 1);
      const layout = getLayout(map, sim.seed);
      for (let r = sim.nextRow; r <= last; r++) {
        const front = scroll - r;
        for (let c = 0; c < COLS; c++) {
          const type = layout.type[r * COLS + c];
          if (type === 0) continue;
          if (type === GATE_TYPE) {
            const spec = cellSpec(map, map.cells[r * COLS + layout.source[r * COLS + c]]);
            const gate = this.gates[gateLabel(spec.drop)];
            gate.add(c + GATE_WIDTH / 2, 0, front - 0.5, 1, 1, 1);
            gate.tint(0.62, 0.62, 0.7);
            continue;
          }
          if (type <= 3) {
            const hop = HOP[(clock + r * 5 + c * 3) & 15];
            this.rats[type].add(c + 0.5, 0.14 * hop * u, front - 0.5, u, u * (1 + 0.05 * hop), u);
            this.rats[type].tint(0.62, 0.62, 0.7);
            this.blobs.add(c + 0.62, 0.02, front - 0.4, u, 1, u);
          } else {
            const stats = ENEMY_STATS[type];
            const size = (stats.w * BIG_DRAW_SCALE) / BIG_MODEL_WIDTH;
            this.rats[type].add(c + stats.w / 2, 0, front - stats.h / 2, size, size * BIG_HEIGHT_SCALE, size);
            this.rats[type].tint(0.62, 0.62, 0.7);
          }
        }
      }
    }

    for (let i = 0; i < high; i++) {
      const e = items[i];
      if (!e.active) continue;
      const ex = e.prevX + (e.x - e.prevX) * alpha;
      const ez = e.prevY + (e.y - e.prevY) * alpha;
      if (e.type === GATE_TYPE) {
        const gate = this.gates[gateLabel(e.drop)];
        gate.add(ex, 0, ez, 1, 1, 1);
        if (e.flash > 0) gate.tint(1.5, 1.5, 1.5);
        continue;
      }
      const batch = this.rats[e.type];
      if (e.type <= 3) {
        const hop = HOP[(clock + e.row * 5 + Math.floor(e.x) * 3) & 15];
        batch.add(ex, 0.14 * hop * u, ez, u, u * (1 + 0.05 * hop), u);
        this.blobs.add(ex + 0.12, 0.02, ez + 0.1, u, 1, u);
      } else {
        // Big enemies stomp: a slow squash and stretch.
        const stomp = Math.sin(time * 5 + e.row);
        const size = (e.w * BIG_DRAW_SCALE) / BIG_MODEL_WIDTH;
        batch.add(ex, 0, ez, size * (1 + 0.02 * stomp), size * BIG_HEIGHT_SCALE * (1 - 0.03 * stomp), size);
      }
      if (e.flash > 0) batch.tint(1.9, 0.75, 0.75);
    }

    for (let type = 1; type <= ENEMY_TYPE_COUNT; type++) this.rats[type].end();
    for (const gate of this.gates) gate.end();
  }

  private drawBullets(frame: RenderFrame): void {
    const { items, high } = frame.sim.bullets;
    this.bulletCores.begin();
    this.bulletGlows.begin();
    for (let i = 0; i < high; i++) {
      const b = items[i];
      if (!b.active) continue;
      const z = b.prevY + (b.y - b.prevY) * frame.alpha;
      this.bulletCores.add(b.x, 1.0, z, 1, 1, 1);
      this.bulletGlows.add(b.x, 1.0, z, 1, 1, 1);
    }
    this.bulletCores.end();
    this.bulletGlows.end();
  }

  private drawBoxes(frame: RenderFrame, time: number): void {
    const { items, high } = frame.sim.powerups;
    for (const batch of this.boxes) batch.begin();
    for (let i = 0; i < high; i++) {
      const p = items[i];
      if (!p.active) continue;
      const batch = this.boxes[p.kind - 1];
      if (!batch) continue;
      const z = p.prevY + (p.y - p.prevY) * frame.alpha;
      const pulse = 1 + 0.06 * Math.sin(time * 6 + i);
      batch.add(p.x, 0.25 + 0.2 * Math.sin(time * 4 + i), z, pulse, pulse, pulse);
    }
    for (const batch of this.boxes) batch.end();
  }

  private drawFx(frame: RenderFrame): void {
    const { items, high } = frame.sim.fx;
    const fx = this.fx;
    fx.begin();
    for (let i = 0; i < high; i++) {
      const f = items[i];
      if (!f.active) continue;
      const t = Math.min(1, f.age / f.life);
      const fade = 1 - t;
      switch (f.kind) {
        case FX_HIT:
          fx.add(f.x, 1.0, f.y, 0.9 - 0.4 * t, 0.9 - 0.4 * t, 0.9 - 0.4 * t);
          fx.tint(1.0 * fade, 0.85 * fade, 0.35 * fade);
          break;
        case FX_KILL: {
          const size = Math.min(f.size, 6) * (0.8 + 0.9 * t);
          fx.add(f.x, 0.8, f.y, size, size * 0.8, size);
          fx.tint(0.34 * fade, 0.3 * fade, 0.24 * fade);
          break;
        }
        case FX_BASE: {
          const size = f.size * (1.5 + 3 * t);
          fx.add(f.x, 0.6, f.y, size, size * 0.5, size);
          fx.tint(1.0 * fade, 0.3 * fade, 0.15 * fade);
          break;
        }
        case FX_CAT: {
          const size = 1.2 + 1.3 * t;
          fx.add(f.x, 0.9, f.y, size, size, size);
          fx.tint(0.2 * fade, 0.36 * fade, 0.7 * fade);
          break;
        }
        case FX_PICKUP: {
          const size = 2.2 + 3.2 * t;
          fx.add(f.x, 1.0 + 2.5 * t, f.y, size, size * 0.5, size);
          fx.tint(0.12 * fade, 0.42 * fade, 0.18 * fade);
          break;
        }
        default:
          break;
      }
    }
    fx.end();
  }
}

/** Soft golden ring drawn on the lane under the shooter. */
function ringTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const glow = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  glow.addColorStop(0, 'rgba(255,209,102,0)');
  glow.addColorStop(0.62, 'rgba(255,209,102,0.5)');
  glow.addColorStop(1, 'rgba(255,209,102,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff1bf';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
