// Asset URLs for the single-file build: the same files inlined as data URIs so
// the game opens from file:// with no network or fetch (decision A4).
import atlas from '../../public/assets/sprites/atlas.png?inline';
import barrier from '../../public/assets/sprites/barrier.png?inline';
import baseline from '../../public/assets/sprites/baseline.png?inline';
import bosses from '../../public/assets/sprites/bosses.png?inline';
import lane from '../../public/assets/sprites/lane.png?inline';
import sceneryFar from '../../public/assets/sprites/scenery_far.png?inline';
import sceneryNear from '../../public/assets/sprites/scenery_near.png?inline';
import type { AssetUrls } from './hosted';

export const assetUrls: AssetUrls = { atlas, bosses, lane, barrier, sceneryFar, sceneryNear, baseline };
