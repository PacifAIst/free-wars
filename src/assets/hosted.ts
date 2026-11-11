// Asset URLs for the hosting build: files in public/ referenced by relative URL,
// so the game works from a domain root, a subfolder or a WebView (decision A4).
export const assetUrls = {
  atlas: './assets/sprites/atlas.png',
  bosses: './assets/sprites/bosses.png',
  lane: './assets/sprites/lane.png',
  barrier: './assets/sprites/barrier.png',
  sceneryFar: './assets/sprites/scenery_far.png',
  sceneryNear: './assets/sprites/scenery_near.png',
  baseline: './assets/sprites/baseline.png',
} as const;

export type AssetUrls = Record<keyof typeof assetUrls, string>;
