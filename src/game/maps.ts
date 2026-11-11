import { formatIssue, parseMap } from '../parsers/markdownMapParser';
import type { MapData } from '../types';
import { getLayout } from './layout';

/** Where the game gets its maps from. Tests supply their own. */
export interface MapSource {
  has(id: string): boolean;
  load(id: string): Promise<MapData>;
}

// PLAN section 6: each built-in map is its own chunk and is fetched on demand,
// so long maps do not slow the first load. The single-file build inlines them.
const files = import.meta.glob<string>('/public/maps/*.md', { query: '?raw', import: 'default' });

const pathOf = (id: string): string => `/public/maps/${id}.md`;

export const builtInMaps: MapSource = {
  has(id: string): boolean {
    return pathOf(id) in files;
  },

  async load(id: string): Promise<MapData> {
    const loader = files[pathOf(id)];
    if (!loader) throw new Error(`There is no built-in map "${id}"`);
    const result = parseMap(await loader());
    if (!result.ok) {
      throw new Error(`Map ${id}.md is invalid:\n${result.errors.map(formatIssue).join('\n')}`);
    }
    for (const warning of result.warnings) console.warn(`[free-wars] ${id}.md ${formatIssue(warning)}`);
    const { dropped } = getLayout(result.map, 0);
    if (dropped > 0) {
      console.warn(`[free-wars] ${id}.md: ${dropped} enemies overlap a bigger enemy's footprint and were left out`);
    }
    return result.map;
  },
};
