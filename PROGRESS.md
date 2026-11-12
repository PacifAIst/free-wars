# FREE-WARS — Progress

Status of the build against the goals in `PLAN.md` section 8. This file is the resume point:
read it first when picking the work up again. Updated at every milestone and whenever work pauses.

Last updated: 2026-11-12, after the owner's third review.

## Where things stand

The owner compared the first build (2D, top-down) with the reference video and asked for it to
look and play like the video. That changed the renderer and several rules. All of it is
recorded in `DESIGN_DECISIONS.md` section 3 (A18 to A23), which overrides the plan where they
disagree.

- **3D look (A20, A22):** the game is drawn with three.js: perspective camera behind the swarm,
  lit models built from code, shadows, glowing bullets. Pixi.js is gone.
- **Rules (A18):** no lives at the goal line, contact kills cats including the shooter, enemies
  about 2.7 times faster.
- **Crowd behaviour (A21, A28):** rats march straight for the goal line in full-width bands,
  never overlap, and flow round big rats; a big rat's footprint counts in the grid.
- **Powerups (A27):** only from the side gates and the fat rats. Gates are four cells wide,
  take hits, break and drop a wide box.
- **Start and controls (A28):** one black cat at the start; the swarm follows the finger; every
  cat is killed by a rat that touches its body.
- **Clones (M4) and clone boxes (part of M5)** are in, because contact trades need a swarm.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Scaffold | Done | Vite, TypeScript strict, three.js, Howler, ESLint, Vitest, CI, both builds. |
| M1 Loop, map layer, input | Done | State machine, fixed 60 Hz loop with interpolation, drag and keyboard input, spring slide clamped at the walls. Touch feel still needs a real phone. |
| M2 Map parser | Done | `tokens.ts`, `markdownMapParser.ts`, typed-array grid, line and column in every message. The Excel sample is `public/maps/0.md`. |
| M3 Streaming and core combat | Done, one check open | Row streaming, pools, bullets (B3), spatial hash, win (D5), loss at the goal line (A18). Frame rate on a low-end Android phone has not been checked. |
| M4 Clones | Done | Ring formation, wall squeeze, 4 starting clones, half-rate fire, cap of 100, contact trades (A18, B7), promotion, loss when no cat is left. Tests cover slots at 1, 6, 7 and 100 clones, re-pack and trades. |
| M5 Weapons and powerups | Started | Falling clone boxes, weighted rolls (B4) and pickup (B8, B9) work. Minigun, laser, rocket and tank are not built; their drop codes drop nothing yet. |
| M6 Big enemies | Started | E4-E8 have 3D models, pursuit, footprints and rate-limited contact kills. Rockets, smash, charge and HP bars are not built. |
| M7 Gates | Mostly done | Gates in the edge strips: resistance as HP, bullet blocking, drop on break, harmless to cats. Brought forward because powerups now come from them (A27). |
| M8 UI and persistence | Not started | Minimal HTML HUD and banners exist. Needed: level select with the 44 maps, locked except the next one, shown after a win; best times; settings; save. |
| M9 Assets and audio | Changed | No art files ship any more: models are code. Audio remains. |
| M10 Content and balance | Not started | `public/maps/1.md` is a draft: gates first, then full-width bands 1 to 5 rows deep and one fat sniper rat. A simple bot wins it in about 50 seconds on three seeds. |
| M11 Hardening and release | Not started | |

## Measurements

- Tests: 170 passing (`npm test`). They cover the spring, the loop, the parser and every token,
  streaming, footprints, gates, enemy collision, clones, contact trades, boxes, win and loss,
  determinism and JSON round trip, and a bot that must win map 1.
- Browser, Intel UHD integrated graphics, frame rate uncapped:
  map 1 runs at about 100 to 200 fps at phone size with device pixel ratio 2.
  The dev map, a stress test with about 2,700 rats in view, runs at 34 to 58 fps.
- Build: the single-file build is about 630 KB (160 KB gzipped) and needs no other file.

## Open risks

- **Stress-map frame rate.** A lane full of rats is below 60 fps on integrated graphics and will
  be worse on a low-end phone. Real levels hold far fewer rats. If it matters, the fix is to draw
  crowd rats as camera-facing pictures rendered once from the 3D model at start-up; from this
  fixed camera they would look the same and cost a fraction.
- **Model quality.** Models are assembled from simple solids in code. A further step up would
  need artist-made rigged models with walk animations, loaded as glTF files. That would change
  the "all art from code" rule in PLAN section 10, so it is the owner's call.
- **Balance** is only checked by the bot on map 1. Speed, clone boxes and block sizes will need
  tuning together in M10.

## Screenshots

`screenshots/` in the project folder holds pictures of the current build, taken by playing the
start of map 1 with the keyboard in headless Chrome. The folder is not tracked in git.

## Checks that need a person or a real device

- Feel of the map slide with a finger on a real phone.
- Frame rate on a low-end Android phone: open the hosting build with `?map=0`.
- Whether the 3D look, the rat models and the pace now match what the owner wants.

## Next steps, in order

1. Owner review of the 3D build.
2. Finish M5 (minigun, laser, rocket, tank) and M6 (rockets, smash, charge, HP bars).
3. M7 gates, M8 level select and saving, then M9 to M11 as in `PLAN.md`.

## How the code is laid out

- `src/game/constants.ts`: every tunable. No balance numbers anywhere else.
- `src/game/` (no three.js): `Game.ts` loop and state machine, `Sim.ts` one tick, `World.ts` row
  streaming, `layout.ts` footprints in the grid, `Enemy.ts` movement and pursuit, `Clone.ts`
  swarm and contact, `Powerup.ts`, `Projectile.ts`, `Player.ts`, `Collision.ts` spatial hash and
  enemy separation, `Pool.ts`, `Fx.ts`, `rng.ts`, `Input.ts`, `maps.ts`, `HUD.ts` (HTML).
- `src/parsers/`: `tokens.ts` (token table), `markdownMapParser.ts`.
- `src/render/`: `Renderer3D.ts` (scene, camera, instanced drawing), `models.ts` (all 3D models).
- `scripts/gen-sprites.mjs`: 2D user-interface art, written to `art/ui/`.

## Tooling added on the owner's request

Two Claude Code skill packs are installed for this user: `pixijs-skills` and the
`web-engines` plugin of `gamedev-skills/awesome-gamedev-agent-skills` (three.js scene setup,
glTF loading, materials and lighting). The three.js lighting guidance is applied in
`Renderer3D.ts`. The Pixi skills are not in use, because the game no longer uses Pixi.

## Repository state

- Local repo at `C:\DOWNLOAD\AI projects\free wars`, branch `main`, remote `origin` set to
  `https://github.com/PacifAIst/free-wars.git`. Nothing has been pushed.
- Not tracked on purpose (see `.gitignore`): `a.png` (third-party reference screenshot), `old/`,
  `map_maker.xlsx` (contains a personal name in its metadata), `FREE-WARS_PLAN_v2.md` (same
  content as `PLAN.md`).
- `PLAN.md` and `SPEC.md` are unchanged. Where they differ from the build, `DESIGN_DECISIONS.md`
  says so.
