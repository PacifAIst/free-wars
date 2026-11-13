import { describe, expect, it } from 'vitest';
import {
  CELL_EMPTY,
  CELL_OVERRIDE_BASE,
  CELL_RANDOM,
  CellEncoder,
  cellSpec,
  parseToken,
} from '../src/parsers/tokens';
import type { CellSpec } from '../src/types';

function ok(raw: string, column = 10): CellSpec {
  const r = parseToken(raw, column);
  if (!r.ok) throw new Error(`expected "${raw}" to parse: ${r.message}`);
  return r.spec;
}

function bad(raw: string, column = 10): string {
  const r = parseToken(raw, column);
  if (r.ok) throw new Error(`expected "${raw}" to be rejected`);
  return r.message;
}

describe('token table (PLAN section 5)', () => {
  it('reads empty cells', () => {
    expect(ok('')).toEqual({ kind: 'empty', type: 0, hp: 0, drop: 0 });
    expect(ok('.')).toEqual({ kind: 'empty', type: 0, hp: 0, drop: 0 });
    expect(ok('   ')).toEqual({ kind: 'empty', type: 0, hp: 0, drop: 0 });
  });

  it('reads E1..E8 as plain enemies', () => {
    for (let t = 1; t <= 8; t++) {
      expect(ok(`E${t}`)).toEqual({ kind: 'enemy', type: t, hp: 0, drop: 0 });
    }
  });

  it('reads E41..E44 as an E4 that drops a clone box +1, +3, +10, +50', () => {
    for (let n = 1; n <= 4; n++) {
      expect(ok(`E4${n}`)).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: n });
    }
  });

  it('reads E5-100 and E7-400 as HP overrides', () => {
    expect(ok('E5-100')).toEqual({ kind: 'enemy', type: 5, hp: 100, drop: 0 });
    expect(ok('E7-400')).toEqual({ kind: 'enemy', type: 7, hp: 400, drop: 0 });
    expect(ok('E4-1')).toEqual({ kind: 'enemy', type: 4, hp: 1, drop: 0 });
  });

  it('reads ER as a random minion', () => {
    expect(ok('ER')).toEqual({ kind: 'random', type: 0, hp: 0, drop: 0 });
    expect(ok('ER-P5')).toEqual({ kind: 'random', type: 0, hp: 0, drop: 5 });
  });

  it('reads authored drops, alone and with an HP override (D9)', () => {
    expect(ok('E4-P8')).toEqual({ kind: 'enemy', type: 4, hp: 0, drop: 8 });
    expect(ok('E7-400-P3')).toEqual({ kind: 'enemy', type: 7, hp: 400, drop: 3 });
    expect(ok('E1-P1')).toEqual({ kind: 'enemy', type: 1, hp: 0, drop: 1 });
    expect(ok('E41-50')).toEqual({ kind: 'enemy', type: 4, hp: 50, drop: 1 });
  });

  it('reads gates in the edge columns only', () => {
    expect(ok('G25', 1)).toEqual({ kind: 'gate', type: 0, hp: 25, drop: 0 });
    expect(ok('G25-P3', 4)).toEqual({ kind: 'gate', type: 0, hp: 25, drop: 3 });
    expect(ok('G1', 41)).toEqual({ kind: 'gate', type: 0, hp: 1, drop: 0 });
    expect(ok('G300-P8', 44)).toEqual({ kind: 'gate', type: 0, hp: 300, drop: 8 });
    expect(bad('G25', 5)).toMatch(/only allowed in columns 1-4 and 41-44/);
    expect(bad('G25', 40)).toMatch(/only allowed in columns/);
  });

  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(ok(' e3 ')).toEqual(ok('E3'));
    expect(ok('er')).toEqual(ok('ER'));
    expect(ok('e7-400-p3')).toEqual(ok('E7-400-P3'));
    expect(ok('g25', 2)).toEqual(ok('G25', 2));
  });

  it('rejects unknown and malformed tokens with a useful message', () => {
    expect(bad('E9')).toMatch(/unknown token "E9"/);
    expect(bad('E0')).toMatch(/unknown token/);
    expect(bad('X1')).toMatch(/unknown token/);
    expect(bad('E1 E1')).toMatch(/unknown token/);
    expect(bad('E45')).toMatch(/unknown token/);
    expect(bad('E5-')).toMatch(/unknown token/);
    expect(bad('E5-P')).toMatch(/unknown token/);
    expect(bad('E5-P3-100')).toMatch(/unknown token/);
    expect(bad('12')).toMatch(/unknown token/);
  });

  it('rejects out-of-range values', () => {
    expect(bad('E4-P10')).toMatch(/drop code P10 is out of range/);
    expect(ok('G1-P9', 1)).toEqual({ kind: 'gate', type: 0, hp: 1, drop: 9 });
    expect(bad('E4-P0')).toMatch(/drop code P0 is out of range/);
    expect(bad('E5-0')).toMatch(/HP override must be at least 1/);
    expect(bad('E5-99999999')).toMatch(/too large/);
    expect(bad('G0', 1)).toMatch(/gate resistance must be at least 1/);
    expect(bad('G5-P12', 1)).toMatch(/drop code P12 is out of range/);
  });

  it('rejects E41..E44 with a second drop', () => {
    expect(bad('E42-P7')).toMatch(/names two drops/);
  });
});

describe('cell encoding', () => {
  it('uses fixed ids for plain cells', () => {
    const enc = new CellEncoder();
    expect(enc.encode(ok(''))).toBe(CELL_EMPTY);
    expect(enc.encode(ok('ER'))).toBe(CELL_RANDOM);
    for (let t = 1; t <= 8; t++) expect(enc.encode(ok(`E${t}`))).toBe(t);
    expect(enc.overrides).toHaveLength(0);
  });

  it('shares one override entry between identical cells', () => {
    const enc = new CellEncoder();
    const a = enc.encode(ok('E5-100'));
    const b = enc.encode(ok('E5-100'));
    const c = enc.encode(ok('E41'));
    const d = enc.encode(ok('G25', 1));
    expect(a).toBe(CELL_OVERRIDE_BASE);
    expect(b).toBe(a);
    expect(c).toBe(CELL_OVERRIDE_BASE + 1);
    expect(d).toBe(CELL_OVERRIDE_BASE + 2);
    expect(enc.overrides).toHaveLength(3);
  });

  it('round-trips every token through an id', () => {
    const enc = new CellEncoder();
    const tokens: [string, number][] = [
      ['', 10],
      ['E1', 10],
      ['E8', 10],
      ['E43', 10],
      ['E5-100', 10],
      ['ER', 10],
      ['ER-P2', 10],
      ['E4-P8', 10],
      ['E7-400-P3', 10],
      ['G25', 1],
      ['G25-P3', 44],
    ];
    const ids = tokens.map(([raw, col]) => enc.encode(ok(raw, col)));
    const map = { overrides: enc.overrides };
    tokens.forEach(([raw, col], i) => {
      expect(cellSpec(map, ids[i])).toEqual(ok(raw, col));
    });
  });

  it('decodes plain ids without allocating', () => {
    const map = { overrides: [] };
    expect(cellSpec(map, 3)).toBe(cellSpec(map, 3));
    expect(cellSpec(map, CELL_EMPTY).kind).toBe('empty');
    expect(cellSpec(map, CELL_RANDOM).kind).toBe('random');
  });
});
