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
/** Rows of the lane that are in play: from the top of the window to the base line. */
export const WINDOW_ROWS = 44;

// --- Simulation loop (SPEC section 4) ----------------------------------------

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** RAF delta clamp, so a tab switch never causes a jump. */
export const MAX_FRAME_DELTA_MS = 100;
/** D15: render resolution is min(devicePixelRatio, this). */
export const MAX_RENDER_RESOLUTION = 2;

// --- D1: speeds ----------------------------------------------------------------

/** Converts SPEC speed values to gu/s. Spec 10 -> 0.75 gu/s (44 rows in ~59 s). */
export const SPEED_SCALE = 0.075;
/** Speed at which the row stream advances: the E1-E3 march speed. */
export const MARCH_SPEED_SPEC = 10;
export const MARCH_SPEED = MARCH_SPEED_SPEC * SPEED_SCALE;

// --- Enemy table (SPEC section 7) ----------------------------------------------

export interface EnemyStats {
  /** Footprint width and height in gu. */
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  /** Raw SPEC speed; multiply by SPEED_SCALE. */
  readonly speedSpec: number;
  /** True for E5-E8: numbered HP bar, instant loss at the base line (B1). */
  readonly boss: boolean;
}

/** Indexed by enemy type 1..8. Index 0 is unused. */
export const ENEMY_STATS: readonly EnemyStats[] = [
  { w: 0, h: 0, hp: 0, speedSpec: 0, boss: false },
  { w: 1, h: 1, hp: 1, speedSpec: 10, boss: false }, // E1 minion
  { w: 1, h: 1, hp: 2, speedSpec: 10, boss: false }, // E2 sergeant
  { w: 1, h: 1, hp: 4, speedSpec: 10, boss: false }, // E3 elite
  { w: 8, h: 8, hp: 200, speedSpec: 8, boss: false }, // E4 sniper
  { w: 20, h: 20, hp: 2000, speedSpec: 10, boss: true }, // E5 boss
  { w: 20, h: 20, hp: 3000, speedSpec: 10, boss: true }, // E6 charger
  { w: 20, h: 20, hp: 4000, speedSpec: 5, boss: true }, // E7 boss sniper
  { w: 30, h: 30, hp: 10000, speedSpec: 5, boss: true }, // E8 robo rat
];

export const ENEMY_TYPE_COUNT = 8;
/** `ER` picks uniformly among the first N enemy types (E1-E3). */
export const RANDOM_MINION_TYPES = 3;

// E4 / E7 / E8 rockets (SPEC 7, D6, D7)
export const E4_ROCKET_INTERVAL = 8;
export const E7_ROCKET_INTERVAL = 4;
export const E8_ROCKET_INTERVAL = 2;
export const E4_ROCKET_HP = 50;
export const E4_ROCKET_SPEED = 3.0;
export const E4_ROCKET_AOE = 8;
export const E7_ROCKET_HP = 200;
export const E7_ROCKET_SPEED = 3.0;
export const E7_ROCKET_AOE = 20;
export const E8_ROCKET_HP = 200;
export const E8_ROCKET_SPEED_SPEC = 50;
export const E8_ROCKET_AOE = 20;

// Boss smash and charge (SPEC 7.3)
export const SMASH_INTERVAL = 0.5;
export const E5_SMASH_KILLS = 15;
export const E6_SMASH_KILLS = 30;
export const E6_CHARGE_RANGE = 12;
export const E6_CHARGE_SPEED_SPEC = 20;

// --- D4: row streaming ---------------------------------------------------------

/** At level start the front line is already this many rows below the window top. */
export const PRE_ADVANCE_ROWS = 12;

// --- Player (SPEC 5, 6, 8; D2, D3, D8) -----------------------------------------

/** Shooter height above the base line, in gu. Leaves room for 6 clone rings. */
export const SHOOTER_ROWS_ABOVE_BASE = 8;
export const SHOOTER_Y = WINDOW_ROWS - SHOOTER_ROWS_ABOVE_BASE;
/** Half width of the shooter body; travel stops this far from each barrier. */
export const SHOOTER_HALF_WIDTH = 0.5;
export const SHOOTER_START_X = COLS / 2;

/** Base fire rate in shots per second. */
export const FIRE_RATE = 2;
/** Clones fire at this fraction of the base rate. */
export const CLONE_FIRE_RATE_FACTOR = 0.5;
export const CLONE_CAP = 100;
/** D8: ring k holds RING_SLOTS_PER_RING * k clones at radius RING_SPACING * k gu. */
export const RING_SLOTS_PER_RING = 6;
export const RING_SPACING = 1;

export const BULLET_SPEED = 30;
export const BULLET_DAMAGE = 1;
/** Bullets leave the muzzle this far above the shooter centre. */
export const MUZZLE_OFFSET = 0.6;

// Minigun (SPEC 8.1)
export const MINIGUN_RATE_FACTOR = 2;
export const MINIGUN_PICKUP_SECONDS = 5;
export const MINIGUN_CAP_SECONDS = 30;

// Laser (SPEC 8, 8.1; B5)
export const LASER_CHARGE_SECONDS = 2;
export const LASER_BEAM_SECONDS = 0.5;
export const LASER_COOLDOWN_SECONDS = 3;
export const LASER_TOTAL_SECONDS = 10;
export const LASER_WIDTH = 4;
/** B5: a cast kills E1-E3 outright and deals this much to E4-E8 and rockets. */
export const LASER_BIG_DMG = 40;

// Rocket mode (SPEC 8; B6)
export const ROCKET_MODE_SECONDS = 10;
export const ROCKET_DAMAGE = 3;
export const ROCKET_AOE = 4;
export const ROCKET_FIRE_RATE = 1;
/** B6: only the shooter and the 6 inner-ring clones fire rockets. */
export const ROCKET_SHOOTERS = 7;

// Tank (SPEC 8, 9; D8)
export const TANK_SECONDS = 5;
export const TANK_BUBBLE_HP = 50;
export const TANK_SIZE = 8;
export const TANK_DAMAGE = 8;
export const TANK_ROCKET_AOE = 8;
export const TANK_ROCKETS_PER_SEC = 2;

// --- Input (SPEC 5; D2) --------------------------------------------------------

export const SPRING_OMEGA = 12;
export const SPRING_ZETA = 0.9;
/** Keyboard pan speed in gu/s (arrow keys, A/D). */
export const KEY_PAN_SPEED = 26;
/** Seconds of release velocity carried into the target on pointer release. */
export const RELEASE_MOMENTUM_SECONDS = 0.12;
/** +1: the map follows the finger (SPEC 5). -1: the swarm follows the finger. */
export const DRAG_DIRECTION = 1;

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
export const DROP_CODE_MAX = 8;
/** Clones granted by drop codes P1..P4. */
export const CLONE_BOX_AMOUNTS: readonly number[] = [1, 3, 10, 50];

// --- Section 3: balance decisions ---------------------------------------------

/** B1: base integrity. Set to 1 to restore the SPEC's instant loss. */
export const BASE_HP = 100;
/** B2: clones at level start. */
export const START_CLONES = 4;
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
/** B7: enemies this size or larger are rate-limited when killing clones by contact. */
export const BIG_CONTACT_MIN_SIZE = 8;
export const BIG_CONTACT_RATE = 4;
/** D12: damage an enemy takes when it trades with a clone. */
export const CONTACT_DAMAGE = 1;
/** B8: powerup boxes fall at this speed. */
export const POWERUP_SPEED = 2.0;
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
export const MAX_ENEMY_SIZE = 30;

// --- Cosmetic effects ----------------------------------------------------------

export const FX_PUFF_SECONDS = 0.35;
export const FX_BURST_SECONDS = 0.5;
/** Seconds an enemy stays tinted after taking a hit. */
export const HIT_FLASH_SECONDS = 0.08;

// --- Persistence ---------------------------------------------------------------

export const STORAGE_KEY = 'free-wars:v1';
