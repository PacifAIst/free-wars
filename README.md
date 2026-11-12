# FREE-WARS

A 3D fixed-shooter crowd game for the browser. A black cat and its clone swarm hold a 44-column lane
against a marching army of rats. Drag to slide the map; the swarm fires on its own.

Status: in development. See `PROGRESS.md` for what is built, `PLAN.md` for the milestone plan,
`SPEC.md` for the original specification and `DESIGN_DECISIONS.md` for every deviation.

## Play

- Drag left or right: the swarm follows your finger and fires on its own. You start with one black cat.
- Powerups come from the gates along both edges of the lane and from the fat rats. Shoot a gate until it breaks, then catch the box it drops to grow the swarm (+1, +3, +10, +50).
- Rats march straight for the goal. Going to the edge for a powerup leaves the middle open, so choose.
- A rat that touches a cat kills it. Lose every cat and the level is lost.
- Desktop: arrow keys or A/D also slide; P or Escape pauses; Enter or Space confirms.
- The gold line at the bottom is the goal: the first rat to cross it loses the level.
- Add `?map=0` to the address to open the dev map (a stress test, not a balanced level).

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

The game is drawn in 3D with three.js. Every model is built from code in `src/render/models.ts`;
there are no model or texture files. `npm run gen:sprites` draws the 2D user-interface sheet
(icons, portraits, favicon) into `art/ui/`.

## Licence

AGPL-3.0. See `LICENSE`.
