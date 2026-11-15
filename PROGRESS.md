# FREE-WARS — Progress

Status of the build against the goals in `PLAN.md` section 8. This file is the resume point:
read it first when picking the work up again. Updated at every milestone and whenever work pauses.

Last updated: 2026-11-15, after the owner's ninth review (pace, tank bubble, map files).

## Where things stand

The owner compares each build with a reference video and changes rules as he goes. Every change
is recorded in `DESIGN_DECISIONS.md` section 3 (A18 to A38), which overrides the plan where they
disagree.

- **3D look (A20, A32):** three.js, models built from code, walk cycle in the vertex shader, dark
  outline round every character.
- **Rules (A18, A28):** no lives at the goal line; a rat that touches a cat kills it, the shooter
  included; a level starts with one cat; rats march straight for the goal in full-width bands.
- **Sizes and speed (A31, A33):** every unit covers 2 by 2 cells. Enemies march at 12 cells a
  second: a minion crosses the 150 rows in play in 12.5 seconds. Big rats (E4 to E8) have four
  times their table HP.
- **Rails and panels (A29, A31):** powerups ride a rail on each side of the lane and are
  collected by touch. A panel can carry clones or a weapon. The shot-and-crush behaviour of the
  fourth review is kept in the code, switched off (`GATES_ARE_SHOT`), until the owner names the
  item it belongs to.
- **Punches (A33):** a big rat that reaches the swarm winds up for half a second and punches,
  killing the cats nearest its fist: 10 for the fat rat, 15 or 30 for bosses. Arms take turns.
- **HP bars (A33):** every big rat carries a bar with its HP counting down.
- **Weapons (M5, done):** minigun, rocket mode, laser and tank, each with its model, effects,
  sounds and a timer on the HUD. The tank falls in a bubble that only shots open.
- **Music (A35):** `music/0.mp3` on the menus. A map plays the track of its last digit; maps
  ending in 0 play track 10; boss maps play track 11. Looping, at half the sound-effect level by
  default. The files are in the repository (Pixabay and Unminus, no attribution needed).
- **Enemy rockets (A35):** the fat rat, the boss sniper and the robo rat fire rockets down the
  lane; the swarm shoots them down or loses the cats in the blast.
- **Bomb (A35):** a rail item that kills the 18 cats nearest it when touched.
- **Item pictures (A35):** panels and boxes carry pictures, drawn from code in one style.
- **Map editor (A35):** visual editor with templates, `.fw` save, upload, link and test play.
- **Brick walls (A37):** a wall across a rail holds its panels until it is shot down. Every
  fourth placeholder map or so has one on its right rail (maps 3, 7, 11, 14, ...).
- **Night maps (A37):** boss maps are dark by default; any map can be, from the editor.
- **Ninth review (A38):** slower rats, slower fire, faster rail items; enemy rockets cannot be
  shot down; enemies drop nothing; the tank bubble is a map item; punches kill four times as
  many; NEXT MAP button; map files are read by their contents, whatever they are called.
- **Rules, About, credit line (A36):** two pop-ups on the splash screen, and a line along the
  bottom of every screen with the licence and a link to the repository.
- **Screens (A34):** splash menu with volume sliders, clear progress and PLAY; grid of 44 maps
  with locks; pause, defeat and victory panels; a final screen after map 44. Progress and
  volumes are saved in the browser.
- **Maps:** 44 placeholder maps written by `scripts/gen-maps.mjs`. The owner will replace them
  with maps made in the map editor: save `public/maps/<n>.fw` and it takes the place of map n.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Scaffold | Done | Vite, TypeScript strict, three.js, ESLint, Vitest, CI, both builds. |
| M1 Loop, map layer, input | Done | Touch feel still needs a real phone. |
| M2 Map parser | Done | The Excel sample is `public/maps/0.md`. |
| M3 Streaming and core combat | Done, one check open | Frame rate on a low-end Android phone has not been checked. |
| M4 Clones | Done | |
| M5 Weapons and powerups | Done | Minigun, rocket mode, laser, tank and its bubble; weapon boxes and weapon panels. |
| M6 Big enemies | Done | Punches, E6 charge, HP bars, enemy rockets. |
| M7 Gates | Done, one item open | Panels by touch. The shot-and-crush variant waits for the owner to name its item. |
| M8 UI and persistence | Done | Splash, map grid, pause, defeat, victory, final screen, saved progress and volumes, map editor. Best times are not kept. |
| M9 Assets and audio | Done | Models and sound effects are code; music is the owner's MP3 files. |
| M10 Content and balance | Placeholder | 44 generated maps, each won by the test bot. Real maps come from the owner. |
| M11 Hardening and release | Not started | |

## Things the owner should know

- **Boss and fat-rat HP in the generated maps.** At the present speed a rat is on screen for
  about 10 to 13 seconds before it reaches the swarm, and 100 cats deal about 100 damage a
  second. A fat rat with its table HP (800) is only just beatable by a full swarm that does
  nothing else, and a boss with its table HP (8,000 to 40,000) cannot be shot down at all. So
  the generated maps write their own HP on these rats (`E4-320`, `E5-900` and so on). The table
  values are untouched in `constants.ts`; a map that uses a plain `E5` gets 8,000 HP.
- **The bomb kills cats.** The owner wrote "kills 18 units". It was read as the swarm's own
  units, which makes the bomb a trap on the rail. `BOMB_HITS_CATS = false` in `constants.ts`
  turns it into a prize that kills the 18 rats nearest the goal line instead.
- **Rail items move at the rats' speed.** They were doubled with the rats (12 cells a second),
  so a panel stays level with the row it was drawn in. `RAIL_ITEM_SPEED_SPEC` makes them faster.
- **Enemy rocket numbers are mine.** SPEC rockets (200 HP, slower than today's rats) could not
  be shot down at the present pace; see `ENEMY_ROCKETS`.
- **Boss music.** The owner's rule is the last digit. Boss maps were given track 11 because he
  said track 11 sounds like a boss, and maps ending in 0 were given track 10, since 0 is the
  splash screen.
- **Punches and the shooter.** A punch that finds fewer clones than it can kill also kills the
  shooter, which loses the level (owner's rule A18: the shooter is not immune).

## Measurements

- Tests: 247 passing (`npm test`), including a bot that must win each of the 44 maps.
- Browser, Intel UHD integrated graphics, frame rate uncapped: map 1 runs at about 130 fps at
  phone size with device pixel ratio 2. The dev map (a lane full of rats) runs at about 50 fps.
  Not measured again since the weapons were added.
- Build: the single-file build is about 790 KB and opens from `file://`; it plays music when the
  `music` folder sits beside it.

## To-do list from the owner's reviews

Still open:

- Map editor, next steps if wanted: HP and drop of a single rat from the editor (today they
  come only from a template or a hand-edited file), undo, and touch testing on a phone.
- The item that must be shot to release its reward and that kills clones: the owner will name it.
- Enemy quality and animation remain the owner's first concern; waiting for his view of the
  current look. Candidates: more varied minions, a death pose for big rats, richer explosions.
- Real levels and balance, once the editor exists.
- Phone testing.

## Open risks

- **Stress-map frame rate.** A lane full of rats is below 60 fps on integrated graphics and will
  be worse on a low-end phone.
- **Model quality.** Models are assembled from simple solids in code. A further step up would
  need artist-made rigged models loaded as glTF files, which changes the "all art from code"
  rule; that is the owner's call.
- **Balance.** Speed, HP and punches were set by the owner's feel one at a time; together they
  make big rats very strong (see above).

## Screenshots

`screenshots/` in the project folder holds pictures of the current build, taken in headless
Chrome. The folder is not tracked in git.

## Checks that need a person or a real device

- Feel of the drag with a finger on a real phone; the map grid on a narrow phone (11 columns).
- Music loudness against the sound effects, by ear.
- Frame rate on a low-end Android phone: open the hosting build with `?map=0`.

## How the code is laid out

- `src/game/constants.ts`: every tunable. No balance numbers anywhere else.
- `src/game/` (no three.js): `Game.ts` loop and state machine, `Sim.ts` one tick, `World.ts` row
  streaming, `layout.ts` footprints, `Enemy.ts`, `Clone.ts` swarm, contact and punches,
  `Powerup.ts` drops and rewards, `Projectile.ts` bullets, rockets and explosions, `Weapon.ts`
  laser and tank, `Player.ts`, `Collision.ts`, `Pool.ts`, `Fx.ts`, `rng.ts`, `Input.ts`,
  `maps.ts`, `HUD.ts` (status, HP bars, weapon timers), `Screens.ts` (menus and panels),
  `Save.ts` (progress and volumes), `Audio.ts` (sound effects), `Music.ts`, `fw.ts` (the `.fw`
  map file).
- `src/editor/Editor.ts`: the map editor.
- `src/parsers/`: `tokens.ts` (token table), `markdownMapParser.ts`.
- `src/render/`: `Renderer3D.ts`, `models.ts`, `Batch.ts`, `Sparks.ts`, `icons.ts` (item pictures).
- `scripts/gen-maps.mjs`: writes the 44 placeholder maps. `scripts/gen-sprites.mjs`: 2D art.
- `vite.music.ts`: serves the `music` folder in development and copies it into the builds.

## Tooling added on the owner's request

Two Claude Code skill packs are installed for this user: `pixijs-skills` and the
`web-engines` plugin of `gamedev-skills/awesome-gamedev-agent-skills`. The three.js lighting
guidance is applied in `Renderer3D.ts`. The Pixi skills are not in use.

## Repository state

- Local repo at `C:\DOWNLOAD\AI projects\free wars`, branch `main`, remote `origin` set to
  `https://github.com/PacifAIst/free-wars.git`. Nothing has been pushed.
- Not tracked on purpose (see `.gitignore`): `a.png` (third-party reference screenshot), `old/`,
  `map_maker.xlsx` (contains a personal name in its metadata), `FREE-WARS_PLAN_v2.md`.
- `PLAN.md` and `SPEC.md` are unchanged. Where they differ from the build, `DESIGN_DECISIONS.md`
  says so.
