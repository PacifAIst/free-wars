import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLS } from '../src/game/constants';
import { formatIssue, parseMap, validateCustomMapId } from '../src/parsers/markdownMapParser';
import { cellSpec } from '../src/parsers/tokens';
import type { CellSpec, MapData, ParseIssue } from '../src/types';

const HEADER = `# Map: Test map

- id: test-1
- name: Test map
- difficulty: 2
- author: tester
- description: A map for tests.
`;

/** Builds a map file around the given grid lines. */
function file(gridLines: string[], extra = ''): string {
  return `${HEADER}\n## Grid\nColumns: 44\n${extra}\n\`\`\`\n${gridLines.join('\n')}\n\`\`\`\n`;
}

const row = (...cells: string[]): string => cells.join('\t');
const fullRow = (token: string): string => Array.from({ length: COLS }, () => token).join('\t');

function parseOk(text: string): { map: MapData; warnings: ParseIssue[] } {
  const r = parseMap(text);
  if (!r.ok) throw new Error(`expected success, got: ${r.errors.map(formatIssue).join('; ')}`);
  return r;
}

function parseBad(text: string): ParseIssue[] {
  const r = parseMap(text);
  if (r.ok) throw new Error('expected the map to be rejected');
  return r.errors;
}

const at = (map: MapData, r: number, c: number): CellSpec => cellSpec(map, map.cells[r * COLS + c]);

describe('header', () => {
  it('reads every header field', () => {
    const { map, warnings } = parseOk(file([row('E1')]));
    expect(map).toMatchObject({
      id: 'test-1',
      title: 'Test map',
      name: 'Test map',
      difficulty: 2,
      author: 'tester',
      description: 'A map for tests.',
      columns: 44,
      rows: 1,
    });
    expect(warnings).toEqual([]);
  });

  it('requires an id and reports where', () => {
    const errors = parseBad(file([row('E1')]).replace('- id: test-1\n', ''));
    expect(errors).toEqual([{ line: 1, column: 1, message: 'missing "- id:" in the header' }]);
  });

  it('warns about a bad or missing difficulty instead of failing', () => {
    const a = parseOk(file([row('E1')]).replace('difficulty: 2', 'difficulty: 9'));
    expect(a.map.difficulty).toBe(1);
    expect(a.warnings.map((w) => w.message).join()).toMatch(/difficulty "9"/);
    const b = parseOk(file([row('E1')]).replace('- difficulty: 2\n', ''));
    expect(b.warnings.map((w) => w.message).join()).toMatch(/missing "- difficulty:"/);
  });

  it('warns about unknown header fields with their line', () => {
    const { warnings } = parseOk(file([row('E1')]).replace('- author: tester', '- colour: blue'));
    expect(warnings).toEqual([{ line: 6, column: 1, message: 'unknown header field "colour"' }]);
  });

  it('falls back to the title when the name is missing', () => {
    const { map } = parseOk(file([row('E1')]).replace('- name: Test map\n', ''));
    expect(map.name).toBe('Test map');
  });
});

describe('grid', () => {
  it('reads tab-separated rows; line 1 is row 0', () => {
    const { map } = parseOk(file([row('E1', 'E2', 'E3'), row('', 'E4')]));
    expect(map.rows).toBe(2);
    expect(map.cells).toHaveLength(2 * COLS);
    expect(at(map, 0, 0).type).toBe(1);
    expect(at(map, 0, 1).type).toBe(2);
    expect(at(map, 0, 2).type).toBe(3);
    expect(at(map, 1, 0).kind).toBe('empty');
    expect(at(map, 1, 1).type).toBe(4);
  });

  it('skips an optional 1..44 header row', () => {
    const numbers = Array.from({ length: COLS }, (_, i) => String(i + 1)).join('\t');
    const { map } = parseOk(file([numbers, fullRow('E1')]));
    expect(map.rows).toBe(1);
    expect(at(map, 0, 43).type).toBe(1);
  });

  it('pads short rows with empty cells', () => {
    const { map, warnings } = parseOk(file([row('E1', 'E1'), fullRow('E2')]));
    expect(warnings).toEqual([]);
    expect(at(map, 0, 1).type).toBe(1);
    for (let c = 2; c < COLS; c++) expect(at(map, 0, c).kind).toBe('empty');
    expect(at(map, 1, 43).type).toBe(2);
  });

  it('treats a blank line inside the block as an empty row', () => {
    const { map } = parseOk(file([row('E1'), '', '', row('E2')]));
    expect(map.rows).toBe(4);
    expect(at(map, 1, 0).kind).toBe('empty');
    expect(at(map, 3, 0).type).toBe(2);
  });

  it('reads `.` as an empty cell', () => {
    const { map } = parseOk(file([row('.', 'E1', '.')]));
    expect(at(map, 0, 0).kind).toBe('empty');
    expect(at(map, 0, 1).type).toBe(1);
  });

  it('drops empty rows at the end with a warning', () => {
    const { map, warnings } = parseOk(file([row('E1'), '', row('.', '.')]));
    expect(map.rows).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/dropped 2 empty row/);
  });

  it('tolerates trailing empty cells beyond column 44', () => {
    const { map } = parseOk(file([`${fullRow('E1')}\t\t`]));
    expect(map.rows).toBe(1);
  });

  it('rejects rows with content beyond column 44', () => {
    const errors = parseBad(file([`${fullRow('E1')}\tE1`]));
    expect(errors).toEqual([{ line: 13, column: 45, message: 'row has 45 cells; the lane is 44 columns wide' }]);
  });

  it('has no row limit', () => {
    const lines = Array.from({ length: 300 }, () => row('E1'));
    expect(parseOk(file(lines)).map.rows).toBe(300);
  });

  it('accepts Windows line endings and a byte-order mark', () => {
    const text = `\uFEFF${file([row('E1', 'E2'), row('E3')]).replace(/\n/g, '\r\n')}`;
    const { map, warnings } = parseOk(text);
    expect(warnings).toEqual([]);
    expect(map.id).toBe('test-1');
    expect(map.rows).toBe(2);
    expect(at(map, 0, 1).type).toBe(2);
    expect(at(map, 1, 0).type).toBe(3);
  });

  it('treats a Rows mismatch as a warning, not an error', () => {
    const { map, warnings } = parseOk(file([row('E1'), row('E1')], 'Rows: 44'));
    expect(map.rows).toBe(2);
    expect(warnings).toEqual([
      { line: 11, column: 1, message: '"Rows: 44" does not match the 2 rows in the grid; using 2' },
    ]);
    expect(parseOk(file([row('E1'), row('E1')], 'Rows: 2')).warnings).toEqual([]);
  });

  it('requires Columns to be 44', () => {
    const errors = parseBad(file([row('E1')]).replace('Columns: 44', 'Columns: 40'));
    expect(errors).toEqual([{ line: 10, column: 1, message: 'Columns must be 44, found "40"' }]);
  });

  it('warns when the Columns line is missing', () => {
    const { warnings } = parseOk(file([row('E1')]).replace('Columns: 44\n', ''));
    expect(warnings.map((w) => w.message).join()).toMatch(/missing "Columns: 44"/);
  });

  it('warns when the block is not closed', () => {
    const text = file([row('E1'), row('E2')]).replace(/```\n$/, '');
    const { map, warnings } = parseOk(text);
    expect(map.rows).toBe(2);
    expect(warnings.map((w) => w.message).join()).toMatch(/not closed/);
  });
});

describe('Markdown table rows', () => {
  it('accepts pipe-separated rows inside the block', () => {
    const { map } = parseOk(file(['| E1 | E2 |  | E3 |', '| . | E4-P8 |']));
    expect(map.rows).toBe(2);
    expect(at(map, 0, 0).type).toBe(1);
    expect(at(map, 0, 1).type).toBe(2);
    expect(at(map, 0, 2).kind).toBe('empty');
    expect(at(map, 0, 3).type).toBe(3);
    expect(at(map, 1, 1)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 8 });
  });

  it('accepts a plain Markdown table with header and separator rows', () => {
    const text = `${HEADER}\n## Grid\nColumns: 44\n\n| 1 | 2 | 3 |\n|---|:-:|--:|\n| E1 | E2 | E3 |\n| ER |  | G5 |\n\nNotes after the table are ignored.\n`;
    const errors = parseMap(text);
    // G5 in column 3 is legal (edge columns are 1-4).
    expect(errors.ok).toBe(true);
    const { map } = parseOk(text);
    expect(map.rows).toBe(2);
    expect(at(map, 0, 2).type).toBe(3);
    expect(at(map, 1, 0).kind).toBe('random');
    expect(at(map, 1, 2)).toEqual({ kind: 'gate', type: 0, hp: 5, drop: 0 });
  });
});

describe('errors', () => {
  it('reports the file line and grid column of a bad token', () => {
    const errors = parseBad(file([fullRow('E1'), row('E1', 'E1', 'E1', 'E1', 'E9')]));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 14, column: 5 });
    expect(formatIssue(errors[0])).toMatch(/^line 14, col 5: unknown token "E9"/);
  });

  it('reports every bad cell, each with its own position', () => {
    const errors = parseBad(file([row('E1', 'Q', 'E1', 'G5', 'G5'), row('E4-P10')]));
    expect(errors.map((e) => [e.line, e.column])).toEqual([
      [13, 2],
      [13, 5],
      [14, 1],
    ]);
    expect(errors[1].message).toMatch(/only allowed in columns/);
  });

  it('rejects a gate outside the edge columns even after the same token was legal', () => {
    const cells = Array.from({ length: COLS }, () => '');
    cells[0] = 'G9';
    cells[20] = 'G9';
    cells[43] = 'G9';
    const errors = parseBad(file([cells.join('\t')]));
    expect(errors).toHaveLength(1);
    expect(errors[0].column).toBe(21);
  });

  it('caps the number of reported errors', () => {
    const errors = parseBad(file(Array.from({ length: 10 }, () => fullRow('zz'))));
    expect(errors.length).toBe(51);
    expect(errors[50].message).toMatch(/too many errors/);
  });

  it('rejects a file without a grid section', () => {
    const errors = parseBad(HEADER);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('missing "## Grid" section');
    expect(errors[0].line).toBeGreaterThan(1);
  });

  it('rejects a grid section without a grid', () => {
    const errors = parseBad(`${HEADER}\n## Grid\nColumns: 44\n`);
    expect(errors).toEqual([
      { line: 9, column: 1, message: 'the "## Grid" section has no grid: paste the rows inside a ``` block' },
    ]);
  });

  it('rejects an empty grid', () => {
    const errors = parseBad(file(['', row('.', '.')]));
    expect(errors.map((e) => e.message)).toEqual(['the grid has no enemies or gates']);
  });

  it('rejects a second grid block', () => {
    const text = `${file([row('E1')])}\n\`\`\`\nE1\n\`\`\`\n`;
    expect(parseBad(text)[0].message).toBe('a map can only have one grid block');
  });

  it('gives every message a line and a column', () => {
    const texts = [
      HEADER,
      file([row('nope')]),
      file([row('E1')]).replace('- id: test-1\n', ''),
      file([row('E1')]).replace('Columns: 44', 'Columns: 4'),
      file([`${fullRow('E1')}\tE1`]),
    ];
    for (const text of texts) {
      for (const issue of parseBad(text)) {
        expect(issue.line).toBeGreaterThanOrEqual(1);
        expect(issue.column).toBeGreaterThanOrEqual(1);
        expect(formatIssue(issue)).toMatch(/^line \d+, col \d+: \S/);
      }
    }
  });
});

describe("the owner's pasted sample (public/maps/0.md)", () => {
  const text = readFileSync(fileURLToPath(new URL('../public/maps/0.md', import.meta.url)), 'utf8');

  it('parses without errors or warnings', () => {
    const { map, warnings } = parseOk(text);
    expect(warnings).toEqual([]);
    expect(map.id).toBe('0');
    expect(map.rows).toBe(87);
    expect(map.cells).toHaveLength(87 * COLS);
  });

  it('decodes the special tokens of the sample', () => {
    const { map } = parseOk(text);
    // Sheet row 28 is grid row 26 (the 1..44 header row is skipped).
    const r = 26;
    expect(at(map, r, 0)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 1 });
    expect(at(map, r, 1)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 2 });
    expect(at(map, r, 2)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 3 });
    expect(at(map, r, 3)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 4 });
    expect(at(map, r, 4)).toEqual({ kind: 'enemy', type: 5, hp: 100, drop: 0 });
    expect(at(map, r, 5)).toEqual({ kind: 'random', type: 0, hp: 0, drop: 0 });
    expect(at(map, r, 6).type).toBe(1);
    expect(at(map, r, 42)).toEqual({ kind: 'enemy', type: 5, hp: 100, drop: 0 });
    expect(at(map, r, 43).kind).toBe('random');
    // Sheet row 34: E7-400 in columns 5 and 44.
    expect(at(map, 32, 4)).toEqual({ kind: 'enemy', type: 7, hp: 400, drop: 0 });
    expect(at(map, 32, 43)).toEqual({ kind: 'enemy', type: 7, hp: 400, drop: 0 });
    // Bosses in column 22 of sheet rows 58, 64 and 82.
    expect(at(map, 56, 21).type).toBe(5);
    expect(at(map, 62, 21).type).toBe(6);
    expect(at(map, 80, 21).type).toBe(8);
    // Sergeants and elites.
    expect(at(map, 17, 0).type).toBe(2);
    expect(at(map, 22, 0).type).toBe(3);
  });

  it('keeps the override table small', () => {
    const { map } = parseOk(text);
    // E41, E42, E43, E44, E5-100, E7-400.
    expect(map.overrides).toHaveLength(6);
  });
});

describe('scale', () => {
  it('parses a 44 x 4,444 map in under 200 ms', () => {
    const tokens = ['E1', 'E1', 'E2', 'E3', '', 'ER', 'E1', 'E41', 'E5-100', 'E1'];
    const lines: string[] = [];
    for (let r = 0; r < 4444; r++) {
      const cells: string[] = [];
      for (let c = 0; c < COLS; c++) cells.push(tokens[(r * 7 + c * 3) % tokens.length]);
      lines.push(cells.join('\t'));
    }
    const text = file(lines);

    // Best of three, so a garbage-collection pause does not fail the build.
    let best = Infinity;
    let map: MapData | null = null;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      map = parseOk(text).map;
      best = Math.min(best, performance.now() - start);
    }
    expect(map?.rows).toBe(4444);
    expect(map?.cells).toHaveLength(4444 * COLS);
    // One Uint16 per cell: about 391 KB for the whole map.
    expect(map?.cells.byteLength).toBe(4444 * COLS * 2);
    expect(map?.overrides).toHaveLength(2);
    expect(best).toBeLessThan(200);
  });
});

describe('custom map ids (PLAN section 5)', () => {
  it('rejects 0 to 44, with or without .md', () => {
    for (const id of ['0', '1', '44', '07', ' 12 ', '3.md', '44.MD']) {
      expect(validateCustomMapId(id)).toMatch(/reserved for built-in levels/);
    }
  });

  it('rejects an empty id', () => {
    expect(validateCustomMapId('  ')).toBe('custom maps need an id');
  });

  it('accepts anything else', () => {
    for (const id of ['45', '100', 'custom-abc', 'my map', '1a', '-1']) {
      expect(validateCustomMapId(id)).toBeNull();
    }
  });
});
