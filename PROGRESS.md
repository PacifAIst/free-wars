# FREE-WARS — Progress

Status of the build against the goals in `PLAN.md` section 8. This file is the resume point:
read it first when picking the work up again. Updated at every milestone and whenever work pauses.

Last updated: 2026-11-11, after M1.

## Goal of the current session

Owner's request: start development following `PLAN.md`, using the reference screenshot only for
genre guidance, with polished casual mobile-game art (not pixel art, nothing copied).

Session target: M0 through M3, so there is a playable core (cat shooting marching rats on the
lane), plus the full sprite set brought forward from M9 because art was asked for explicitly.

## Milestones

| Milestone | State | Notes |
|---|---|---|
| M0 Scaffold | Done, committed (`2c73886`) | Typecheck, lint, tests and both builds pass. Single-file build opened from `file://` in headless Chrome with no console errors. Canvas resizes with the window. |
| Art pass (from M9) | Done, committed | `scripts/gen-sprites.mjs` draws every sprite as SVG and rasterises it. Two atlases (core, bosses) plus five repeating tiles. `npm run gen:sprites -- --preview <dir>` writes review sheets. |
| M1 Loop, map layer, input | Done, committed | State machine, fixed 60 Hz loop with interpolation, pointer and keyboard input, spring slide clamped at the barriers, lane, walls, two parallax layers, shooter pinned at centre. Checked in headless Chrome in landscape and portrait. Touch feel still needs a real phone. |
| M2 Map parser | Not started | |
| M3 Streaming and core combat | Not started | |
| M4 Clones | Not started | |
| M5 Weapons and powerups | Not started | |
| M6 Big enemies | Not started | |
| M7 Gates | Not started | |
| M8 UI and persistence | Not started | |
| M9 Assets and audio | Partly brought forward | Sprites done early. Audio, PNG size optimisation and the first-paint budget check remain. |
| M10 Content and balance | Not started | |
| M11 Hardening and release | Not started | |

## Next steps, in order

1. M2: `src/parsers/tokens.ts` and `markdownMapParser.ts`, typed-array grid, tests for every
   token, padding, rejection rules and message positions. Save the Excel sample as
   `public/maps/0.md` (87 grid rows, already extracted from `map_maker.xlsx`).
2. M3: row streaming in `World.ts`, pools, E1 to E3 marching, bullets, spatial hash, base
   integrity, win and lose, minimal HUD, and a first draft `public/maps/1.md` to play.
3. Update this file and `DESIGN_DECISIONS.md`, commit after each milestone.

## Decisions taken so far that are not in PLAN.md

Recorded in `DESIGN_DECISIONS.md` section 3 (A1 to A8). The main ones:

- A1: art is cartoon vector style, per the owner's request, replacing the plan's pixel art.
- A3: no Pixi asset loader, so the same code runs from a host and from `file://`.
- A6: the shooter sits 8 gu above the base line so clone rings fit below it.
- A7: the map follows the finger when dragging; keys move the shooter in the key's direction.

Planned but not yet recorded (add to `DESIGN_DECISIONS.md` when implemented):

- Portrait screens show extra rows above the 44-row window as a dimmed preview drawn straight
  from the grid. The sim window stays 44 rows on every device, so balance does not depend on
  screen shape.
- `ER` cells are resolved by a hash of seed, row and column, so the preview and the spawn agree.
- Until M8 adds the level select, the dev map is reached with `?map=0` in the URL.

## Repository state

- Local repo at `C:\DOWNLOAD\AI projects\free wars`, branch `main`, remote `origin` set to
  `https://github.com/PacifAIst/free-wars.git`. Nothing has been pushed.
- Not tracked on purpose (see `.gitignore`): `a.png` (third-party reference screenshot), `old/`,
  `map_maker.xlsx` (contains a personal name in its metadata), `FREE-WARS_PLAN_v2.md` (same
  content as `PLAN.md`).
- `SPEC.md` is a copy of `old/FREE-WARS_v1.txt`. That file ends in the middle of section 11.2,
  so the plan's section 5 is the only description of the grid format.

## Checks that need a person or a real device

- M1: feel of the map slide with a finger on a real phone (smooth, eases to a stop at both
  barriers). Mouse drag and the 100 ms frame clamp are covered by tests and a headless browser run.
- Expected from M3: frame rate on a low-end Android phone with the window full of minions.
