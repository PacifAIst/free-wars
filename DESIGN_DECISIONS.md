# FREE-WARS — Design decisions

This file records every place where the build departs from, or fills a gap in, `SPEC.md`.
Order of authority: the owner's latest instruction, then `PLAN.md`, then `SPEC.md`.

- Sections 1 and 2 are copied from `PLAN.md` sections 2 and 3. Their labels (D1, B4) are used in code comments.
- Section 3 lists what the owner changed after seeing the first build. Where it conflicts with sections 1 and 2, section 3 wins.
- Section 4 lists decisions taken during implementation. Each one names the constant or file that holds it.

Every number mentioned here lives in `src/game/constants.ts`.

---

## 1. Spec decisions (PLAN section 2)


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

## 2. Balance decisions (PLAN section 3)


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

## 3. Owner changes after the first build (2026-11-11)

The owner compared the first build with the reference video and asked for the changes below.
They override the plan rows named in the last column.

| # | Topic | Decision | Where | Overrides |
|---|---|---|---|---|
| A18 | Goal, contact, speed | The goal line has no lives: the first rat to cross it loses the level. A rat that touches any cat kills it, the black shooter included; when the shooter dies a clone is promoted, and with no clone left the level is lost. Enemies march about 2.7 times faster: a minion crosses the window in 22 seconds. Powerup boxes fall at 6 gu/s so they still outrun the army. | `BASE_HP = 1`, `SPEED_SCALE = 0.2`, `POWERUP_SPEED`, `src/game/Clone.ts` | B1 value, D1 value, D12 (shooter immunity), B8 value |
| A19 | Pursuit | Enemies go for the swarm. Big rats (E4-E8) steer sideways at the shooter. Minions run along the line towards the swarm, so the crowd closes into a wedge aimed at the cats, as in the video, and meets them instead of slipping past at the lane edges. That is what makes the goal rule in A18 fair. | `BIG_CHASE_SPEED`, `MINION_CHASE_SPEED`, `FUNNEL_*`, `src/game/Enemy.ts` | D3 (straight conveyor) for enemies |
| A20 | 3D rendering | The game is drawn in 3D with three.js: a perspective camera behind the swarm, lit models with shadows, glowing bullets. Models are built from code, with no model or texture files. Pixi.js is removed, because it is a 2D engine and cannot draw lit 3D models. The simulation, parser and tests did not change. | `src/render/Renderer3D.ts`, `src/render/models.ts` | SPEC section 2 (Pixi), D16 (2D sprites only), PLAN sections 4 and 7 |
| A21 | No overlapping enemies | Rats never pass through each other. In the grid, a big rat claims every cell of its footprint: minions drawn inside it are left out, and a big rat that would overlap another moves to the nearest free span of its row, or is left out if there is none. While moving, overlapping enemies are pushed apart: minions keep a cell between them, they flow round big rats, and big rats heading for the same spot queue up side by side. | `src/game/layout.ts`, `SpatialHash.separate`, `MINION_SPACING` | D10, D11 (overlap allowed) |
| A22 | Proportions | The camera shows about 30 of the 44 columns across a portrait screen at the swarm's depth, so units have the size they have in the video. The map still slides under the swarm, so the whole lane stays reachable. Wide screens keep the same vertical framing and show more to the sides. | `VIEW_COLS`, `CAMERA_*` | D15 (44 columns fit the screen) |
| A23 | Map label | The status bar names the map out of the 44 built-in ones ("MAP 1/44") and fills as its rows arrive. The summary of pending maps after a win, with all locked except the next, belongs to M8. | `src/game/HUD.ts` | D5 (rows spawned / total rows as text) |

## 4. Implementation decisions

| # | Topic | Decision | Where |
|---|---|---|---|
| A1 | Art style | The owner asked on 2026-11-11 for polished mobile-game art instead of the pixel art named in PLAN section 7, and then for 3D models (A20). Nothing is taken from the reference screenshot or video. | `src/render/models.ts`, `scripts/gen-sprites.mjs` |
| A2 | 2D art | `scripts/gen-sprites.mjs` still draws a 2D sheet (powerup icons, character portraits, favicon) as SVG and rasterises it with `@resvg/resvg-js`. It is user-interface art for M5 and M8 and lives in `art/ui/`, outside the shipped folder, until the UI uses it. | `scripts/gen-sprites.mjs`, `art/ui/` |
| A3 | No asset files at runtime | Models, the lane texture, labels and the lighting environment are all generated in code at start-up. There is nothing to fetch, so one code path serves a host and `file://`. | `src/render/` |
| A5 | Extra source files | SPEC section 3 lists the main files. Rendering lives in `src/render/`, and sim helpers (`rng.ts`, `Pool.ts`, `Sim.ts`, `Fx.ts`, `layout.ts`, `maps.ts`) sit beside the listed files. An ESLint rule blocks three.js imports in sim code. | `eslint.config.js` |
| A6 | Shooter position | The shooter sits 8 gu above the goal line, not on the row above it, so six clone rings fit below it. | `SHOOTER_ROWS_ABOVE_BASE` |
| A7 | Drag direction | The map follows the finger, as SPEC section 5 says, so dragging right moves the shooter left along the lane. Arrow keys and A/D move the shooter in the key's direction. | `DRAG_DIRECTION` |
| A8 | Parser message positions | Each parser message carries a file line and a column. For grid cells the column is the grid column 1-44, which is what an Excel author needs. For other lines it is the character position. | `src/parsers/markdownMapParser.ts` |
| A9 | Look-ahead | Rows that have not spawned yet are drawn beyond the top of the window, a little darker and fading into fog, straight from the grid. They cannot be hit until they cross the pale line at the top of the window (B3). The sim window is 44 rows on every device, so balance does not depend on screen shape. | `PREVIEW_ROWS`, `src/render/Renderer3D.ts` |
| A10 | `ER` cells | A random minion is chosen by a hash of the run seed, the row and the column, not by the sequential PRNG. The look-ahead and the spawned enemy therefore always agree. | `src/game/rng.ts`, `enemyTypeAt` |
| A12 | Enemy pool full | When a row does not fit in the enemy pool, the whole row waits. The march clock keeps running, so the row appears at the position it would have had, not late. | `src/game/World.ts` |
| A13 | Grid rows in the file | A blank line inside the grid block is an empty row, because editors trim trailing tabs. Empty rows at the end of the grid are dropped with a warning, since they would only delay the win. Trailing empty cells past column 44 are tolerated; content past column 44 is an error. | `src/parsers/markdownMapParser.ts` |
| A14 | Token details | Tokens are case-insensitive. `E41`-`E44` cannot take a second drop (`E42-P7` is an error). HP overrides and gate resistance must be 1 to 1,000,000. `ER` accepts the same `-<hp>` and `-P#` suffixes as other enemies. | `src/parsers/tokens.ts` |
| A15 | Effects in the sim | Hit, kill, goal, cat-death and pickup effects use the 512-slot particle pool inside the sim state, so a replay looks identical. Nothing in the simulation reads them back. | `src/game/Fx.ts` |
| A16 | Until later milestones | Gate cells parse but are not spawned until M7. E4-E8 spawn with their size, HP, speed and pursuit and can be shot, but rockets, smash, charge and HP bars arrive in M6; until then every enemy 8x8 or larger kills cats by contact at the B7 rate. Clone boxes work; the weapon powerups (codes P5-P8) drop nothing until M5. There is no level select until M8: the game starts map 1, moves to the next numbered map after a win, and `?map=0` opens the dev map. | `src/game/Powerup.ts`, `src/game/World.ts`, `src/main.ts` |
| A24 | Clones | Clones are identical, so the swarm state is just their number: clone i stands in formation slot i, and when one dies the outermost slot empties (the re-pack of SPEC 6.2). A box is picked up 0.8 gu outside the outermost ring (B9). | `src/game/Clone.ts`, `PICKUP_MARGIN` |
| A25 | Crowd materials | Cats and big rats use physically based materials with environment lighting. The rat crowd, drawn by the thousand, uses the cheaper Lambert model, with soft shading baked into the vertex colours. Minions and cats cast disc contact shadows; only big rats, the shooter and the walls cast real shadows. | `src/render/Renderer3D.ts`, `shade()` in `models.ts` |
| A26 | HUD in HTML | The status bar and banners are plain HTML over the canvas and ignore pointer events. | `src/game/HUD.ts`, `index.html` |
