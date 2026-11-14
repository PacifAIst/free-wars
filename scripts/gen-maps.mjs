// Writes the 44 built-in maps, public/maps/1.md to 44.md (PLAN milestone M10).
//
//   node scripts/gen-maps.mjs
//
// These are placeholder levels (the owner will replace them with hand-made maps
// from the map editor): the same recipe at rising strength, so the
// whole game can be played from map 1 to map 44. Each is checked by the test
// bot (tests/combat.test.ts), which must win it. Hand-made maps can replace
// any of them: the game reads whatever is in public/maps.
//
// Recipe. The 44 maps are four districts of 11. A map opens with reward
// panels on the rails, then sends waves: bands of rats from wall to wall, with
// more panels between them. Fat rats join from the fourth map of a district.
// The eleventh map of a district ends with its boss.
//
// Units cover 2 by 2 cells, so rats are written on every second column and
// every second row.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COLS = 44;
const out = fileURLToPath(new URL('../public/maps/', import.meta.url));

const DISTRICTS = ['Back Alley', 'Market Street', 'Sewer Works', 'Rat Citadel'];
const BOSSES = [
  // The table HP of a boss cannot be shot down in the time it takes to cross
  // the lane at the present speeds, so each boss map states its own HP.
  { token: 'E5-900', name: 'The Bruiser' },
  { token: 'E6-850', name: 'The Charger' },
  { token: 'E7-1500', name: 'The Colonel' },
  { token: 'E8-1300', name: 'Robo Rat' },
];
/** Weapon panels, in the order they are introduced: minigun, rocket, laser. */
const WEAPONS = ['P5', 'P7', 'P6'];

function build(n) {
  const district = Math.floor((n - 1) / 11);
  const step = (n - 1) % 11;
  const boss = step === 10;
  const grid = [];
  const row = (r) => {
    while (grid.length <= r) grid.push(Array(COLS).fill(''));
    return grid[r];
  };
  /** A band of rats across the whole lane, `ranks` deep; the front ranks may be tougher. */
  const band = (first, ranks, tough, token) => {
    for (let u = 0; u < ranks; u++) {
      for (let c = 0; c < COLS; c += 2) row(first + u * 2)[c] = u < tough ? token : 'E1';
    }
  };
  /** A fat rat standing in a band: its 16 by 16 footprint is kept clear of minions. */
  const fat = (r, col, token) => {
    for (let y = r; y < r + 16; y++) for (let c = col; c < col + 16; c++) row(y)[c] = '';
    row(r)[col] = token;
  };
  const gates = (r, left, right) => {
    if (left) row(r)[0] = `G1-${left}`;
    if (right) row(r)[COLS - 1] = `G1-${right}`;
  };

  // Opening: four pairs of +10 panels, then a +1 and a +3 so every panel is seen in play.
  for (let i = 0; i < 4; i++) gates(i * 8, 'P3', 'P3');
  gates(32, 'P1', 'P2');

  const waves = 3 + district + Math.floor(step / 4);
  const spacing = 132 - district * 6;
  // Tougher front ranks as the districts go by: sergeants, then elites in the last one.
  const tough = district === 0 ? (step >= 6 ? 1 : 0) : Math.min(2, district);
  const toughToken = district === 3 ? 'E3' : 'E2';
  let r = 112;
  for (let w = 0; w < waves; w++) {
    // A fat rat comes with a single rank beside it, from the fourth map of a district on:
    // it takes a full swarm to bring one down before it reaches the cats.
    const withFat = step >= 3 && w >= 2 && w % 2 === 0;
    const ranks = withFat ? 1 : Math.min(5, 1 + Math.min(w, 2 + district));
    band(r, ranks, withFat ? 0 : Math.min(ranks - 1, tough), toughToken);
    // Its table HP takes more than a full swarm at the present speeds, so the map states a lower one.
    if (withFat) fat(r, 14, (n + w) % 3 === 0 ? 'E4-320-P8' : 'E4-320-P4');
    // Between waves: clones on the left rail, a weapon or more clones on the right.
    const weapon = WEAPONS[(n + w) % WEAPONS.length];
    const offer = (n === 1 && w === 0) || (n + w) % 2 === 0 ? weapon : 'P3';
    const mid = r + ranks * 2 + 30;
    gates(mid, w % 2 === 1 ? 'P4' : 'P3', offer);
    gates(mid + 8, 'P3', w % 2 === 1 ? 'P4' : 'P3');
    // Now and then a bomb follows on one rail: touching it costs 18 cats.
    if (n >= 2 && (n + w) % 3 === 0) gates(mid + 20, w % 2 === 0 ? 'P9' : null, w % 2 === 0 ? null : 'P9');
    r += spacing + ranks * 2;
  }

  let title = `${DISTRICTS[district]} ${step + 1}`;
  if (boss) {
    const { token, name } = BOSSES[district];
    gates(r - 60, 'P4', 'P4');
    gates(r - 52, 'P5', 'P5');
    row(r)[2] = token;
    title = `${DISTRICTS[district]}: ${name}`;
  }

  // Every fourth map or so has a brick wall across its right rail, so the wall is seen in play.
  const wall = step % 4 === 2 ? `- wall-right: ${80 + district * 40}\n` : '';
  const rows = grid.map((cells) => cells.join('\t').replace(/\t+$/, ''));
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  const difficulty = Math.min(5, 1 + district + (step >= 6 ? 1 : 0));
  return `# Map: ${title}

- id: ${n}
- name: ${title}
- difficulty: ${difficulty}
- author: PacifAIst
${wall}- description: ${boss ? 'Boss map. ' : ''}Collect the panels on the rails to grow the swarm and arm it, then sweep each band before a rat reaches the goal line.

## Grid
Columns: 44

\`\`\`
${rows.join('\n')}
\`\`\`
`;
}

mkdirSync(out, { recursive: true });
for (let n = 1; n <= 44; n++) writeFileSync(`${out}${n}.md`, build(n));
console.log('wrote 44 maps to public/maps');
