# FREE-WARS

A 3D fixed-shooter crowd game for the browser. A black cat and its clone swarm hold a 44-column lane
against a marching army of rats. Drag to move the swarm; it fires on its own.

Status: in development. See `PROGRESS.md` for what is built, `PLAN.md` for the milestone plan,
`SPEC.md` for the original specification and `DESIGN_DECISIONS.md` for every deviation.

## Play

- PLAY opens the grid of 44 maps. Map 1 is open; winning a map opens the next. Progress is saved in the browser.
- Drag left or right: the swarm follows your finger and fires on its own. You start with one black cat.
- Powerups ride the rails on both sides of the lane. Step onto a rail and let a panel reach you: more cats (+1, +3, +10, +50) or a weapon (minigun, laser, rocket, tank).
- Fat rats drop a box when they die; catch it. A tank comes in a bubble: shoot it open.
- Rats march straight for the goal. Going to a rail leaves the lane open, so choose.
- A rat that touches a cat kills it. A big rat punches: get out of its reach or bring it down first. Lose every cat and the level is lost.
- The gold line at the bottom is the goal: the first rat to cross it loses the level.
- Desktop: arrow keys or A/D also move the swarm; P or Escape pauses; Enter or Space presses the main button; M mutes.
- Add `?map=0` to the address to open the dev map (a stress test, not a balanced level).

## Music

Put MP3 files named `0.mp3` to `11.mp3` in a `music` folder at the project root: `0` plays on the
menus, `1` to `11` in the levels. The folder is not part of the repository. Without it the game
plays with sound effects only.

## Maps

`public/maps/1.md` to `44.md` are placeholder levels written by `node scripts/gen-maps.mjs`.
Replace any of them with your own; the format is described in `SPEC.md` section 11.

## Develop

```
npm ci
npm run dev          # Vite dev server
npm test             # Vitest
npm run check        # typecheck, lint, tests and both builds
```

## Build

```
npm run build          # dist/         static files for any host, subfolder or WebView
npm run build:single   # dist-single/  one index.html that opens by double-click
```

## Art

The game is drawn in 3D with three.js. Every model is built from code in `src/render/models.ts`,
and every sound effect is synthesised in `src/game/Audio.ts`; there are no model or texture files. `npm run gen:sprites` draws the 2D user-interface sheet
(icons, portraits, favicon) into `art/ui/`.

## Licence

AGPL-3.0. See `LICENSE`.
