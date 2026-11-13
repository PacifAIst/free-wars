import { formatIssue, parseMap } from '../parsers/markdownMapParser';
import type { MapData } from '../types';
import { fwToMapData, parseFw } from './fw';

/** Where the game gets its maps from. Tests supply their own. */
export interface MapSource {
  has(id: string): boolean;
  load(id: string): Promise<MapData>;
}

// PLAN section 6: each built-in map is its own chunk and is fetched on demand,
// so long maps do not slow the first load. The single-file build inlines them.
const files = import.meta.glob<string>('/public/maps/*.md', { query: '?raw', import: 'default' });
// A map saved by the map editor: `public/maps/7.fw` replaces `7.md` (decision A35).
const fwFiles = import.meta.glob<string>('/public/maps/*.fw', { query: '?raw', import: 'default' });

const pathOf = (id: string): string => `/public/maps/${id}.md`;
const fwPathOf = (id: string): string => `/public/maps/${id}.fw`;

export const builtInMaps: MapSource = {
  has(id: string): boolean {
    return fwPathOf(id) in fwFiles || pathOf(id) in files;
  },

  async load(id: string): Promise<MapData> {
    const fwLoader = fwFiles[fwPathOf(id)];
    if (fwLoader) {
      const parsed = parseFw(await fwLoader());
      const map = parsed ? fwToMapData(parsed, id) : null;
      if (!map) throw new Error(`Map ${id}.fw is a wrong file`);
      return map;
    }
    const loader = files[pathOf(id)];
    if (!loader) throw new Error(`There is no built-in map "${id}"`);
    const result = parseMap(await loader());
    if (!result.ok) {
      throw new Error(`Map ${id}.md is invalid:\n${result.errors.map(formatIssue).join('\n')}`);
    }
    for (const warning of result.warnings) console.warn(`[free-wars] ${id}.md ${formatIssue(warning)}`);
    return result.map;
  },
};
