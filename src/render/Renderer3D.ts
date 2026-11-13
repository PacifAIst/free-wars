import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
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
import type { Sfx } from '../game/Audio';
import { cloneY, ringsFor, SLOT_X } from '../game/Clone';
import {
  BIG_DRAW_SCALE,
  BIG_HEIGHT_SCALE,
  CAMERA_BACK,
  CAMERA_GOAL_MARGIN,
  CAMERA_HEIGHT,
  CAMERA_MIN_FOV,
  CLONE_BOX_AMOUNTS,
  CLONE_CAP,
  CLONE_EASE,
  CLONE_EASE_RING_LAG,
  CLONE_FIRE_RATE_FACTOR,
  COLS,
  ENEMY_STATS,
  ENEMY_TYPE_COUNT,
  FIRE_RATE,
  GATE_TYPE,
  GATE_WIDTH,
  MARCH_SPEED,
  MAX_RENDER_RESOLUTION,
  MUZZLE_OFFSET,
  POOL_BULLETS,
  POOL_ENEMIES,
  POOL_POWERUPS,
  POWERUP_WIDTH,
  PREVIEW_ROWS,
  RAIL_LEFT_X,
  RAIL_RIGHT_X,
  RAIL_WIDTH,
  SHADOW_MAP_SIZE,
  SHOOTER_DRAW_SCALE,
  SHOOTER_Y,
  SIM_DT,
  UNIT_DRAW_SCALE,
  VIEW_COLS,
  WINDOW_ROWS,
} from '../game/constants';
import { FX_BASE, FX_CAT, FX_GATE, FX_HIT, FX_KILL, FX_PICKUP } from '../game/Fx';
import type { GameView, RenderFrame } from '../game/Game';
import { HUD } from '../game/HUD';
import { getLayout } from '../game/layout';
import { SHOOTER_MAX_X, SHOOTER_MIN_X } from '../game/Player';
import { cellSpec } from '../parsers/tokens';
import type { GameState, SimState } from '../types';
import { Batch } from './Batch';
import { blobGeometry, bulletGeometry, CAT_BLACK, CAT_WHITE, catGeometry, ratGeometry } from './models';
import { Sparks } from './Sparks';

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
const LANE_FAR = -110;
const LANE_NEAR = WINDOW_ROWS + 12;
const SKY = 0x0d1029;
const CLONE_FIRE_PERIOD = 1 / (FIRE_RATE * CLONE_FIRE_RATE_FACTOR);

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

function canvas2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d') as CanvasRenderingContext2D];
}

function tiled(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Paving of the lane: one tile covers 4 by 4 cells. */
function laneTexture(): CanvasTexture {
  const [canvas, g] = canvas2d(256, 256);
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
  return tiled(canvas, COLS / 4, (LANE_NEAR - LANE_FAR) / 4);
}

/** Track bed of a rail: two steel rails on dark sleepers. One tile is the rail's width by 4 cells. */
function railTexture(): CanvasTexture {
  const [canvas, g] = canvas2d(256, 128);
  g.fillStyle = '#20264d';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#2d3566';
  for (let j = 0; j < 2; j++) g.fillRect(14, j * 64 + 12, 228, 40);
  for (const x of [56, 190]) {
    g.fillStyle = '#8f9bc4';
    g.fillRect(x, 0, 12, 128);
    g.fillStyle = '#d3dbf5';
    g.fillRect(x + 3, 0, 3, 128);
  }
  return tiled(canvas, 1, (LANE_NEAR - LANE_FAR) / 4);
}

/** A label such as "+10" for the faces of a box or a gate, twice as wide as it is tall. */
function labelTexture(text: string, background: string): CanvasTexture {
  const [canvas, g] = canvas2d(256, 128);
  g.fillStyle = background;
  g.fillRect(0, 0, 256, 128);
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.strokeRect(7, 7, 242, 114);
  g.font = '900 84px "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#1b1736';
  g.strokeText(text, 128, 70);
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 70);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Soft golden ring drawn on the lane under the shooter. */
function ringTexture(): CanvasTexture {
  const [canvas, g] = canvas2d(128, 128);
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

/** Face colour, side colour and glow colour of the four clone rewards, then of a surprise. */
const REWARD_COLORS: readonly [string, number, readonly [number, number, number]][] = [
  ['#2fb85c', 0x1f8a43, [0.3, 1.0, 0.45]],
  ['#1fa7b8', 0x157887, [0.25, 0.9, 1.0]],
  ['#8a5cf0', 0x6238c4, [0.7, 0.5, 1.0]],
  ['#f2a000', 0xbf7a00, [1.0, 0.75, 0.2]],
  ['#e0448f', 0xa82566, [1.0, 0.4, 0.7]],
];
const MYSTERY = 4;
/** Which label a gate carries: its clone reward, or a question mark for anything else. */
const gateLabel = (drop: number): number => (drop >= 1 && drop <= 4 ? drop - 1 : MYSTERY);
/** Which colour set suits a reward of `clones` clones. */
const rewardIndex = (clones: number): number => Math.max(0, CLONE_BOX_AMOUNTS.indexOf(clones));

/**
 * The 3D view (decisions A20 and A29). A perspective camera looks down the lane
 * from high above and behind the swarm, so the whole lane and both rails are in
 * view. The swarm stays at the horizontal centre of the screen: the camera
 * follows the shooter, so the map slides under it (D2).
 *
 * Besides drawing, the renderer turns game events into what the player
 * notices: particles, floating numbers, camera shake and sound.
 */
export class Renderer3D implements GameView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_MIN_FOV, 1, 4, 900);
  private readonly hud: HUD;
  private readonly sparks = new Sparks();

  /** Indexed by enemy type 1..8. */
  private readonly rats: Batch[] = [];
  private readonly clones: Batch;
  private readonly hero: Batch;
  private readonly blobs: Batch;
  private readonly bulletCores: Batch;
  private readonly bulletGlows: Batch;
  private readonly boxes: Batch[] = [];
  private readonly gates: Batch[] = [];
  private readonly heroRing: Mesh;

  private width = 1;
  private height = 1;
  private pxPerGu = 1;
  private readonly probe = new Vector3();

  // Where each clone is drawn. It eases towards its place in the formation,
  // so the swarm flows instead of moving as one rigid block.
  private readonly cloneX = new Float32Array(CLONE_CAP);
  private readonly cloneZ = new Float32Array(CLONE_CAP);
  /** Time each clone joined, for its pop-in. */
  private readonly cloneBorn = new Float32Array(CLONE_CAP);
  private cloneCount = 0;

  // What the renderer has already reacted to.
  private lastSim: SimState | null = null;
  private lastFxId = 0;
  private lastShots = 0;
  private lastState: GameState = 'BOOT';
  private lastTime = 0;
  private shake = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly sfx: Sfx,
  ) {
    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_RESOLUTION));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene.background = new Color(SKY);
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
      new PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    this.heroRing.position.set(0, 0.06, SHOOTER_Y);
    this.heroRing.renderOrder = 2;
    this.scene.add(this.heroRing);

    // --- projectiles ---
    this.bulletCores = new Batch(bulletGeometry(0.085, 0.9), new MeshBasicMaterial({ color: 0xfff7c9 }), POOL_BULLETS);
    this.bulletGlows = new Batch(
      bulletGeometry(0.26, 1.7),
      new MeshBasicMaterial({
        color: 0xffa200,
        transparent: true,
        opacity: 0.55,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      POOL_BULLETS,
    );
    this.bulletGlows.mesh.renderOrder = 3;
    this.scene.add(this.bulletCores.mesh, this.bulletGlows.mesh);

    // --- gates and boxes ---
    // A gate is an upright panel as wide as its rail, leaning back so its label
    // faces the camera. A box is the crate a fat rat drops.
    const panel = new BoxGeometry(GATE_WIDTH - 0.7, 3.0, 0.7).rotateX(-0.62).translate(0, 1.35, 0);
    const crate = new BoxGeometry(POWERUP_WIDTH - 1.2, 2.2, 2.6).translate(0, 1.3, 0);
    REWARD_COLORS.forEach(([face, sideColor], i) => {
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

    this.scene.add(this.sparks.puff.mesh, this.sparks.glow.mesh);

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

    this.scene.add(new HemisphereLight(0xe6ecff, 0x2f3570, 0.8));
    const sun = new DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(COLS / 2 - 46, 90, WINDOW_ROWS / 2 + 70);
    sun.target.position.set(COLS / 2, 0, WINDOW_ROWS / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    // The shadow camera is fitted to the lane and its rails, the only place shadows fall.
    const s = sun.shadow.camera;
    s.left = -46;
    s.right = 46;
    s.top = 74;
    s.bottom = -66;
    s.near = 1;
    s.far = 320;
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.06;
    this.scene.add(sun, sun.target);
  }

  private buildLane(): void {
    const length = LANE_NEAR - LANE_FAR;
    const centreZ = (LANE_NEAR + LANE_FAR) / 2;
    const side = new MeshLambertMaterial({ color: 0x252d5c });

    const lane = new Mesh(new BoxGeometry(COLS, 4, length), [
      side,
      side,
      new MeshLambertMaterial({ map: laneTexture() }),
      side,
      side,
      side,
    ]);
    lane.position.set(COLS / 2, -2, centreZ);
    lane.receiveShadow = true;
    this.scene.add(lane);

    // A rail on each side of the lane: only gates travel there (A29).
    const railTop = new MeshLambertMaterial({ map: railTexture() });
    const kerbMaterial = new MeshLambertMaterial({ color: 0x2ec4b0 });
    const wallMaterial = new MeshLambertMaterial({ color: 0x24a596 });
    const posts: [number, number][] = [];
    for (const [centre, inner, outer] of [
      [RAIL_LEFT_X, 0, -RAIL_WIDTH],
      [RAIL_RIGHT_X, COLS, COLS + RAIL_WIDTH],
    ]) {
      const rail = new Mesh(new BoxGeometry(RAIL_WIDTH, 4, length), [side, side, railTop, side, side, side]);
      rail.position.set(centre, -2.25, centreZ);
      rail.receiveShadow = true;
      // A low kerb divides lane and rail; the swarm steps over it, rats never do.
      const kerb = new Mesh(new BoxGeometry(0.7, 0.5, length), kerbMaterial);
      kerb.position.set(inner, 0.05, centreZ);
      kerb.castShadow = true;
      kerb.receiveShadow = true;
      const out = outer < 0 ? outer - 0.6 : outer + 0.6;
      const wall = new Mesh(new BoxGeometry(1.2, 1.8, length), wallMaterial);
      wall.position.set(out, 0.4, centreZ);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(rail, kerb, wall);
      for (let z = LANE_FAR + 3; z <= LANE_NEAR; z += 8) posts.push([out, z]);
    }
    const postBatch = new Batch(new BoxGeometry(1.7, 3.2, 1.1), new MeshLambertMaterial({ color: 0x178f84 }), posts.length);
    const lampBatch = new Batch(new SphereGeometry(0.45, 10, 8), new MeshBasicMaterial({ color: 0xfff1a8 }), posts.length);
    for (const [x, z] of posts) {
      postBatch.add(x, 0.8, z, 1, 1, 1);
      lampBatch.add(x, 2.7, z, 1, 1, 1);
    }
    postBatch.end();
    lampBatch.end();
    postBatch.mesh.castShadow = true;
    this.scene.add(postBatch.mesh, lampBatch.mesh);

    // Goal line: the first rat to cross it loses the level.
    const goal = new Mesh(new BoxGeometry(COLS, 0.1, 0.8), new MeshBasicMaterial({ color: 0xffd166 }));
    goal.position.set(COLS / 2, 0.05, WINDOW_ROWS);
    const home = new Mesh(
      new PlaneGeometry(COLS, LANE_NEAR - WINDOW_ROWS).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    home.position.set(COLS / 2, 0.03, (WINDOW_ROWS + LANE_NEAR) / 2);
    // Top of the window: bullets expire here and enemies beyond it cannot be hit yet (B3).
    const range = new Mesh(
      new PlaneGeometry(COLS + 2 * RAIL_WIDTH, 0.3).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    range.position.set(COLS / 2, 0.03, 0);
    this.scene.add(goal, home, range);
  }

  /** D16: scenery outside the barriers. A night city far below gives real parallax as the map slides. */
  private buildBackdrop(): void {
    const random = seeded(2026);
    const count = 380;
    const towers = new Batch(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), count, true);
    const lights = new Batch(
      new BoxGeometry(1, 0.3, 1),
      new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }),
      count * 3,
      true,
    );
    const roofs = [
      [0.07, 0.09, 0.22],
      [0.09, 0.11, 0.27],
      [0.06, 0.08, 0.19],
      [0.1, 0.09, 0.25],
    ];
    const glows = [
      [1.0, 0.82, 0.4],
      [0.48, 0.87, 0.95],
      [1.0, 0.5, 0.72],
    ];
    for (let i = 0; i < count; i++) {
      const x = -260 + random() * 564;
      const z = -330 + random() * 560;
      const w = 10 + random() * 18;
      const d = 10 + random() * 18;
      const topY = -70 - random() * 70;
      const height = 120;
      towers.add(x, topY - height / 2, z, w, height, d);
      const roof = roofs[Math.floor(random() * roofs.length)];
      towers.tint(roof[0], roof[1], roof[2]);
      for (let k = 0; k < 3; k++) {
        const glow = glows[Math.floor(random() * glows.length)];
        const size = 1.2 + random() * 2.6;
        lights.add(x + (random() - 0.5) * (w - 3), topY + 0.2, z + (random() - 0.5) * (d - 3), size, 1, size);
        const power = 0.25 + random() * 0.4;
        lights.tint(glow[0] * power, glow[1] * power, glow[2] * power);
      }
    }
    towers.end();
    lights.end();
    this.scene.add(towers.mesh, lights.mesh);
  }

  /**
   * Fits the camera to the screen. On a portrait screen VIEW_COLS columns span
   * the width at the shooter's depth: the whole lane and both rails. The
   * camera is then tilted until the goal line sits just above the bottom edge,
   * so the rest of the screen shows the lane ahead. A wide screen keeps the
   * same framing and simply shows more to the sides.
   */
  private layout(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);

    const { camera } = this;
    const aspect = w / h;
    const distance = Math.hypot(CAMERA_HEIGHT, CAMERA_BACK);
    const fov = (2 * Math.atan(VIEW_COLS / 2 / distance / aspect) * 180) / Math.PI;
    camera.fov = Math.max(CAMERA_MIN_FOV, fov);
    camera.aspect = aspect;
    camera.position.set(COLS / 2, CAMERA_HEIGHT, SHOOTER_Y + CAMERA_BACK);
    camera.updateProjectionMatrix();

    // Aim further up the lane until the point just below the goal line reaches the bottom edge.
    let near = 0;
    let far = 200;
    for (let i = 0; i < 24; i++) {
      const ahead = (near + far) / 2;
      camera.lookAt(COLS / 2, 0, SHOOTER_Y - ahead);
      camera.updateMatrixWorld();
      const y = this.probe.set(COLS / 2, 0, WINDOW_ROWS + CAMERA_GOAL_MARGIN).project(camera).y;
      if (y > -1) near = ahead;
      else far = ahead;
    }
    camera.lookAt(COLS / 2, 0, SHOOTER_Y - near);
    camera.updateMatrixWorld();
    this.sparks.face(camera);
    this.scene.fog = new Fog(SKY, distance * 1.25, distance * 2.6);

    // Screen pixels per grid unit at the shooter: converts drag distance to lane distance.
    const a = this.probe.set(COLS / 2, 0, SHOOTER_Y).project(camera).x;
    const b = this.probe.set(COLS / 2 + 1, 0, SHOOTER_Y).project(camera).x;
    this.pxPerGu = Math.max(1, ((b - a) * w) / 2);

    this.hud.resize(w, h);
  }

  render(frame: RenderFrame): void {
    const { sim, alpha } = frame;
    const { shooter } = sim;
    const time = frame.timeMs / 1000;
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const x = shooter.prevX + (shooter.x - shooter.prevX) * alpha;

    if (sim !== this.lastSim) {
      // A new level: forget what belonged to the old one.
      this.lastSim = sim;
      this.lastFxId = 0;
      this.lastShots = 0;
      this.cloneCount = 0;
      this.sparks.clear();
    }
    this.react(frame, time);

    // The camera only ever moves sideways, so its direction never changes.
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const jolt = this.shake * this.shake;
    this.camera.position.x = x + (Math.random() - 0.5) * jolt * 1.6;
    this.camera.position.y = CAMERA_HEIGHT + (Math.random() - 0.5) * jolt * 1.6;

    this.blobs.begin();
    this.drawSwarm(frame, x, time, dt);
    this.drawEnemies(frame, time);
    this.blobs.end();
    this.drawBullets(frame);
    this.drawBoxes(frame, time);
    this.sparks.update(dt);

    this.renderer.render(this.scene, this.camera);
    this.hud.update(frame);
  }

  /** Shows a floating number above a point on the lane. */
  private popup(text: string, x: number, z: number, color: string): void {
    const p = this.probe.set(x, 2.5, z).project(this.camera);
    this.hud.popup(text, ((p.x + 1) / 2) * this.width, ((1 - p.y) / 2) * this.height, color);
  }

  /** Turns what happened in the simulation since the last frame into particles, numbers, shake and sound. */
  private react(frame: RenderFrame, time: number): void {
    const { sim, state } = frame;
    const { sparks, sfx } = this;

    if (state !== this.lastState) {
      if (state === 'WIN') sfx.win();
      else if (state === 'LOSE') sfx.lose();
      else if (state === 'PLAYING' || state === 'PAUSED' || state === 'LEVEL_SELECT') sfx.tap();
      this.lastState = state;
    }

    if (sim.shots > this.lastShots) {
      // A big swarm fires softly, so the volley does not drown everything else.
      sfx.shot(1 / Math.sqrt(1 + sim.clones * 0.12));
      this.lastShots = sim.shots;
    }

    const { items, high } = sim.fx;
    let newest = this.lastFxId;
    for (let i = 0; i < high; i++) {
      const f = items[i];
      if (!f.active || f.id <= this.lastFxId) continue;
      if (f.id > newest) newest = f.id;
      const { x, y: z } = f;
      switch (f.kind) {
        case FX_HIT:
          sparks.burst(0, 3, x, 1.0, z, 5, 4, 0.22, 0.7, 0.15, 1.0, 0.85, 0.35, 14);
          if (x < 0 || x > COLS) sfx.gateHit();
          else sfx.hit();
          break;
        case FX_KILL: {
          const big = f.size >= 8;
          const n = big ? 34 : 5;
          const reach = big ? f.size * 0.9 : 3.2;
          sparks.burst(1, n, x, 0.7, z, reach, big ? 9 : 3.5, big ? 0.9 : 0.42, 0.75, big ? 3.4 : 1.5, 0.62, 0.57, 0.5, 5);
          sparks.burst(0, big ? 26 : 3, x, 0.9, z, reach * 1.6, big ? 12 : 5, big ? 0.7 : 0.3, 0.6, 0.1, 1.0, 0.6, 0.25, 16);
          if (big) {
            sparks.emit(0, x, 3, z, 0, 0, 0, 0.3, f.size * 1.4, f.size * 2.6, 1.0, 0.8, 0.5);
            this.shake = Math.max(this.shake, 0.9);
          }
          sfx.kill();
          break;
        }
        case FX_BASE:
          sparks.burst(0, 30, x, 0.8, z, 14, 9, 0.6, 1.4, 0.3, 1.0, 0.3, 0.15, 12);
          sparks.emit(0, x, 1, z, 0, 0, 0, 0.45, 4, 16, 1.0, 0.25, 0.12);
          this.shake = 1;
          sfx.breach();
          break;
        case FX_CAT:
          sparks.burst(1, 5, x, 0.8, z, 3, 4, 0.4, 0.7, 1.3, 0.92, 0.95, 1.0, 6);
          sparks.burst(0, 4, x, 1.0, z, 5, 5, 0.3, 0.6, 0.1, 0.4, 0.7, 1.0, 14);
          this.shake = Math.max(this.shake, 0.3);
          sfx.catLost();
          break;
        case FX_PICKUP: {
          const [face, , glow] = REWARD_COLORS[rewardIndex(f.size)];
          sparks.burst(0, 22, x, 1.2, z, 7, 11, 0.7, 0.9, 0.15, glow[0], glow[1], glow[2], 8);
          sparks.emit(0, x, 1.5, z, 0, 0, 0, 0.3, 3, 9, glow[0], glow[1], glow[2]);
          this.popup(`+${f.size}`, x, z, face);
          sfx.pickup(f.size);
          break;
        }
        case FX_GATE: {
          const [face, , glow] = REWARD_COLORS[rewardIndex(f.size)];
          // The panel shatters: shards fly out, dust rises, and a flash marks the spot.
          sparks.burst(0, 46, x, 1.6, z, 13, 14, 0.75, 1.1, 0.2, glow[0], glow[1], glow[2], 22);
          sparks.burst(1, 12, x, 1.0, z, 5, 5, 0.6, 1.2, 2.6, 0.8, 0.8, 0.9, 4);
          sparks.emit(0, x, 2, z, 0, 0, 0, 0.32, 5, 15, glow[0], glow[1], glow[2]);
          this.popup(`+${f.size}`, x, z, face);
          this.shake = Math.max(this.shake, 0.55);
          sfx.gateBreak(f.size);
          break;
        }
        default:
          break;
      }
    }
    this.lastFxId = newest;

    // Clones that have just joined pop in from the shooter.
    if (sim.clones > this.cloneCount) {
      for (let slot = this.cloneCount; slot < sim.clones; slot++) {
        this.cloneX[slot] = sim.shooter.x;
        this.cloneZ[slot] = SHOOTER_Y;
        this.cloneBorn[slot] = time + (slot - this.cloneCount) * 0.012;
      }
    }
    this.cloneCount = sim.clones;
  }

  private drawSwarm(frame: RenderFrame, x: number, time: number, dt: number): void {
    const { sim } = frame;
    const playing = frame.state === 'PLAYING';

    // The shooter recoils a little with each shot.
    const sinceShot = 1 / FIRE_RATE - sim.shooter.fireCooldown;
    const kick = sim.tick > 0 && sinceShot < 0.1 ? 1 - sinceShot / 0.1 : 0;
    const bob = 1 + 0.03 * Math.sin(time * 7);
    const s = SHOOTER_DRAW_SCALE;
    this.hero.begin();
    this.hero.add(x, 0, SHOOTER_Y + 0.14 * kick, s, s * bob, s);
    this.hero.end();
    this.blobs.add(x + 0.15, 0.02, SHOOTER_Y + 0.12, s, 1, s);
    this.heroRing.position.x = x;
    (this.heroRing.material as MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(time * 3.2);
    if (playing && kick > 0) {
      this.sparks.flash(x + 0.5, 1.2, SHOOTER_Y - MUZZLE_OFFSET - 1.1, 1.2 + 1.6 * kick, kick, 0.8 * kick, 0.3 * kick);
    }

    const u = UNIT_DRAW_SCALE;
    const cooldowns = sim.cloneCooldowns;
    this.clones.begin();
    for (let slot = 0; slot < sim.clones; slot++) {
      const raw = x + SLOT_X[slot];
      const tx = raw < SHOOTER_MIN_X ? SHOOTER_MIN_X : raw > SHOOTER_MAX_X ? SHOOTER_MAX_X : raw;
      const tz = cloneY(slot);
      // Ease towards the slot; clones in the outer rings trail a little, so the swarm flows.
      const rate = Math.max(4, CLONE_EASE - ringsFor(slot + 1) * CLONE_EASE_RING_LAG);
      const k = 1 - Math.exp(-rate * dt);
      const dx = tx - this.cloneX[slot];
      const dz = tz - this.cloneZ[slot];
      this.cloneX[slot] += dx * k;
      this.cloneZ[slot] += dz * k;
      const cx = this.cloneX[slot];
      const cz = this.cloneZ[slot];

      // Pop in, then trot: a clone hops while it is catching up with its place.
      const age = time - this.cloneBorn[slot];
      let grow = 1;
      if (age <= 0) grow = 0.01;
      else if (age < 0.28) {
        const t = age / 0.28;
        grow = t * (2 - t) + 0.3 * Math.sin(t * Math.PI);
      }
      const hurry = Math.min(1, Math.hypot(dx, dz) * 1.4);
      const hop = hurry * Math.abs(Math.sin(time * 13 + slot * 1.9)) * 0.28;
      const wobble = 1 + 0.035 * Math.sin(time * 8 + slot * 1.7);
      const size = u * grow;
      this.clones.add(cx, hop, cz, size, size * wobble, size);
      this.blobs.add(cx + 0.12, 0.02, cz + 0.1, size, 1, size);

      const sinceCloneShot = CLONE_FIRE_PERIOD - cooldowns[slot];
      if (playing && sinceCloneShot < 0.07) {
        const f = 1 - sinceCloneShot / 0.07;
        this.sparks.flash(cx + 0.42, 1.0, cz - MUZZLE_OFFSET - 0.8, 0.8 + 1.1 * f, f, 0.8 * f, 0.3 * f);
      }
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
      const gateDepth = ENEMY_STATS[GATE_TYPE].h;
      for (let r = sim.nextRow; r <= last; r++) {
        const front = scroll - r;
        for (let side = 0; side < 2; side++) {
          const token = side === 0 ? layout.gateLeft[r] : layout.gateRight[r];
          if (token === 0) continue;
          const gate = this.gates[gateLabel(cellSpec(map, map.cells[r * COLS + token - 1]).drop)];
          gate.add(side === 0 ? RAIL_LEFT_X : RAIL_RIGHT_X, 0, front - gateDepth / 2, 1, 1, 1);
          gate.tint(0.62, 0.62, 0.7);
        }
        for (let c = 0; c < COLS; c++) {
          const type = layout.type[r * COLS + c];
          if (type === 0) continue;
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
        // A hit makes the panel jump and flash.
        const jump = e.flash > 0 ? 1.08 : 1;
        gate.add(ex, 0, ez, jump, jump, 1);
        if (e.flash > 0) gate.tint(1.6, 1.6, 1.6);
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
      // The glow trails behind the bullet.
      this.bulletGlows.add(b.x, 1.0, z + 0.45, 1, 1, 1);
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
}
