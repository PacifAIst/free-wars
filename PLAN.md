# FREE-WARS — Implementation Plan

Plan for building FREE-WARS with Claude in VS Code. Repo: `https://github.com/PacifAIst/free-wars`, licence AGPL-3.0.

**How to use this file:** put it at the repo root as `PLAN.md`, next to the full spec saved as `SPEC.md`. Work one milestone at a time ("implement M3 from PLAN.md"), and do not start the next until the acceptance checks pass. Where this plan and `SPEC.md` disagree, this plan wins: it records the owner's later answers, resolves the spec's contradictions (section 2) and adds balance changes (section 3). Every item in sections 2 and 3 is copied into `DESIGN_DECISIONS.md`.

---

## 1. Ground rules confirmed by the owner

- The screen shows a 44×44 window of the lane. A map is 44 columns wide and **any number of rows long**: rows keep arriving from the top until the file ends. There is no row limit.
- The grid is authored by pasting rows straight from Excel (section 5).
- Enemies and clones trade on contact; this is the main way the swarm shrinks.
- A minion takes about 60 seconds to cross the screen. All numbers will be balanced later, so every tunable lives in one file.
- The swarm stays at screen centre. The whole map slides left/right with smooth acceleration and deceleration and is stopped by side barriers, with 3D-like scenery outside them.
- The game must run on low-end static hosting (Namecheap shared hosting, Cloudflare Pages free) and be easy to package as an APK later (section 6).

One guess remains, isolated in a single token table: the meaning of `E41`–`E44`, `E5-100`, `E7-400` and `ER` in the sample rows (section 5).

---

## 2. Spec decisions

| # | Topic | Decision |
|---|---|---|
| D1 | Speeds | `SPEED_SCALE = 0.075` converts spec speed values to gu/s. Spec 10 → 0.75 gu/s (44 rows in ~59 s); 8 → 0.6; 5 → 0.375; E6 charge 20 → 1.5; E8 rocket 50 → 3.75. |
| D2 | Horizontal movement | Drag input moves the whole map layer (lane, enemies, gates, barriers, scenery) with spring easing. Travel is clamped when the shooter reaches a side barrier; clone slots that would fall outside the lane are squeezed inward. |
| D3 | Vertical movement | No free vertical camera. Shooter and base line are fixed in screen space; the army descends like a conveyor. |
| D4 | Row streaming | The file is a timeline: grid line 1 enters first and leads the march, each later line follows one cell behind, and end of file is the end of the level. Rows are spawned into the pools as they reach the top edge of the window, never all at once. At level start the front line is pre-advanced to 12 rows below the top so play begins immediately. |
| D5 | Win condition | End of file reached and no enemy alive. The HUD shows progress as rows spawned / total rows. |
| D6 | Which rockets kill the black shooter | All enemy rockets (E4, E7, E8). Promotion goes to the oldest surviving clone. |
| D7 | Undefined rocket stats | E4 rocket: 50 HP, 3.0 gu/s. E7 rocket: 200 HP, 3.0 gu/s, 20×20 AoE. |
| D8 | Undefined fire rates and speeds | Bullets 30 gu/s. Tank: 2 tank rockets/s from one muzzle. Ring k holds 6k clone slots at radius k gu. |
| D9 | `-P#` codes | P1 +1, P2 +3, P3 +10, P4 +50, P5 minigun, P6 laser, P7 rocket, P8 tank. |
| D10 | Enemy overlap | No enemy-to-enemy collision. Slower big enemies fall behind their row and are overrun; draw order is by row. |
| D11 | Big enemies in the grid | The token's cell is the front-left corner of the footprint; the body extends behind it and enters the screen gradually. A footprint that would leave the lane is shifted inward. Overlap with other tokens is allowed. |
| D12 | Contact | When an enemy touches a clone, the clone dies and the enemy takes 1 DMG. The black shooter is immune to contact. |
| D13 | Build targets | Two outputs from one codebase (section 6): a static build for hosting and APK, and a single-file build for `file://`. |
| D14 | Audio files | All audio is generated procedurally at build time; the loop is encoded to MP3 with a dev-only encoder and committed. |
| D15 | Screen fit | The 44-column lane fits the shorter screen side. In portrait, extra rows are shown above rather than letterboxing. Render resolution is `min(devicePixelRatio, 2)` (deviation from spec §4, for low-end phones). |
| D16 | Scenery | Outside the barriers: raised walls with visible side faces plus 2–3 parallax layers that move at different rates when the map slides. 2D sprites only. |

---

## 3. Balance decisions (developer's call)

These change or extend the spec because the written numbers do not produce a playable game. Each has a constant so it can be reverted or tuned.

| # | Problem | Decision | Constant |
|---|---|---|---|
| B1 | A full 44-wide row of minions arrives every 1.3 s (about 33 HP/s across the lane) while the lone shooter fires 2 shots/s over one column. With "any enemy at the base = loss", every level ends in seconds. | The base has integrity. Each enemy reaching the base line removes its remaining HP from the base and is destroyed; any boss (E5–E8) reaching it is an instant loss. Shown as a bar on the HUD. Set to 1 to restore the spec's instant loss. | `BASE_HP = 100` |
| B2 | Starting alone makes the first minute flat. | Start each level with 4 clones. | `START_CLONES = 4` |
| B3 | Enemies above the screen could be shot before the player sees them. | Bullets and player rockets expire at the top of the window; enemies are only damageable once on screen. | — |
| B4 | A uniform roll makes +50 a 25% outcome, which decides the level by luck. | Weighted clone box: +1 40%, +3 35%, +10 20%, +50 5%. Random drops: clone box 60%, minigun 15%, rocket 10%, laser 10%, tank 5%. | `DROP_WEIGHTS` |
| B5 | Laser deals 3 DMG once per cast: E3 (4 HP) survives although the spec says it dies, and two casts do 6 damage to a 2,000 HP boss. | A cast kills E1–E3 in the beam outright and deals 40 DMG to E4–E8 and to enemy rockets. | `LASER_BIG_DMG = 40` |
| B6 | 100 clones each firing AoE rockets is both overwhelming and expensive to render. | In rocket mode only the black shooter and the 6 inner-ring clones fire rockets (1/s each); the rest keep firing bullets. | `ROCKET_SHOOTERS = 7` |
| B7 | A 200 HP E4 touching the swarm would consume it one clone per hit point. | Enemies of size 8×8 or larger kill at most 4 clones per second by contact (bosses use SMASH per spec). | `BIG_CONTACT_RATE = 4` |
| B8 | Boxes falling slower than the army get buried in it. | Powerup boxes fall at 2.0 gu/s and cannot be hit by player bullets (except the tank bubble). | `POWERUP_SPEED = 2.0` |
| B9 | Spec gives two pickup rules (swarm vs. shooter rect); shooter-only is frustrating with a wide swarm. | Pickup when the box overlaps the formation's bounding circle. | — |
| B10 | Level length is unbounded, and 4,444 rows last about 99 minutes at D1 speed. | Built-in levels run 80–400 rows (about 2–9 minutes). Custom maps have no cap. | — |
| B11 | Dense walls are unbeatable early regardless of B1. | Generated levels follow a pressure budget: incoming enemy HP per second stays under 60% of the DPS a well-played swarm can have at that point, with full-width rows reserved for late levels. | `PRESSURE_RATIO = 0.6` |

Kept as written: boss HP, SMASH and CHARGE values, rocket intervals, minigun, tank, clone cap of 100, clone fire at half rate. With D1 speeds an E5 needs about 35 focused clones and an E8 about 85, which is a reasonable late-game bar.

---

## 4. Architecture

**Stack:** Pixi.js v8 (`preference: 'webgl'`), TypeScript strict, Vite, Howler.js. No backend, no router.

**Simulation / render split**
- `Game.ts` owns the state machine and a fixed 60 Hz accumulator. RAF delta is clamped to 100 ms. Rendering interpolates between sim states.
- Sim state is plain data with no Pixi references and serialises with `JSON.stringify`. It includes the stream cursor (next row to spawn) and the PRNG seed.
- All randomness goes through one seeded PRNG.

**Row streaming (`World.ts`)**
- The parser turns the whole grid into a compact typed array (one `Uint16` token id per cell plus a small side table for overrides), so a 44×4,444 map costs about 400 KB of memory and no objects.
- Each tick the world advances a scroll distance; when it passes the next row's position, that row's tokens are spawned into the pools just above the window.
- Memory and frame cost depend on what is on screen, not on map length.

**Scene graph**
- `mapLayer` (slides horizontally): parallax scenery, barriers, lane, gates, enemies, enemy rockets, powerups, player bullets.
- `swarmLayer` (fixed at screen centre): shooter, clones, tank.
- `hudLayer` (screen space).

**Entities and pooling**
- Fixed-capacity free-list pools created once: enemies 4,096, bullets 1,024, rockets 64, powerups 64, particles 512. Nothing is allocated during play. If the enemy pool is full, row spawning waits one tick and logs once.
- Minions and bullets render through a Pixi v8 `ParticleContainer`; bosses, HUD and effects use normal sprites.

**Collision (`Collision.ts`)**
- Uniform spatial hash with 4-gu buckets, rebuilt each tick.
- Queries: bullet vs. target, explosion AoE vs. enemies, enemy vs. clone contact, enemy rocket AoE vs. clones, boss rect vs. formation rect, powerup vs. formation circle.

**Input (`Input.ts`)**
- Pointer events only. Drag distance sets a target offset; the map follows through a spring (ω = 12 rad/s, ζ = 0.9) in the fixed step, with release momentum and a soft stop at the barriers. Arrow keys / A-D on desktop.
- No hover-dependent UI; tap targets at least 44 CSS px.

**Persistence**
- `localStorage` key `free-wars:v1`: unlocked levels, best times, settings. Versioned, with a fallback when storage is unavailable.

**Folder layout:** exactly as in spec §3, plus:
- `src/game/constants.ts` (every tunable in sections 2 and 3)
- `scripts/gen-sprites.mjs`, `scripts/gen-audio.mjs`, `scripts/gen-maps.mjs`, `scripts/sim-maps.mjs`
- `public/manifest.webmanifest`, app icons
- `tests/` (Vitest)
- `LICENSE` (AGPL-3.0 full text), `.github/workflows/ci.yml`

---

## 5. Map format

Header as in spec §11.2. The grid is pasted from Excel as tab-separated rows inside a fenced block and runs until the block ends:

````
## Grid
Columns: 44

```
1	2	3	...	44
E1	E1	E1	...	E1
E41	E42	E43	E44	E5-100	ER	E1	...
```
````

Parser rules (`markdownMapParser.ts`):
- Cells are split on tabs; pipe-separated Markdown table rows are accepted too.
- An optional first row of `1…44` is a header and is skipped.
- Row count is whatever the file contains. A `Rows:` line is optional; a mismatch is a warning, not an error.
- Rows with fewer than 44 cells are padded with empty cells (editors trim trailing tabs); rows with more are rejected.
- Returns `{ ok: true, map, warnings[] } | { ok: false, errors[] }` with line and column in every message.
- Custom uploads (file picker, `.md`): rejected when `id` is `0`–`44`. Kept in memory for the session only.

Token table (single source of truth, one file):

| Token | Reading used |
|---|---|
| empty or `.` | Empty cell |
| `E1`…`E8` | Enemy of that type |
| `E41`…`E44` | E4 with an authored clone-box drop: +1, +3, +10, +50 (guess) |
| `E5-100`, `E7-400` | Enemy with HP override (guess) |
| `ER` | Random minion E1–E3 from the seeded PRNG (guess) |
| `E4-P8`, `E7-400-P3` | Authored drop per D9; combines with HP override |
| `G25`, `G25-P3` | Gate cell, resistance 25, optional drop; only in columns 1–4 and 41–44 |

The owner's pasted sample is saved as `public/maps/0.md` (dev map) and as a parser test fixture. It is a parser and stress fixture, not a balanced level.

---

## 6. Hosting and packaging

**Hosting build (`npm run build` → `dist/`)**
- Plain static files with `base: './'`: works from a domain root, a subfolder, or a WebView.
- No server features: no rewrites, no `.htaccess`, no custom headers. Upload `dist/` through cPanel on Namecheap, or point Cloudflare Pages at the repo with build command `npm run build` and output folder `dist`.
- Single page, no client-side routes.
- Maps are code-split: `import.meta.glob('/public/maps/*.md', { query: '?raw' })` loads one map on demand, so long maps do not slow the first load.
- Size budget: under 500 KB for first paint (code + sprite atlas); `bgm.mp3` loads after the menu appears.
- Web app manifest and a small cache-first service worker for install and offline play. The service worker is skipped under `file://` and inside the APK.

**Single-file build (`npm run build:single` → `dist-single/index.html`)**
- `vite-plugin-singlefile` inlines code, sprites, SFX and all maps so the game opens by double-click. `bgm.mp3` sits beside it and is loaded by Howler in `html5` mode; if that fails the game runs without music.

**APK path (later, not part of this build)**
- Wrap `dist/` with Capacitor (`npx cap add android`); no game code changes expected.
- Kept ready now: relative paths only, safe-area insets, pause on `visibilitychange`, audio unlocked on first touch, one `onBack()` hook that pauses the game, portrait and landscape both supported.

---

## 7. Art and audio direction

The reference image is used only for its genre mechanics: a crowd against a crowd, numbered boxes that take damage, bonus gates along the lane edge, a lane with raised edges. None of its look is reused.

- **Style:** flat top-down 2D pixel art with an original palette (night-alley blues for the lane, cream and black cats, grey-brown rats, one accent colour per powerup). Depth comes from barrier side faces and parallax scenery.
- **Sprites:** drawn by `scripts/gen-sprites.mjs` from code into PNGs under `/public/assets/sprites` and packed into one atlas: black cat, white cat, E1–E8 rats, 5 powerup icons, bullets, rockets, boss HP bar, tank and bubble, barrier and scenery tiles.
- **Audio:** `scripts/gen-audio.mjs` synthesises the 7 SFX as WAV and a short looping chiptune as `bgm.mp3`. Generated files are committed.

---

## 8. Milestones

Each milestone ends with `npm run build` clean, `npm test` green, and a commit.

**M0 — Scaffold.** Vite + TS strict + Pixi v8 + Howler, ESLint, Vitest, AGPL `LICENSE`, README stub, `DESIGN_DECISIONS.md` seeded from sections 2 and 3, `constants.ts`, both build scripts, CI workflow.
- Check: `npm run dev` shows a resizing Pixi canvas; `dist-single/index.html` opens from `file://`.

**M1 — Loop, map layer, input.** State machine with all states stubbed, fixed-step loop with interpolation, lane with barriers and parallax scenery, spring-driven map slide, shooter pinned to screen centre.
- Check: slide is smooth with mouse and touch, eases to a stop at both barriers, survives a 5 s tab switch without a jump.

**M2 — Map parser.** Types, parser and token table per section 5, typed-array grid.
- Check: the pasted sample parses; a generated 44×4,444 map parses in under 200 ms; unit tests cover every token, padding, rejection rules and message positions.

**M3 — Streaming and core combat.** Row streaming, pools, E1–E3 marching, regular bullets (B3), spatial hash, base integrity (B1), WIN per D5, LOSE on base destroyed.
- Check: the 44×4,444 map runs with flat memory and holds 60 fps on a mid-range laptop and 30+ fps on a low-end Android phone with the window full of minions.

**M4 — Clones.** Ring formation with clockwise fill and re-pack, barrier squeeze, starting clones (B2), half-rate clone fire, cap of 100, weighted clone boxes (B4), contact trades (D12, B7), promotion, LOSE when nobody is left.
- Check: unit tests for slot positions at 1, 6, 7, 100 clones, re-pack after removals, and contact trades.

**M5 — Weapons and powerups.** Falling boxes and pickup (B8, B9), minigun (stack, 30 s cap), laser (2 s charge, 0.5 s beam, 3 s cooldown, 10 s total, B5), rocket mode (4×4 AoE, B6), tank bubble (50 HP) and tank mode (8×8 contact and AoE, swarm hidden, 5 s).
- Check: each weapon verified on the dev map; timers shown on the HUD.

**M6 — Big enemies.** E4 with thin HP bar and rockets; E5/E6 smash, E6 charge; E7/E8 rockets with HP, interception and AoE; numbered boss HP bars; death drops; gradual entry of large bodies (D11).
- Check: unit tests for smash targeting (nearest side first), rocket AoE counts and shooter promotion.

**M7 — Gates.** Gate cells in the edge columns, resistance as HP, bullet blocking, drop on break.
- Check: fixture map with both gate columns behaves per spec §10.

**M8 — UI and persistence.** Menu, horizontal level select with 44 nodes (lock state, best time), pause, win/lose screens, HUD (clones, base integrity, level progress, powerup rings), settings, save, 8-tap logo unlock for map 0, custom map upload.
- Check: winning map N unlocks N+1 across a page reload.

**M9 — Assets and audio.** Generator scripts, atlas packing, Howler wiring, mute/volume, audio unlock on first pointer event.
- Check: no missing-asset warnings; first-paint budget met.

**M10 — Content and balance.** `scripts/gen-maps.mjs` produces maps 1–44 (80–400 rows, B10) under the pressure budget (B11), introducing a new enemy type roughly every 5 levels with E8 from level 40. `scripts/sim-maps.mjs` runs every map headless with a simple bot and prints win/loss, time, clones and base integrity left. Maps 1–5 are hand-tuned.
- Check: all 45 maps parse; the bot wins maps 1–10; no map is flagged impossible; `README` lists which constants to turn for easier or harder play.

**M11 — Hardening and release.** Allocation soak test (Chrome `performance.memory` flat over 5 minutes), mobile pass on iOS Safari and Android Chrome, manifest and service worker, README (controls, map authoring from Excel, build, deploy to Namecheap and Cloudflare Pages, APK notes), final `DESIGN_DECISIONS.md`.
- Check: fresh clone, `npm ci && npm run build`; `dist/` served from a subfolder plays level 1 to a win, and so does `dist-single/index.html` opened by double-click.

---

## 9. Risks

- **`file://` with Pixi v8:** Pixi's asset loader uses `fetch` and workers, both blocked there. The single-file build avoids both; verify at M0.
- **Thousands of sprites on low-end phones:** if `ParticleContainer` is not enough, minions fall back to one batched mesh. Decide after the M3 benchmark.
- **Balance is untested until M10:** section 3 is reasoning from the numbers, not playtesting. The headless bot is the first real evidence; expect to retune `BASE_HP`, `SPEED_SCALE`, fire rate and drop weights together.
- **Token guesses:** if `E41`–`E44` or `ER` mean something else, only the token table and its tests change.

---

## 10. Instructions for Claude in VS Code

- Read `SPEC.md` and this file before each milestone; implement only the named milestone.
- No stubs or TODOs in committed code. If something is ambiguous, pick the defensible reading, record it in `DESIGN_DECISIONS.md`, and continue.
- Keep sim code free of Pixi imports; only render and UI files may import Pixi.
- Every number in sections 2 and 3 comes from `src/game/constants.ts`; no literals in game logic.
- Add or update Vitest tests with every sim change; run typecheck, tests and both builds before committing.
- Relative URLs only; no server-side features.
- Never spawn a whole map at once; all enemy creation goes through the row stream.
- Do not reproduce any existing game's art, characters, names or UI. All sprites and audio come from the generator scripts.
