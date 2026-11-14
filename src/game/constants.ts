/**
 * Every tunable in the game lives here (PLAN sections 2 and 3, SPEC sections 5-10).
 * Game logic must not contain numeric literals for balance: import them from
 * this file. Labels such as D1 or B4 refer to DESIGN_DECISIONS.md.
 *
 * Units: gu = one grid cell. Speeds are gu per second unless the name ends in
 * `_SPEC`, in which case the value is the raw number from SPEC.md and must be
 * multiplied by SPEED_SCALE.
 */

// --- Grid and window ---------------------------------------------------------

/** Lane width in columns. Fixed by the map format. */
export const COLS = 44;
/**
 * Size of everything, in grid cells per unit of the SPEC (decision A31). The
 * owner doubled the size of every enemy, item and cat: a minion now covers
 * 2 by 2 cells, so 22 of them fill a row of the lane.
 */
export const UNIT = 2;
/** A SPEC size in grid cells, never wider than the lane. */
const cells = (specSize: number): number => Math.min(COLS, specSize * UNIT);
/**
 * Rows of the lane that are in play: from the line where rows enter and bullets
 * expire, down to the goal line. The plan started with 44. The camera of
 * decision A29 and the doubled sizes of A31 show a much deeper stretch of lane
 * on a phone, so the play area is 150 rows (75 units) deep to fill the screen.
 */
export const WINDOW_ROWS = 150;

// --- Simulation loop (SPEC section 4) ----------------------------------------

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** RAF delta clamp, so a tab switch never causes a jump. */
export const MAX_FRAME_DELTA_MS = 100;
/** D15: render resolution is min(devicePixelRatio, this). */
export const MAX_RENDER_RESOLUTION = 2;

// --- D1: speeds ----------------------------------------------------------------

/**
 * Converts SPEC speed values to gu/s. Spec 10 -> 12 gu/s: a minion crosses the
 * 150 rows in play in 12.5 seconds. The plan started at 0.075; the owner
 * raised it in decisions A18 and A29, and doubled it in A31 and again in A33.
 */
export const SPEED_SCALE = 1.2;
/** Speed at which the row stream advances: the E1-E3 march speed. */
export const MARCH_SPEED_SPEC = 10;
export const MARCH_SPEED = MARCH_SPEED_SPEC * SPEED_SCALE;

// --- Enemy table (SPEC section 7) ----------------------------------------------

export interface EnemyStats {
  /** Footprint width and height in grid cells: the SPEC size times UNIT. */
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  /** Raw SPEC speed; multiply by SPEED_SCALE. */
  readonly speedSpec: number;
  /** True for E5-E8: numbered HP bar, instant loss at the base line (B1). */
  readonly boss: boolean;
}

/**
 * A33: the owner found the swarm overpowered against the big rats and asked for
 * four times their HP. It applies to every big enemy, E4 to E8.
 */
export const BIG_HP_FACTOR = 4;

/**
 * Speed of the panels on the rails, as a SPEC speed value. 10 is the march speed
 * of the minions, so a panel stays level with the row it was written in. A
 * larger value makes the panels run ahead of the rats.
 */
export const RAIL_ITEM_SPEED_SPEC = MARCH_SPEED_SPEC;

/** Indexed by enemy type 1..8. Index 0 is unused. */
export const ENEMY_STATS: readonly EnemyStats[] = [
  { w: 0, h: 0, hp: 0, speedSpec: 0, boss: false },
  { w: cells(1), h: cells(1), hp: 1, speedSpec: 10, boss: false }, // E1 minion
  { w: cells(1), h: cells(1), hp: 2, speedSpec: 10, boss: false }, // E2 sergeant
  { w: cells(1), h: cells(1), hp: 4, speedSpec: 10, boss: false }, // E3 elite
  { w: cells(8), h: cells(8), hp: 200 * BIG_HP_FACTOR, speedSpec: 8, boss: false }, // E4 sniper
  { w: cells(20), h: cells(20), hp: 2000 * BIG_HP_FACTOR, speedSpec: 10, boss: true }, // E5 boss
  { w: cells(20), h: cells(20), hp: 3000 * BIG_HP_FACTOR, speedSpec: 10, boss: true }, // E6 charger
  { w: cells(20), h: cells(20), hp: 4000 * BIG_HP_FACTOR, speedSpec: 5, boss: true }, // E7 boss sniper
  // E8 would be 60 cells wide at twice its SPEC size; it is as wide as the lane instead.
  { w: cells(30), h: cells(30), hp: 10000 * BIG_HP_FACTOR, speedSpec: 5, boss: true }, // E8 robo rat
  { w: cells(8), h: cells(2), hp: 1, speedSpec: RAIL_ITEM_SPEED_SPEC, boss: false }, // rail gate (GATE_TYPE)
];

export const ENEMY_TYPE_COUNT = 8;

/**
 * Pursuit (decision A19, switched off by A28). Every rat marches straight for
 * the goal line. The code can still steer enemies at the swarm: a value above
 * zero here turns it back on, for big enemies (E4-E8) or for minions.
 */
export const BIG_CHASE_SPEED = 0;
/** Fastest sideways speed of a minion, in gu/s. Zero makes minions hold their column. */
export const MINION_CHASE_SPEED = 0;
/** Enemies of this type and above count as big: they claim their footprint in the grid and plough through minions. */
export const BIG_ENEMY_MIN_TYPE = 4;

/**
 * Rails and gates (SPEC section 10, decisions A27, A29 and A31). A rail runs
 * along each side of the lane, outside its kerb. Only gates travel on it:
 * panels that march down with their row. The swarm collects a gate by touching
 * it and is rewarded at once. Cats may step onto a rail; rats never do. A gate
 * shares the enemy pool under this type number.
 */
export const GATE_TYPE = 9;
export const RAIL_WIDTH = 8 * UNIT;
/**
 * A31: gates are collected by touch, bullets fly through them and they hurt
 * nobody. With this switched on they behave as in A29 instead: they must be
 * shot until their resistance is used up, and an unbroken gate kills every cat
 * in its way. The owner will name the item that works like that later.
 */
export const GATES_ARE_SHOT = false;
/** A gate fills its rail from side to side. */
export const GATE_WIDTH = RAIL_WIDTH;
/** Lane coordinates of the centre line of the left and right rail. */
export const RAIL_LEFT_X = -RAIL_WIDTH / 2;
export const RAIL_RIGHT_X = COLS + RAIL_WIDTH / 2;
/**
 * Brick walls (A37). A map may put a wall across either rail. It stands still at
 * lane row WALL_Y from the start of the level and holds the panels that come
 * down its rail until shots have used up its HP.
 */
export const WALL_Y = 110;
export const WALL_DEPTH = 2 * UNIT;
/** Space left between the wall and the panels queued behind it. */
export const WALL_GAP = 0.4;
/** HP of a wall when the map editor places one. */
export const WALL_DEFAULT_HP = 150;
export const WALL_MAX_HP = 100000;
/** Maps that are dark unless they say otherwise: the boss maps. */
export const DARK_EVERY = 11;
/** Minions start to swing towards the swarm at this lane row and aim fully at it FUNNEL_END_ROWS above the shooter. */
export const FUNNEL_START_ROW = 6;
export const FUNNEL_END_ROWS = 5;

/**
 * Enemy collision (decision A21): enemies never pass through each other.
 * Minions keep at least this distance between centres, a little under one
 * cell so a packed row marches without jostling.
 */
export const MINION_SPACING = 0.94 * UNIT;
/** Share of an overlap that is corrected each tick. Below 1 keeps a dense crowd from jittering. */
export const SEPARATION_STIFFNESS = 0.7;
/** `ER` picks uniformly among the first N enemy types (E1-E3). */
export const RANDOM_MINION_TYPES = 3;

/**
 * Enemy rockets (SPEC 7.2, D6, D7). The fat rat and the two rocket bosses fire
 * a rocket straight down the lane at intervals. A rocket that reaches the swarm
 * kills every cat in a square of side `aoe` round it, the shooter included.
 * Shots that hit it wear its HP down; at 0 it bursts harmlessly.
 *
 * Speeds and HP are set for the present pace of the game: SPEC and D7 gave 50
 * and 200 HP and 3 cells a second, which at 12 cells a second of march would
 * make a rocket slower than the rat that fired it and impossible to shoot down.
 */
export interface EnemyRocketStats {
  /** Seconds between rockets. The first comes after half of it. */
  readonly interval: number;
  readonly hp: number;
  /** Cells per second. */
  readonly speed: number;
  /** Side of the square it clears. */
  readonly aoe: number;
}
/** Indexed by enemy type; null for the types that fire nothing. */
export const ENEMY_ROCKETS: readonly (EnemyRocketStats | null)[] = [
  null,
  null,
  null,
  null,
  { interval: 8, hp: 20, speed: 30, aoe: 8 * UNIT },
  null,
  null,
  { interval: 4, hp: 30, speed: 30, aoe: 20 * UNIT },
  { interval: 2, hp: 24, speed: 40, aoe: 20 * UNIT },
];
/** Half the width of an enemy rocket as a target for the swarm's shots. */
export const ENEMY_ROCKET_HALF_WIDTH = 2 * UNIT;

/**
 * Punches (SPEC 7.3, decision A33). A big rat whose body reaches the swarm winds
 * up for SMASH_INTERVAL seconds and then punches, again and again while the
 * swarm is in reach. Each punch kills this many cats, the ones nearest the
 * fist, by enemy type. SPEC gives 15 for E5 and 30 for E6; the fat rat and the
 * two rocket bosses punch too.
 */
export const SMASH_INTERVAL = 0.5;
export const PUNCH_KILLS: readonly number[] = [0, 0, 0, 0, 10, 15, 30, 15, 30];
/** E6 charges at this speed while its front is within this distance of the swarm. */
export const E6_CHARGE_RANGE = 12 * UNIT;
export const E6_CHARGE_SPEED_SPEC = 20;

// --- D4: row streaming ---------------------------------------------------------

/** At level start the front line is already this many rows below the window top. */
export const PRE_ADVANCE_ROWS = 100;

// --- Player (SPEC 5, 6, 8; D2, D3, D8) -----------------------------------------

/** Shooter height above the goal line, in gu. Leaves room for six clone rings below it. */
export const SHOOTER_ROWS_ABOVE_BASE = 7 * UNIT;
export const SHOOTER_Y = WINDOW_ROWS - SHOOTER_ROWS_ABOVE_BASE;
/** Half width of the shooter body; travel stops this far from each barrier. */
export const SHOOTER_HALF_WIDTH = 0.5 * UNIT;
export const SHOOTER_START_X = COLS / 2;

/** Base fire rate in shots per second. */
export const FIRE_RATE = 2;
/** Clones fire at this fraction of the base rate. */
export const CLONE_FIRE_RATE_FACTOR = 0.5;
export const CLONE_CAP = 100;
/** D8: ring k holds RING_SLOTS_PER_RING * k clones at radius RING_SPACING * k gu. */
export const RING_SLOTS_PER_RING = 6;
export const RING_SPACING = UNIT;

export const BULLET_SPEED = 80;
export const BULLET_DAMAGE = 1;
/** Bullets leave the muzzle this far above the shooter centre. */
export const MUZZLE_OFFSET = 0.6 * UNIT;
/**
 * A31: no two cats keep the same beat. Each shot is followed by a wait of the
 * normal interval times a random factor between 1 - jitter and 1 + jitter.
 */
export const SHOOTER_FIRE_JITTER = 0.2;
export const CLONE_FIRE_JITTER = 0.35;

// --- Weapons (SPEC 8 and 9). Sizes are SPEC cells times UNIT, like everything else. ---

// Minigun (SPEC 8.1)
export const MINIGUN_RATE_FACTOR = 2;
export const MINIGUN_PICKUP_SECONDS = 5;
export const MINIGUN_CAP_SECONDS = 30;

// Laser (SPEC 8, 8.1; B5)
export const LASER_CHARGE_SECONDS = 2;
/** A37: half the SPEC's 0.5 s. A beam swept with the mouse cleared too much of the lane. */
export const LASER_BEAM_SECONDS = 0.25;
export const LASER_COOLDOWN_SECONDS = 3;
export const LASER_TOTAL_SECONDS = 10;
export const LASER_WIDTH = 4 * UNIT;
/** B5: a cast kills E1-E3 outright and deals this much to E4-E8: a fifth of a fat rat's HP. */
export const LASER_BIG_DMG = 40 * BIG_HP_FACTOR;

// Rocket mode (SPEC 8; B6)
export const ROCKET_MODE_SECONDS = 10;
/** Rocket pickups stack up to this many seconds, like the minigun. */
export const ROCKET_CAP_SECONDS = 30;
export const ROCKET_DAMAGE = 3;
/** Side of the square a rocket's explosion covers. */
export const ROCKET_AOE = 4 * UNIT;
export const ROCKET_FIRE_RATE = 1;
export const ROCKET_SPEED = 60;
/** B6: only the shooter and the 6 inner-ring clones fire rockets. */
export const ROCKET_SHOOTERS = 7;

// Tank (SPEC 8, 9; D8)
export const TANK_SECONDS = 5;
/** Tank pickups stack up to this many seconds. */
export const TANK_CAP_SECONDS = 15;
export const TANK_BUBBLE_HP = 50;
/** Width and depth of the bubble the tank falls in. Only shots open it. */
export const TANK_BUBBLE_SIZE = 5 * UNIT;
/** The bubble drifts down with the army, slower than a box, so there is time to shoot it open. */
export const TANK_BUBBLE_SPEED = MARCH_SPEED;
export const TANK_SIZE = 8 * UNIT;
export const TANK_DAMAGE = 8;
/** A big enemy under the tank takes TANK_DAMAGE this often; minions die at once. */
export const TANK_CONTACT_INTERVAL = 0.25;
export const TANK_ROCKET_AOE = 8 * UNIT;
export const TANK_ROCKETS_PER_SEC = 2;

// --- Input (SPEC 5; D2) --------------------------------------------------------

export const SPRING_OMEGA = 12;
export const SPRING_ZETA = 0.9;
/** Keyboard pan speed in gu/s (arrow keys, A/D). */
export const KEY_PAN_SPEED = 26;
/** Seconds of release velocity carried into the target on pointer release. */
export const RELEASE_MOMENTUM_SECONDS = 0.12;
/** +1: the map follows the finger (SPEC 5). -1: the swarm follows the finger (the owner's choice, A28). */
export const DRAG_DIRECTION = -1;
/**
 * How far the swarm moves for a drag, as a share of the drag itself. The owner found
 * the swarm too quick under the mouse and asked for 44% less (A37).
 */
export const DRAG_SENSITIVITY = 0.56;

// --- D9: -P# drop codes --------------------------------------------------------

export const DROP_NONE = 0;
export const DROP_CLONE_1 = 1;
export const DROP_CLONE_3 = 2;
export const DROP_CLONE_10 = 3;
export const DROP_CLONE_50 = 4;
export const DROP_MINIGUN = 5;
export const DROP_LASER = 6;
export const DROP_ROCKET = 7;
export const DROP_TANK = 8;
/** A34: a bomb. Not a reward: it goes off when the swarm touches it. */
export const DROP_BOMB = 9;
export const DROP_CODE_MAX = 9;
/** Units a bomb kills. */
export const BOMB_KILLS = 18;
/**
 * Whose units the bomb kills. True: the cats nearest the bomb, which makes it a
 * trap to steer round. False: the rats nearest the goal line, which makes it a
 * prize. The owner wrote "kills 18 units"; this is how it was read.
 */
export const BOMB_HITS_CATS = true;
/** Clones granted by drop codes P1..P4. */
export const CLONE_BOX_AMOUNTS: readonly number[] = [1, 3, 10, 50];

// --- Section 3: balance decisions ---------------------------------------------

/**
 * B1: base integrity. 1 means the goal has no lives: the first enemy to cross
 * it loses the level (owner's rule, decision A18). A larger value turns the
 * goal into a health bar again.
 */
export const BASE_HP = 1;
/** B2: clones at level start. The owner wants a level to begin with the black cat alone (A28). */
export const START_CLONES = 0;
/** B4: weighted clone box, in the order +1, +3, +10, +50. */
export const CLONE_BOX_WEIGHTS: readonly number[] = [40, 35, 20, 5];
/** B4: random drop table. */
export const DROP_WEIGHTS = {
  cloneBox: 60,
  minigun: 15,
  rocket: 10,
  laser: 10,
  tank: 5,
} as const;
/** D12: damage an enemy takes when it trades with a cat. */
export const CONTACT_DAMAGE = 1;
/** B8: powerup boxes fall twice as fast as the army marches, so they are not buried in it. */
export const POWERUP_SPEED = 24.0;
/** B9: a box is picked up this far outside the outermost clone ring, along the lane. */
export const PICKUP_MARGIN = 0.8 * UNIT;
/** Width of a falling box, dropped by the fat rats (A29: twice the first size). */
export const POWERUP_WIDTH = 8 * UNIT;
/** A cat is touched by an enemy that comes within this distance of its centre (A28). */
export const CAT_RADIUS = 0.45 * UNIT;
/** B11: incoming enemy HP/s stays under this fraction of achievable DPS. */
export const PRESSURE_RATIO = 0.6;
/** B10: built-in level length range, in rows. */
export const LEVEL_MIN_ROWS = 80;
export const LEVEL_MAX_ROWS = 400;
export const BUILT_IN_LEVELS = 44;

// --- Pools (PLAN section 4) ----------------------------------------------------

export const POOL_ENEMIES = 4096;
export const POOL_BULLETS = 1024;
export const POOL_ROCKETS = 64;
export const POOL_POWERUPS = 64;
export const POOL_PARTICLES = 512;

// --- Collision (PLAN section 4) -------------------------------------------------

/** Spatial hash bucket size in gu. */
export const HASH_BUCKET = 4;
/** Largest enemy footprint; sets how far above the window the hash must reach. */
export const MAX_ENEMY_SIZE = COLS;

// --- Cosmetic effects ----------------------------------------------------------

export const FX_PUFF_SECONDS = 0.35;
export const FX_BURST_SECONDS = 0.5;
/** Seconds an enemy stays tinted after taking a hit. */
export const HIT_FLASH_SECONDS = 0.08;
export const FX_PICKUP_SECONDS = 0.6;

// --- Sound ---------------------------------------------------------------------

/** Level of the sound effects, 0 to 1. */
export const SFX_VOLUME = 0.7;
/** Music plays at this fraction of the sound-effect level (owner's rule: 50% below). */
export const MUSIC_VOLUME_RATIO = 0.5;
/**
 * Music (owner's rule). `music/0.mp3` is the splash screen. A map plays the track
 * of its last digit: map 2 and map 32 play `2.mp3`. A map ending in 0 plays
 * `10.mp3`. The boss maps 11, 22, 33 and 44 play `11.mp3`, the boss track.
 */
export const MUSIC_BOSS_TRACK = 11;
export const MUSIC_TENS_TRACK = 10;

// --- Presentation (render only; no effect on the simulation) ---------------------

/**
 * Camera (A29): high above and well back, like the reference game, so the whole
 * lane and both rails are in view and perspective is mild.
 * VIEW_COLS is the width seen across a portrait screen at the shooter's depth.
 */
export const VIEW_COLS = COLS + 2 * RAIL_WIDTH + 3;
/** Camera rig, in gu, relative to the shooter: height above the lane and distance behind. */
/**
 * Share of the swarm's sideways movement that the camera follows. The whole lane and
 * both rails fit the screen, so the camera only leans towards the swarm: with the cats
 * on one rail the lane stays in full view and only part of the far rail leaves it.
 */
export const CAMERA_FOLLOW = 0.3;
export const CAMERA_HEIGHT = 190;
export const CAMERA_BACK = 92;
/** The camera is aimed so the goal line sits this many rows above the bottom edge of the screen. */
export const CAMERA_GOAL_MARGIN = 5;
/** Vertical field of view never drops below this (degrees), so wide screens still see the whole window. */
export const CAMERA_MIN_FOV = 26;
/** How quickly a clone eases to its place in the formation, per second. Outer rings trail a little. */
export const CLONE_EASE = 13;
export const CLONE_EASE_RING_LAG = 1.1;
/** Units are drawn larger than a cell so the crowd overlaps and reads as a mass. */
export const UNIT_DRAW_SCALE = 1.36 * UNIT;
export const SHOOTER_DRAW_SCALE = 1.62 * UNIT;
/** Big enemies are drawn a little past their footprint so they read as bulky. */
export const BIG_DRAW_SCALE = 1.05;
/** Big enemies are squat: their height is this fraction of their width scale. */
export const BIG_HEIGHT_SCALE = 0.66;
/** Rows beyond the top of the window that are drawn as a look-ahead (decision A9). */
export const PREVIEW_ROWS = 22;
/** Real shadow map for big enemies and walls. Minions always use contact-shadow discs. */
export const SHADOW_MAP_SIZE = 2048;

// --- Persistence ---------------------------------------------------------------

export const STORAGE_KEY = 'free-wars:v1';
