import type { MapData } from '../types';
import { readMapText } from './fw';

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
    // A .fw file wins over a .md file of the same number. Either is read by what is in it,
    // not by what it is called, so a map from the editor works under both names.
    const loader = fwFiles[fwPathOf(id)] ?? files[pathOf(id)];
    if (!loader) throw new Error(`There is no built-in map "${id}"`);
    const result = readMapText(await loader(), id);
    if ('error' in result) throw new Error(`Map ${id} cannot be read: ${result.error}`);
    return result.map;
  },
};
