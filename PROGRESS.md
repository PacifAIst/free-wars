# FREE-WARS — Progress

Status of the build against the goals in `PLAN.md` section 8. This file is the resume point:
read it first when picking the work up again. Updated at every milestone and whenever work pauses.

Last updated: 2026-11-11, after M3.

## Goal of the first session

Owner's request: start development following `PLAN.md`, using the reference screenshot only for
genre guidance, with polished casual mobile-game art (not pixel art, nothing copied).

Session target, reached: M0 through M3, so there is a playable core (cat shooting marching rats
on the lane), plus the full sprite set brought forward from M9 because art was asked for
explicitly.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Scaffold | Done | Typecheck, lint, tests and both builds pass. Single-file build opens from `file://` with no console errors. |
| Art pass (from M9) | Done | `scripts/gen-sprites.mjs` draws every sprite as SVG and rasterises it. Two atlases (core, bosses) plus five repeating tiles. `npm run gen:sprites -- --preview <dir>` writes review sheets. |
| M1 Loop, map layer, input | Done | State machine, fixed 60 Hz loop with interpolation, pointer and keyboard input, spring slide clamped at the barriers, lane, walls, two parallax layers, shooter pinned at centre. Touch feel still needs a real phone. |
| M2 Map parser | Done | `tokens.ts` and `markdownMapParser.ts`, typed-array grid, line and column in every message. The Excel sample is `public/maps/0.md` (87 rows). A 44 x 4,444 map parses in well under 200 ms. |
| M3 Streaming and core combat | Done, one check open | Row streaming, pools, E1-E3 marching, bullets (B3), spatial hash, base integrity (B1), win (D5), lose. Big enemies spawn, march and take damage; their behaviours are M6. The low-end Android frame-rate check has not been run. |
| M4 Clones | Not started | Next. |
| M5 Weapons and powerups | Not started | |
| M6 Big enemies | Not started | |
| M7 Gates | Not started | Gate tokens already parse. |
| M8 UI and persistence | Not started | A minimal HUD and banners exist. |
| M9 Assets and audio | Partly brought forward | Sprites done. Audio, PNG size optimisation and the first-paint budget check remain. |
| M10 Content and balance | Not started | `public/maps/1.md` is a first draft for the lone shooter. |
| M11 Hardening and release | Not started | |

## Measurements so far

- Tests: 130 passing (`npm test`). They cover the spring, the loop, the parser and every token,
  streaming, combat, base integrity, win and lose, determinism and JSON round trip.
- Sim cost: a 44 x 4,444 map of full rows runs with pools at fixed size; a tick with 1,850
  enemies alive takes about 0.3 ms in Node (the frame budget is 16.7 ms).
- Browser, Intel UHD integrated graphics, frame rate uncapped, dev map with about 1,900 enemies on
  screen: 216 to 314 fps at 1920 x 1080, about 240 fps at 412 x 915 with device pixel ratio 2.
  JS heap stays between 9 and 13 MB over 40 seconds.
- Both builds were opened in headless Chrome with no console errors or failed requests: the
  single-file build from `file://`, and the hosting build over HTTP from a subfolder.
- Build sizes: hosting build about 185 KB of gzipped JavaScript, core atlas 150 KB, boss atlas
  204 KB (loaded after the menu), tiles 100 KB. The single-file build is 1.26 MB.

## Checks that need a person or a real device

- M1: feel of the map slide with a finger on a real phone (smooth, eases to a stop at both
  barriers). Mouse drag and the 100 ms frame clamp are covered by tests and a headless browser run.
- M3: 30+ fps on a low-end Android phone with the window full of minions. Open the hosting build
  with `?map=0` and wait about 40 seconds. If it falls short, PLAN section 9 names the fallback
  (one batched mesh for minions).

## Next steps, in order

1. M4 Clones: ring formation with clockwise fill and re-pack, barrier squeeze, 4 starting clones
   (B2), half-rate clone fire, cap of 100, weighted clone boxes (B4), contact trades (D12, B7),
   promotion, lose when nobody is left. The white cat sprite and `CLONE_DRAW_SIZE` are ready.
2. M5 to M11 as in `PLAN.md`.
3. In M9: shrink the PNGs (palette quantisation) and confirm the 500 KB first-paint budget.
4. In M10: replace the draft `1.md` with tuned levels from `scripts/gen-maps.mjs`.

## How the code is laid out

- `src/game/constants.ts`: every tunable. No balance numbers anywhere else.
- `src/game/` (no Pixi): `Game.ts` loop and state machine, `Sim.ts` one tick, `World.ts` row
  streaming, `Enemy.ts`, `Projectile.ts`, `Player.ts`, `Collision.ts`, `Pool.ts`, `Fx.ts`,
  `rng.ts`, `Input.ts`, `maps.ts`. `HUD.ts` is the one UI file here and may use Pixi.
- `src/parsers/`: `tokens.ts` (token table), `markdownMapParser.ts`.
- `src/render/`: `Renderer.ts`, `ParticleSet.ts`, `textures.ts`.
- `src/assets/`: asset URLs for the hosting build and the single-file build (`@assets` alias).
- `scripts/gen-sprites.mjs`: all art.

## Repository state

- Local repo at `C:\DOWNLOAD\AI projects\free wars`, branch `main`, remote `origin` set to
  `https://github.com/PacifAIst/free-wars.git`. Nothing has been pushed.
- Not tracked on purpose (see `.gitignore`): `a.png` (third-party reference screenshot), `old/`,
  `map_maker.xlsx` (contains a personal name in its metadata), `FREE-WARS_PLAN_v2.md` (same
  content as `PLAN.md`).
- `SPEC.md` is a copy of `old/FREE-WARS_v1.txt`. That file ends in the middle of section 11.2,
  so the plan's section 5 is the only description of the grid format.
- `PLAN.md` section 7 still says pixel art; decision A1 in `DESIGN_DECISIONS.md` records the
  owner's later choice of cartoon vector art.
