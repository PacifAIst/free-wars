import { assetUrls } from '@assets';
import { ImageSource, Rectangle, Texture } from 'pixi.js';
import atlasData from '../../public/assets/sprites/atlas.json';
import bossData from '../../public/assets/sprites/bosses.json';

// Textures are built from plain <img> elements instead of the Pixi asset loader.
// That loader needs fetch and workers, which are blocked under file://, so this
// one code path serves both builds (decision A3).

export type CoreFrame = keyof typeof atlasData.frames;
export type BossFrame = keyof typeof bossData.frames;

interface FrameData {
  frame: { x: number; y: number; w: number; h: number };
}

export interface CoreTextures {
  sprites: Record<CoreFrame, Texture>;
  lane: Texture;
  barrier: Texture;
  sceneryFar: Texture;
  sceneryNear: Texture;
  baseline: Texture;
}

export type BossTextures = Record<BossFrame, Texture>;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

async function loadSource(url: string, repeat: boolean): Promise<ImageSource> {
  const img = await loadImage(url);
  return new ImageSource({
    resource: img,
    // Sprites are drawn well below their texture size on phones; mipmaps keep them clean.
    autoGenerateMipmaps: true,
    scaleMode: 'linear',
    addressMode: repeat ? 'repeat' : 'clamp-to-edge',
  });
}

function sliceAtlas<K extends string>(source: ImageSource, frames: Record<K, FrameData>): Record<K, Texture> {
  const out = {} as Record<K, Texture>;
  for (const name of Object.keys(frames) as K[]) {
    const { x, y, w, h } = frames[name].frame;
    out[name] = new Texture({ source, frame: new Rectangle(x, y, w, h) });
  }
  return out;
}

async function loadTile(url: string): Promise<Texture> {
  return new Texture({ source: await loadSource(url, true) });
}

/** Everything needed for the first frame. */
export async function loadCoreTextures(): Promise<CoreTextures> {
  const [atlas, lane, barrier, sceneryFar, sceneryNear, baseline] = await Promise.all([
    loadSource(assetUrls.atlas, false),
    loadTile(assetUrls.lane),
    loadTile(assetUrls.barrier),
    loadTile(assetUrls.sceneryFar),
    loadTile(assetUrls.sceneryNear),
    loadTile(assetUrls.baseline),
  ]);
  return { sprites: sliceAtlas(atlas, atlasData.frames), lane, barrier, sceneryFar, sceneryNear, baseline };
}

/** Boss sprites (E5-E8). Large, so they load after the menu is on screen. */
export async function loadBossTextures(): Promise<BossTextures> {
  return sliceAtlas(await loadSource(assetUrls.bosses, false), bossData.frames);
}
