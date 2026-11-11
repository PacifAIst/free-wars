// Markdown map parser (PLAN section 5, SPEC section 11.2).
//
// A map file has a header and a grid:
//
//     # Map: The beginning of the war
//
//     - id: 1
//     - name: The beginning of the war
//     - difficulty: 1
//     - author: someone            (optional)
//     - description: First contact.
//
//     ## Grid
//     Columns: 44
//     Rows: 80                     (optional; a mismatch is only a warning)
//
//     ```
//     <rows pasted straight from Excel: cells separated by tabs>
//     ```
//
// Grid line 1 enters the lane first. The row count is whatever the file holds.

import { BUILT_IN_LEVELS, COLS } from '../game/constants';
import type { MapData, ParseIssue, ParseResult } from '../types';
import { CellEncoder, parseToken } from './tokens';

/** Parsing stops collecting after this many errors; one broken paste can produce thousands. */
const MAX_ERRORS = 50;

const HEADER_KEYS = ['id', 'name', 'difficulty', 'author', 'description'] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

const TITLE_LINE = /^#\s+(?:Map:\s*)?(.*)$/i;
const FIELD_LINE = /^[-*]\s*([A-Za-z]+)\s*:\s*(.*)$/;
const GRID_HEADING = /^##\s+Grid\s*$/i;
const COLUMNS_LINE = /^Columns\s*:\s*(\S+)\s*$/i;
const ROWS_LINE = /^Rows\s*:\s*(\S+)/i;
const TABLE_SEPARATOR_CELL = /^:?-+:?$/;

export function formatIssue(issue: ParseIssue): string {
  return `line ${issue.line}, col ${issue.column}: ${issue.message}`;
}

/**
 * Custom uploads may not use the ids of the built-in levels or of the dev map:
 * 0 to 44, with or without a `.md` suffix. Returns an error message, or null if
 * the id is acceptable.
 */
export function validateCustomMapId(id: string): string | null {
  const bare = id.trim().replace(/\.md$/i, '');
  if (bare === '') return 'custom maps need an id';
  if (/^\d+$/.test(bare) && Number(bare) <= BUILT_IN_LEVELS) {
    return `id "${id.trim()}" is reserved for built-in levels (0-${BUILT_IN_LEVELS}); use another id`;
  }
  return null;
}

/** Splits one grid line into cells: tab-separated (Excel) or a Markdown table row. */
function splitRow(line: string): string[] | null {
  if (line.includes('\t')) return line.split('\t');
  const trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    const cells = trimmed.split('|');
    cells.shift();
    if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
    // The `|---|---|` row under a table header carries no cells.
    if (cells.length > 0 && cells.every((c) => TABLE_SEPARATOR_CELL.test(c.trim()))) return null;
    return cells;
  }
  // No separator at all: a row whose only content is in column 1.
  return [line];
}

/** True for the optional `1 2 3 ... 44` header row that Excel sheets often carry. */
function isColumnHeaderRow(cells: string[]): boolean {
  let seen = 0;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i].trim();
    if (cell === '') continue;
    if (cell !== String(i + 1)) return false;
    seen++;
  }
  return seen > 0;
}

export function parseMap(text: string): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const error = (line: number, column: number, message: string): void => {
    if (errors.length < MAX_ERRORS) errors.push({ line, column, message });
    else if (errors.length === MAX_ERRORS) errors.push({ line, column, message: 'too many errors; stopping here' });
  };
  const warn = (line: number, column: number, message: string): void => {
    warnings.push({ line, column, message });
  };

  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split('\n');
  const header: Partial<Record<HeaderKey, string>> = {};
  let title = '';

  // Upper bound on rows is the line count, so the grid buffer never has to grow.
  const cells = new Uint16Array(lines.length * COLS);
  const encoder = new CellEncoder();
  /** Cache from raw cell text to id (or to an error message). Maps repeat a handful of tokens. */
  const tokenCache = new Map<string, number | string>();

  let section: 'header' | 'grid' = 'header';
  let inFence = false;
  let sawFence = false;
  let inTable = false;
  let gridDone = false;
  let rows = 0;
  let lastFilledRow = -1;
  let firstRowSeen = false;
  let declaredRows: number | null = null;
  let declaredRowsLine = 0;
  let sawColumns = false;
  let gridHeadingLine = 0;

  const addRow = (rowCells: string[], lineNo: number): void => {
    if (!firstRowSeen) {
      firstRowSeen = true;
      if (isColumnHeaderRow(rowCells)) return;
    }
    let count = rowCells.length;
    while (count > 0 && rowCells[count - 1].trim() === '') count--;
    if (count > COLS) {
      error(lineNo, COLS + 1, `row has ${count} cells; the lane is ${COLS} columns wide`);
      return;
    }
    const base = rows * COLS;
    for (let c = 0; c < count; c++) {
      let raw = rowCells[c];
      if (raw.length > 0 && (raw.charCodeAt(0) <= 32 || raw.charCodeAt(raw.length - 1) <= 32)) raw = raw.trim();
      if (raw === '' || raw === '.') continue;
      const column = c + 1;
      // Gate tokens depend on the column, so they are never cached.
      const cacheable = raw.charCodeAt(0) !== 71 && raw.charCodeAt(0) !== 103;
      let id = cacheable ? tokenCache.get(raw) : undefined;
      if (id === undefined) {
        const result = parseToken(raw, column);
        if (result.ok) {
          id = encoder.encode(result.spec);
          if (id < 0) id = 'too many different cell overrides in one map';
        } else {
          id = result.message;
        }
        if (cacheable) tokenCache.set(raw, id);
      }
      if (typeof id === 'string') {
        error(lineNo, column, id);
      } else if (id !== 0) {
        cells[base + c] = id;
        lastFilledRow = rows;
      }
    }
    rows++;
  };

  for (let i = 0; i < lines.length && errors.length <= MAX_ERRORS; i++) {
    const lineNo = i + 1;
    let line = lines[i];
    if (line.charCodeAt(line.length - 1) === 13) line = line.slice(0, -1);

    if (inFence) {
      if (line.trimStart().startsWith('```')) {
        inFence = false;
        gridDone = true;
        continue;
      }
      // A blank line inside the block is an empty row: editors trim trailing tabs.
      const rowCells = splitRow(line);
      if (rowCells) addRow(rowCells, lineNo);
      continue;
    }

    const trimmed = line.trim();

    if (section === 'header') {
      if (GRID_HEADING.test(trimmed)) {
        section = 'grid';
        gridHeadingLine = lineNo;
        continue;
      }
      if (trimmed === '') continue;
      const titleMatch = title === '' && !trimmed.startsWith('##') ? TITLE_LINE.exec(trimmed) : null;
      if (titleMatch) {
        title = titleMatch[1].trim();
        continue;
      }
      const field = FIELD_LINE.exec(trimmed);
      if (field) {
        const key = field[1].toLowerCase();
        const value = field[2].trim().replace(/^"(.*)"$/, '$1');
        if ((HEADER_KEYS as readonly string[]).includes(key)) {
          if (header[key as HeaderKey] !== undefined) warn(lineNo, 1, `"${key}" is given twice; using the last value`);
          header[key as HeaderKey] = value;
        } else {
          warn(lineNo, 1, `unknown header field "${field[1]}"`);
        }
      }
      continue;
    }

    // Grid section, outside the fenced block.
    if (trimmed.startsWith('```')) {
      if (gridDone) {
        error(lineNo, 1, 'a map can only have one grid block');
        continue;
      }
      inFence = true;
      sawFence = true;
      continue;
    }
    if (trimmed.startsWith('|') && !gridDone) {
      // A plain Markdown table, without a fenced block around it.
      inTable = true;
      const rowCells = splitRow(line);
      if (rowCells) addRow(rowCells, lineNo);
      continue;
    }
    if (inTable) {
      if (trimmed === '') {
        inTable = false;
        gridDone = true;
      }
      continue;
    }
    if (trimmed === '') continue;
    const columnsMatch = COLUMNS_LINE.exec(trimmed);
    if (columnsMatch) {
      sawColumns = true;
      if (columnsMatch[1] !== String(COLS)) error(lineNo, 1, `Columns must be ${COLS}, found "${columnsMatch[1]}"`);
      continue;
    }
    const rowsMatch = ROWS_LINE.exec(trimmed);
    if (rowsMatch) {
      const n = Number(rowsMatch[1]);
      if (Number.isInteger(n) && n > 0) {
        declaredRows = n;
        declaredRowsLine = lineNo;
      } else {
        warn(lineNo, 1, `ignoring "Rows: ${rowsMatch[1]}": not a positive whole number`);
      }
    }
  }

  const lastLine = lines.length;
  if (section === 'header') {
    error(lastLine, 1, 'missing "## Grid" section');
  } else if (!sawFence && rows === 0 && !inTable && !gridDone) {
    error(gridHeadingLine, 1, 'the "## Grid" section has no grid: paste the rows inside a ``` block');
  } else {
    if (inFence) warn(lastLine, 1, 'the grid block is not closed with ```; read to the end of the file');
    // Trailing empty rows only delay the win, so they are dropped.
    const kept = lastFilledRow + 1;
    if (kept === 0) {
      // Only worth reporting when the rows themselves were fine.
      if (errors.length === 0) error(gridHeadingLine, 1, 'the grid has no enemies or gates');
    } else if (kept < rows) {
      warn(lastLine, 1, `dropped ${rows - kept} empty row(s) at the end of the grid`);
    }
    rows = kept;
    if (!sawColumns) warn(gridHeadingLine, 1, `missing "Columns: ${COLS}" line; assuming ${COLS}`);
    if (declaredRows !== null && declaredRows !== rows && rows > 0) {
      warn(declaredRowsLine, 1, `"Rows: ${declaredRows}" does not match the ${rows} rows in the grid; using ${rows}`);
    }
  }

  if (header.id === undefined || header.id === '') error(1, 1, 'missing "- id:" in the header');

  let difficulty = 1;
  if (header.difficulty === undefined) {
    warn(1, 1, 'missing "- difficulty:"; assuming 1');
  } else {
    const d = Number(header.difficulty);
    if (Number.isInteger(d) && d >= 1 && d <= 5) difficulty = d;
    else warn(1, 1, `difficulty "${header.difficulty}" is not a whole number from 1 to 5; assuming 1`);
  }

  const name = header.name || title;
  if (name === '') warn(1, 1, 'the map has no name; add "# Map: <title>" or "- name:"');

  if (errors.length > 0) return { ok: false, errors };

  const map: MapData = {
    id: header.id as string,
    title: title || name || 'Untitled',
    name: name || 'Untitled',
    difficulty,
    author: header.author ?? '',
    description: header.description ?? '',
    columns: COLS,
    rows,
    cells: cells.slice(0, rows * COLS),
    overrides: encoder.overrides,
  };
  return { ok: true, map, warnings };
}
