

# ROLE
You are a senior HTML5 game engineer. Ship a Github repo with AGPL_v3 license 
at https://github.com/PacifAIst/free-wars as a complete, playable, cross-platform
2D web game called FREE-WARS. Do NOT return scaffolding, pseudocode, or "TODO"
stubs. Deliver working TypeScript/JavaScript, real assets (or procedurally
generated placeholder art), real map files, and a running build (Vite dev server
or `npx serve`). If any requirement below is ambiguous, pick the most defensible
interpretation, document it in `DESIGN_DECISIONS.md`, and implement it.

# 1. HIGH-LEVEL CONCEPT
FREE-WARS is a fixed-shooter roguelite. A black cat (the "shooter") is locked to
the horizontal center of the screen and auto-fires upward. The player drags/
swipes to pan the entire world left/right; the shooter always stays centered.
A massive descending army of rat enemies marches down a 44-column × N-row grid
toward a base line at the bottom. Enemy units die on contact with bullets,
projectiles, and the player's clone swarm. If the enemy army reaches the bottom
row, the base explodes and the player loses. If every clone and the black
shooter are killed, the player loses. The player wins when every enemy listed in
the map has been killed.

# 2. TECH STACK (non-negotiable)
- Rendering: Pixi.js v8 (WebGL).
- Language: TypeScript (strict mode) compiled via Vite. Vanilla JS is acceptable
  ONLY if you can guarantee the same rigor and type-safety notes.
- Bundler/dev server: Vite.
- Audio: Howler.js (or raw Web Audio if you prefer; document the choice).
- No Phaser. No Unity/Godot WASM. No backend.
- One HTML entry, all logic bundled into /dist. Must run from file:// as well as
  a static host.

# 3. DELIVERABLES (folder structure)
/free-wars
  /public
    /assets
      /sprites        # black cat, white cat, 8 rat enemies, 5 powerup icons,
                      # bullet sprites, boss HP bar, tank bubble
      /audio          # bgm.mp3, shot.wav, hit.wav, boss-smash.wav, pickup.wav,
                      # explode.wav, laser-charge.wav, laser-fire.wav
    /maps
      1.md ... 44.md
      0.md            # DEV map (see §11)
    favicon.ico
  /src
    main.ts
    game/
      Game.ts           # top-level loop + state machine
      World.ts          # 44×N grid, camera, pan, viewport culling
      Player.ts
      Clone.ts
      Enemy.ts
      Projectile.ts
      Powerup.ts
      Gate.ts
      Collision.ts      # spatial hash or quadtree
      Input.ts          # unified drag/swipe (pointer events)
      Audio.ts
      HUD.ts
      LevelSelect.ts
    parsers/
      markdownMapParser.ts
    types/
      index.ts
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  DESIGN_DECISIONS.md
  README.md

# 4. GAME LOOP & STATE MACHINE
States: BOOT → MENU → LEVEL_SELECT → LOADING → PLAYING → PAUSED → WIN → LOSE
       → (return to LEVEL_SELECT)

- Fixed-timestep physics (60 Hz) with interpolation for rendering.
- Pixi.js Application with `resizeTo: window`, `antialias: true`,
  `resolution: window.devicePixelRatio`.
- RAF-driven, delta-time clamped to 100 ms to survive tab-switch.
- All game state serializable to JSON for future save/rewind (implement save to
  localStorage: level unlock flags, best times, settings).

# 5. WORLD & CAMERA MODEL (define this explicitly)
- World = 44 columns × N rows (N ≥ 44, defined per map).
- Columns are numbered 0..43 left-to-right. Column 22 is the map's horizontal
  center. The shooter is always rendered at the horizontal center of the
  viewport; the world pans underneath.
- Viewport shows exactly 44 rows and 44 columns, scaled to fit the screen.
- Player starting column = 22. Player starting row = visible bottom row - 1.
- Dragging/swiping left or right translates the world by the drag distance with
  critically-damped easing (spring: ω ≈ 12 rad/s, ζ ≈ 0.9) so panning feels
  fluid and stops with momentum.
- Vertical scroll: enemies descend; the camera tracks the average y of the
  leading enemy wave with a small bias so the player can always see incoming
  threats. If the wave is empty, camera returns to base line.
- Row 0 is the topmost row and is the FIRST to appear. Enemies descend at their
  `speed` stat (units = grid cells per second × 10; see §7).
- The enemy loses the game if any enemy entity's y reaches the base line
  (bottom of viewport) — that enemy "explodes on the base".

# 6. PLAYER & CLONES
## 6.1 Black shooter (the original)
- 1 cat sprite, black palette. Invulnerable by default EXCEPT to enemy rockets
  (see §7.4/§7.8). Always auto-fires the current primary weapon upward.
- If killed (rocket hit), the oldest surviving white clone promotes to black
  (swap sprite + tag). If no clones exist, LOSE.
- Tracks the current active powerup timers: minigun, rocket, laser, tank.

## 6.2 Clones
- Cap: 100 clones (in addition to the black shooter). When a box of +N exceeds
  the cap, cap at 100 and discard the remainder.
- Formation: clones are arranged around the black shooter on concentric rings.
  New clone spawns at the next free slot in CLOCKWISE order around the shooter
  (start angle = -90° / 12 o'clock, step = 360°/ringCapacity, then outward to
  the next ring when full).
- Each clone auto-fires the current primary weapon upward, but at HALF the base
  rate of the black shooter (so growing the swarm increases total DPS without
  making it absurd). Damage per clone bullet = same as black shooter bullet.
- Clones can be killed by boss smash, boss charge contact, and enemy rockets.
  A killed clone frees its slot; the ring re-packs clockwise.
- Clones never touch the ground; they follow the shooter's y.

# 7. ENEMY TYPES (8 total, all rats)
All enemies occupy integer grid cells. Multi-cell enemies occupy a rectangle of
cells measured in grid units (gu = 1 cell = 44×44 px at 1× zoom).

| ID  | Name              | Size (w×h, gu) | HP    | Speed (gu/s) | Behavior |
|-----|-------------------|----------------|-------|--------------|----------|
| E1  | Minion            | 1×1            | 1     | 10           | Marches down. |
| E2  | Sergeant minion   | 1×1            | 2     | 10           | Marches down. |
| E3  | Elite minion      | 1×1            | 4     | 10           | Marches down. |
| E4  | Sniper (fat rat)  | 8×8            | 200   | 8            | Marches; every 8 s fires a rocket down. |
| E5  | Boss              | 20×20          | 2000  | 10           | Marches; when overlapping clone swarm, SMASH every 0.5 s killing 15 clones. |
| E6  | Boss (charger)    | 20×20          | 3000  | 10 → 20 when close | Same as E5 but CHARGES at 20 gu/s when within 12 gu of the swarm; SMASH kills 30 clones/tick. |
| E7  | Boss sniper       | 20×20          | 4000  | 5            | Every 4 s fires a rocket down; rocket HP = 200. |
| E8  | Robo rat boss     | 30×30          | 10000 | 5            | Every 2 s fires a rocket down; rocket HP = 200, speed 50, AoE kills 20×20 grid of clones. |

## 7.1 HP bars
Only E5–E8 bosses display a floating numbered HP bar above the sprite. Bar
updates on damage (integer). E1–E4 do NOT have HP bars (they die on hit anyway,
except E4 needs focus fire — show a thin unnumbered bar for E4 as feedback).

## 7.2 Rockets
- E4/E7/E8 rockets travel DOWN at the rocket's listed speed (gu/s).
- Rockets can be destroyed by bullet damage (HP per table). If destroyed,
  explode harmlessly.
- If a rocket reaches the swarm / shooter, apply AoE:
  - E4 rocket: kills an 8×8-cell area of clones. If the black shooter is inside,
    the shooter dies → random oldest clone is promoted to black.
  - E8 rocket: kills a 20×20-cell area. Same promotion rule.
  - E7 rocket: same as E8 rocket reach (20×20) but rocket HP = 200 — the spec
    does not define E7 reach; use 20×20 (document it).
- Rockets are visible projectiles that descend; player bullets can intercept
  them.

## 7.3 Boss SMASH / CHARGE
- Trigger when boss rectangle overlaps the clone formation rectangle.
- Cooldown 0.5 s; each tick kills N clones (15 for E5, 30 for E6) selected from
  the nearest-to-boss side. Black shooter is NOT killed by SMASH (only E4/E8
  rockets kill the black shooter).
- E6 additionally enters CHARGE mode when within 12 gu of the swarm: speed
  becomes 20 gu/s until it touches the swarm, at which point it reverts to 10.

## 7.4 Death drops
When E4 or E8 dies, drop a falling powerup box (per §9). If the map authored a
specific powerup via the `-P#` suffix, use it; otherwise roll random among
{+1, +3, +10, +50, minigun, laser, rocket, tank}.

# 8. WEAPONS, BULLETS & DAMAGE
Damage values:
- Regular bullet: 1 DMG.
- Minigun bullet: 1 DMG (fires 2× faster).
- Laser: kills every enemy in the vertical column, 3 DMG (so E1/E2 die, E3 dies,
  E4/E5+ take 3 per tick of the 0.5 s flash — ONE instance of 3 DMG per enemy
  per laser cast).
- Rocket: 3 DMG in a 4×4-cell explosion.
- Tank rocket: 8 DMG in an 8×8-cell explosion; tank itself deals 8 DMG to any
  enemy its 8×8 body overlaps (contact kill), and is invulnerable for the 5 s
  duration.

Bullet visuals:
- Regular: yellow 4×12 px capsule.
- Minigun: orange 4×12 px capsule, tighter spread.
- Laser: red 4-cell-wide vertical beam, 0.5 s flash.
- Rocket: tiny rocket sprite (matching enemy rocket visually, but travelling
  up), 4×16 px.
- Tank rocket: 2× the rocket sprite.
- Enemy rockets (down): red-tipped grey rockets.

## 8.1 Fire cadence
- Base fire rate: 2 shots/sec (uniform across clones for simplicity).
- Minigun: fire rate = 2× base, 5 s duration, stackable (each pickup adds 5 s
  to the minigun timer, capped at 30 s).
- Laser: 2 s charge bar, then fire 0.5 s beam, cooldown 3 s, repeat while
  active (the laser "powerup" lasts 10 s of active firing including charges).
- Rocket: 10 s of fire, replacing regular bullets. Stackable.
- Tank: 5 s duration, pickup requires 50 damage to the bubble to release.
  While active, the player's clone formation visually merges into the tank
  sprite; on expiry, the tank dissolves and the swarm reappears.

## 8.2 Bullet pooling
Use object pools. Never allocate per-frame. Target: zero GC pressure in steady
state (measure with `performance.memory` in Chrome).

# 9. POWERUPS
Five types, all fall from the top and are picked up by overlap with the swarm.

1. Clone box — random of {+1, +3, +10, +50}; maps can hard-code via `-P1..P4`.
   Falling speed: 6 gu/s. If it reaches the base line, it is lost.
2. Heavy minigun — icon: minigun with circular timer ring on the HUD. Adds 5 s
   to the minigun timer; multiple pickups stack (cap 30 s).
3. Laser gun — icon: red beam. Activates 10 s of laser mode.
4. Rocket launcher — icon: rocket. Activates 10 s of rocket mode.
5. Tank in a bubble — spawns an indestructible-to-enemies bubble with 50 HP.
   Player bullets that hit the bubble reduce its HP. At 0 HP the bubble pops
   and the tank powerup auto-collects (5 s tank mode). This is the ONLY powerup
   that requires damage to unlock.

Powerup spawn sources:
- Killed E4 / E8.
- Breaking a gate cell (see §10).
- Map-authored `-P#` suffix on any enemy (drops on death).

Pickup: overlap of the falling box's rect with the shooter sprite's rect.

# 10. GATES (the left/right columns from the Excel)
- A map can declare a 4-cell-wide gate column on the left and/or right edge
  (columns 0–3 and 40–43).
- Each gate cell has a RESISTANCE value R (positive integer). It behaves like an
  enemy for bullet targeting but doesn't move and doesn't descend.
- Gate HP = R. When HP reaches 0 the cell "breaks" and spawns a falling powerup
  (random type by default; maps can specify via `-P#` suffix).
- Gates occupy cells just like enemies; if a gate cell is not broken by the time
  the player would collide with it, it blocks bullets but does not itself damage
  the player.
- Boss enemies can path around/through gates (they just occupy their rectangle).

# 11. LEVEL SYSTEM & MAP FORMAT
## 11.1 44 built-in levels
- Files: `/public/maps/1.md` through `44.md`.
- Unlock: winning map N unlocks map N+1 (persisted in localStorage).
- Level Select screen: a horizontal scroll of 44 clickable nodes showing unlock
  status + best time.
- `0.md` is the DEV map: NOT part of the 44, and is hidden in the UI. It is
  reachable only by tapping the game logo 8 times in under 2 s.

## 11.2 Markdown map format (canonical)
Each map is a `.md` file. Structure:

    # Map: <Title>

    - id: <string>       (e.g. "1", "42", "custom-abc") — system rejects 1..44
                         for custom uploads
    - name: <string>
    - difficulty: <1-5>
    - author: <string>   (optional)
    - description: <string>

    ## Grid
    Columns: 44
    Rows: <N>            (N >= 44; viewport shows 44, deeper maps scroll)
