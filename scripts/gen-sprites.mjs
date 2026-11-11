// Generates every sprite in the game from code (PLAN section 7, decisions A1 and A2).
//
//   npm run gen:sprites
//
// Each sprite is written as SVG and rasterised with resvg. Output:
//   public/assets/sprites/atlas.png + atlas.json   characters, projectiles, icons, effects
//   public/assets/sprites/{lane,barrier,scenery_far,scenery_near,baseline}.png   repeating tiles
//   public/favicon.ico
//
// The art is original: casual mobile-game style with chunky outlines, soft
// gradients and ground shadows. Nothing here is traced or copied from another game.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'sprites');

// --- Small SVG helpers ---------------------------------------------------------

const INK = '#1b1736'; // outline colour used by every sprite
let idCounter = 0;
const uid = (prefix) => `${prefix}${idCounter++}`;
const f = (n) => Number(n.toFixed(2));

const lin = (id, c1, c2, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
const rad = (id, c1, c2, cx = 0.36, cy = 0.28, r = 0.9) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
const glow = (id, color, a0 = 1, mid = 0.45) =>
  `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${color}" stop-opacity="${a0}"/><stop offset="${mid}" stop-color="${color}" stop-opacity="${f(a0 * 0.45)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

/** Deterministic PRNG so the generated art is identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shadow = (cx, cy, rx, ry, opacity = 0.32) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#0b0a1f" opacity="${opacity}"/>`;

function paw(cx, cy, s, fill, opacity = 1) {
  const toes = [
    [-11, -6, 4.2, 5.4],
    [-4, -12, 4.4, 5.8],
    [4, -12, 4.4, 5.8],
    [11, -6, 4.2, 5.4],
  ]
    .map(([x, y, rx, ry]) => `<ellipse cx="${f(cx + x * s)}" cy="${f(cy + y * s)}" rx="${f(rx * s)}" ry="${f(ry * s)}"/>`)
    .join('');
  return `<g fill="${fill}" opacity="${opacity}"><path d="M${f(cx - 9 * s)} ${f(cy + 4 * s)} Q${cx} ${f(cy - 9 * s)} ${f(cx + 9 * s)} ${f(cy + 4 * s)} Q${f(cx + 10 * s)} ${f(cy + 12 * s)} ${cx} ${f(cy + 10 * s)} Q${f(cx - 10 * s)} ${f(cy + 12 * s)} ${f(cx - 9 * s)} ${f(cy + 4 * s)} Z"/>${toes}</g>`;
}

// --- Cats (seen from behind: they face the enemy) ---------------------------------

function cat({ fur1, fur2, furMid, band1, band2, stripe, rim }) {
  const g = uid('cat');
  const tail = 'M62 80 C 88 85, 95 58, 82 43';
  return `
<defs>${rad(`${g}f`, fur1, fur2)}${lin(`${g}b`, band1, band2)}${lin(`${g}m`, '#d7deea', '#8d99ae', 1, 0)}</defs>
${shadow(50, 91, 27, 7.5)}
<path d="${tail}" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
<path d="${tail}" fill="none" stroke="${furMid}" stroke-width="8" stroke-linecap="round"/>
<path d="M84 49 L82 43" fill="none" stroke="${rim}" stroke-width="8" stroke-linecap="round"/>
<ellipse cx="39" cy="90" rx="7.5" ry="4.5" fill="${furMid}" stroke="${INK}" stroke-width="3.5"/>
<ellipse cx="61" cy="90" rx="7.5" ry="4.5" fill="${furMid}" stroke="${INK}" stroke-width="3.5"/>
<ellipse cx="50" cy="73" rx="20.5" ry="17.5" fill="url(#${g}f)" stroke="${INK}" stroke-width="4"/>
<rect x="45" y="3" width="10" height="26" rx="3" fill="url(#${g}m)" stroke="${INK}" stroke-width="3.5"/>
<rect x="42.5" y="2" width="15" height="7.5" rx="2.5" fill="#ffd23f" stroke="${INK}" stroke-width="3.2"/>
<path d="M28 37 L23 8 L47 23 Z" fill="${furMid}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M72 37 L77 8 L53 23 Z" fill="${furMid}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M30.5 29 L28.5 15 L39.5 22.5 Z" fill="${rim}" opacity=".55"/>
<path d="M69.5 29 L71.5 15 L60.5 22.5 Z" fill="${rim}" opacity=".35"/>
<ellipse cx="50" cy="44" rx="27" ry="23.5" fill="url(#${g}f)" stroke="${INK}" stroke-width="4"/>
<g fill="none" stroke="${stripe}" stroke-width="3.6" stroke-linecap="round" opacity=".85">
  <path d="M50 25 v9"/><path d="M41 27.5 l2 8"/><path d="M59 27.5 l-2 8"/>
</g>
<ellipse cx="38" cy="35" rx="10" ry="5.5" fill="#fff" opacity=".16" transform="rotate(-24 38 35)"/>
<path d="M24.5 54 Q50 69 75.5 54 L74.5 64 Q50 79 25.5 64 Z" fill="url(#${g}b)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<path d="M69 60 L86 62 L77 70 Z" fill="${band2}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M68 63 L79 77 L66 72 Z" fill="${band1}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M31 59.5 Q50 70 69 59.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>`;
}

const catBlack = () =>
  cat({ fur1: '#4a4e73', fur2: '#1c1d33', furMid: '#2c2e4a', band1: '#ff6b6b', band2: '#d62839', stripe: '#15162a', rim: '#7d83b8' });
const catWhite = () =>
  cat({ fur1: '#ffffff', fur2: '#e2d6c1', furMid: '#f3ead9', band1: '#5cc8ff', band2: '#2f80ed', stripe: '#c9b79c', rim: '#ffffff' });

// --- Rats (seen from the front: they march at the player) -------------------------

const SMALL = { bodyRx: 19, bodyRy: 17, bodyCy: 73, headRx: 25, headRy: 22, headCy: 45 };
const FAT = { bodyRx: 31, bodyRy: 25, bodyCy: 68, headRx: 23, headRy: 20, headCy: 38 };
const HUGE = { bodyRx: 34, bodyRy: 27, bodyCy: 67, headRx: 22, headRy: 19, headCy: 36 };

/**
 * Parametric rat. `shape` is one of the presets above. The `extra*` strings are
 * accessory layers and receive the head geometry via the `acc` callbacks.
 */
function rat(o) {
  const g = uid('rat');
  const { bodyRx, bodyRy, bodyCy, headRx, headRy, headCy } = o.shape;
  const k = headRx / 25;
  const hx = 50;
  const hy = headCy;
  const tailColor = o.tail ?? '#f28ba8';
  const earIn = o.earIn ?? '#ff9eb5';
  const iris = o.iris ?? '#e5383b';
  const geo = { hx, hy, k, bodyRx, bodyRy, bodyCy, g };
  const part = (fn) => (fn ? fn(geo) : '');

  const tx = Math.max(7, 44 - bodyRx - 12);
  const tailPath = `M${f(50 - bodyRx + 6)} ${f(bodyCy + bodyRy * 0.5)} C ${f(tx + 2)} ${f(bodyCy + bodyRy * 0.85)}, ${f(tx - 1)} ${f(bodyCy + 2)}, ${f(tx + 5)} ${f(bodyCy - bodyRy * 0.75)}`;
  const tailW = bodyRx > 25 ? 5.5 : 6;

  let eyes;
  if (o.eyes === 'goggles') {
    eyes = `
<rect x="${f(hx - 25 * k)}" y="${f(hy - 7.5 * k)}" width="${f(50 * k)}" height="${f(7 * k)}" fill="#3d2c2e" stroke="${INK}" stroke-width="2.5"/>
<circle cx="${f(hx - 11 * k)}" cy="${f(hy - 3 * k)}" r="${f(9 * k)}" fill="url(#${g}l)" stroke="${INK}" stroke-width="3.2"/>
<circle cx="${f(hx + 11 * k)}" cy="${f(hy - 3 * k)}" r="${f(9 * k)}" fill="url(#${g}l)" stroke="${INK}" stroke-width="3.2"/>
<path d="M${f(hx - 15 * k)} ${f(hy - 6 * k)} l${f(5 * k)} ${f(-3 * k)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
<path d="M${f(hx + 7 * k)} ${f(hy - 6 * k)} l${f(5 * k)} ${f(-3 * k)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`;
  } else if (o.eyes === 'visor') {
    eyes = `
<rect x="${f(hx - 20 * k)}" y="${f(hy - 10 * k)}" width="${f(40 * k)}" height="${f(13 * k)}" rx="${f(6 * k)}" fill="#1a1c2c" stroke="${INK}" stroke-width="3"/>
<circle cx="${f(hx - 10 * k)}" cy="${f(hy - 3.5 * k)}" r="${f(8 * k)}" fill="url(#${g}e)"/>
<circle cx="${f(hx + 10 * k)}" cy="${f(hy - 3.5 * k)}" r="${f(8 * k)}" fill="url(#${g}e)"/>
<circle cx="${f(hx - 10 * k)}" cy="${f(hy - 3.5 * k)}" r="${f(3.4 * k)}" fill="#ff3b3b"/>
<circle cx="${f(hx + 10 * k)}" cy="${f(hy - 3.5 * k)}" r="${f(3.4 * k)}" fill="#ff3b3b"/>
<circle cx="${f(hx - 11 * k)}" cy="${f(hy - 4.5 * k)}" r="${f(1.2 * k)}" fill="#fff"/>
<circle cx="${f(hx + 9 * k)}" cy="${f(hy - 4.5 * k)}" r="${f(1.2 * k)}" fill="#fff"/>`;
  } else {
    const eye = (s) => `
<ellipse cx="${f(hx + s * 11 * k)}" cy="${f(hy - 3 * k)}" rx="${f(6.4 * k)}" ry="${f(7.4 * k)}" fill="#fff" stroke="${INK}" stroke-width="2.6"/>
<circle cx="${f(hx + s * 9.6 * k)}" cy="${f(hy - 1.6 * k)}" r="${f(3.9 * k)}" fill="${iris}"/>
<circle cx="${f(hx + s * 9.6 * k)}" cy="${f(hy - 1.6 * k)}" r="${f(1.9 * k)}" fill="${INK}"/>
<circle cx="${f(hx + s * 10.8 * k)}" cy="${f(hy - 3.4 * k)}" r="${f(1.3 * k)}" fill="#fff"/>
<path d="M${f(hx + s * 20 * k)} ${f(hy - 14 * k)} L${f(hx + s * 4.5 * k)} ${f(hy - 8.5 * k)}" stroke="${INK}" stroke-width="${f(4.2 * k)}" stroke-linecap="round"/>`;
    eyes = eye(-1) + eye(1);
    if (o.eyes === 'patch') {
      eyes += `
<path d="M${f(hx - 25 * k)} ${f(hy - 12 * k)} L${f(hx + 24 * k)} ${f(hy - 1 * k)}" stroke="${INK}" stroke-width="${f(2.6 * k)}"/>
<ellipse cx="${f(hx - 11 * k)}" cy="${f(hy - 3 * k)}" rx="${f(8 * k)}" ry="${f(8.6 * k)}" fill="#22223b" stroke="${INK}" stroke-width="2.6"/>`;
    }
  }

  const mouth =
    o.mouth === 'grille'
      ? `
<rect x="${f(hx - 10 * k)}" y="${f(hy + 5 * k)}" width="${f(20 * k)}" height="${f(11 * k)}" rx="${f(3 * k)}" fill="#2a2d43" stroke="${INK}" stroke-width="3"/>
<path d="M${f(hx - 5 * k)} ${f(hy + 6 * k)} v${f(9 * k)} M${hx} ${f(hy + 6 * k)} v${f(9 * k)} M${f(hx + 5 * k)} ${f(hy + 6 * k)} v${f(9 * k)}" stroke="#8d99ae" stroke-width="1.6"/>
<circle cx="${hx}" cy="${f(hy + 3.5 * k)}" r="${f(2.6 * k)}" fill="#ff3b3b" stroke="${INK}" stroke-width="1.6"/>`
      : `
<path d="M${f(hx - 10 * k)} ${f(hy + 10 * k)} L${f(hx - 23 * k)} ${f(hy + 6 * k)} M${f(hx - 10 * k)} ${f(hy + 12 * k)} L${f(hx - 22 * k)} ${f(hy + 14 * k)} M${f(hx + 10 * k)} ${f(hy + 10 * k)} L${f(hx + 23 * k)} ${f(hy + 6 * k)} M${f(hx + 10 * k)} ${f(hy + 12 * k)} L${f(hx + 22 * k)} ${f(hy + 14 * k)}" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>
<rect x="${f(hx - 4.2 * k)}" y="${f(hy + 13 * k)}" width="${f(8.4 * k)}" height="${f(8 * k)}" rx="1.6" fill="#fff" stroke="${INK}" stroke-width="2.4"/>
<path d="M${hx} ${f(hy + 14 * k)} v${f(6.5 * k)}" stroke="${INK}" stroke-width="1.4"/>
<ellipse cx="${hx}" cy="${f(hy + 10.5 * k)}" rx="${f(12.5 * k)}" ry="${f(8.6 * k)}" fill="${o.belly}" stroke="${INK}" stroke-width="3"/>
<ellipse cx="${hx}" cy="${f(hy + 7.6 * k)}" rx="${f(5.2 * k)}" ry="${f(3.9 * k)}" fill="#ff7096" stroke="${INK}" stroke-width="2.4"/>
<ellipse cx="${f(hx - 1.4 * k)}" cy="${f(hy + 6.6 * k)}" rx="${f(1.8 * k)}" ry="${f(1.1 * k)}" fill="#fff" opacity=".7"/>`;

  const ear = (s) => `
<circle cx="${f(hx + s * 24 * k)}" cy="${f(hy - 18 * k)}" r="${f(13 * k)}" fill="${o.furMid}" stroke="${INK}" stroke-width="4"/>
<circle cx="${f(hx + s * 24 * k)}" cy="${f(hy - 17.5 * k)}" r="${f(7.6 * k)}" fill="${earIn}"/>`;

  return `
<defs>${rad(`${g}f`, o.fur1, o.fur2)}${rad(`${g}l`, '#c8f7ff', '#1f9fd1', 0.35, 0.3, 0.8)}${glow(`${g}e`, '#ff3b3b', 0.95, 0.4)}${o.defs ? o.defs(g) : ''}</defs>
${shadow(50, f(Math.min(93, bodyCy + bodyRy + 1.5)), f(Math.min(46, bodyRx * 1.35)), f(5.5 + bodyRx * 0.1))}
<path d="${tailPath}" fill="none" stroke="${INK}" stroke-width="${tailW + 6}" stroke-linecap="round"/>
<path d="${tailPath}" fill="none" stroke="${tailColor}" stroke-width="${tailW}" stroke-linecap="round"/>
${part(o.back)}
<ellipse cx="${f(50 - bodyRx * 0.5)}" cy="${f(Math.min(94, bodyCy + bodyRy - 0.5))}" rx="8" ry="4.6" fill="${tailColor}" stroke="${INK}" stroke-width="3.2"/>
<ellipse cx="${f(50 + bodyRx * 0.5)}" cy="${f(Math.min(94, bodyCy + bodyRy - 0.5))}" rx="8" ry="4.6" fill="${tailColor}" stroke="${INK}" stroke-width="3.2"/>
<ellipse cx="50" cy="${bodyCy}" rx="${bodyRx}" ry="${bodyRy}" fill="url(#${g}f)" stroke="${INK}" stroke-width="4"/>
<ellipse cx="50" cy="${f(bodyCy + bodyRy * 0.16)}" rx="${f(bodyRx * 0.62)}" ry="${f(bodyRy * 0.7)}" fill="${o.belly}" opacity=".92"/>
${part(o.body)}
<ellipse cx="${f(50 - bodyRx + 1)}" cy="${f(bodyCy - 2)}" rx="${f(5.5 + bodyRx * 0.1)}" ry="${f(7 + bodyRx * 0.12)}" fill="${o.furMid}" stroke="${INK}" stroke-width="3.5"/>
<ellipse cx="${f(50 + bodyRx - 1)}" cy="${f(bodyCy - 2)}" rx="${f(5.5 + bodyRx * 0.1)}" ry="${f(7 + bodyRx * 0.12)}" fill="${o.furMid}" stroke="${INK}" stroke-width="3.5"/>
${part(o.arms)}
${ear(-1)}${ear(1)}
<ellipse cx="${hx}" cy="${hy}" rx="${headRx}" ry="${headRy}" fill="url(#${g}f)" stroke="${INK}" stroke-width="4"/>
<ellipse cx="${f(hx - 9 * k)}" cy="${f(hy - 13 * k)}" rx="${f(9 * k)}" ry="${f(4.5 * k)}" fill="#fff" opacity=".2" transform="rotate(-18 ${f(hx - 9 * k)} ${f(hy - 13 * k)})"/>
${mouth}
${eyes}
${part(o.head)}
${part(o.front)}`;
}

/** Dome helmet that follows the head ellipse. */
function helmet({ hx, hy, k }, fillId, extra = '') {
  const l = hx - 27 * k;
  const r = hx + 27 * k;
  const top = hy - 27 * k;
  const brim = hy - 7 * k;
  return `
<path d="M${f(l)} ${f(brim)} Q${f(l - 1 * k)} ${f(top)} ${hx} ${f(top)} Q${f(r + 1 * k)} ${f(top)} ${f(r)} ${f(brim)} Q${hx} ${f(brim - 8 * k)} ${f(l)} ${f(brim)} Z" fill="url(#${fillId})" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M${f(hx - 17 * k)} ${f(hy - 19 * k)} Q${f(hx - 9 * k)} ${f(hy - 24 * k)} ${f(hx + 1 * k)} ${f(hy - 24 * k)}" fill="none" stroke="#fff" stroke-width="${f(3 * k)}" stroke-linecap="round" opacity=".45"/>
${extra}`;
}

/** Shoulder-mounted rocket tube pointing down at the player. */
function launcher(x, y, w, h, c1, c2, angle = 10) {
  const g = uid('tube');
  return `
<g transform="rotate(${angle} ${x + w / 2} ${y + h / 2})">
<defs>${lin(g, c1, c2, 1, 0)}</defs>
<path d="M${x + 2} ${y + h - 2} L${x + w / 2} ${y + h + w * 0.75} L${x + w - 2} ${y + h - 2} Z" fill="#ff4d4d" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${f(w * 0.28)}" fill="url(#${g})" stroke="${INK}" stroke-width="3.6"/>
<rect x="${x - 1.5}" y="${y + h - 9}" width="${w + 3}" height="7" rx="2.5" fill="#22223b" stroke="${INK}" stroke-width="2.4"/>
<rect x="${x - 1.5}" y="${y + 3}" width="${w + 3}" height="6" rx="2.5" fill="#22223b" stroke="${INK}" stroke-width="2.4"/>
<path d="M${x + w * 0.3} ${y + 14} v${h - 30}" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".35"/>
</g>`;
}

const ratE1 = () =>
  rat({ shape: SMALL, fur1: '#dfe3ee', fur2: '#8e94a8', furMid: '#b4b9c9', belly: '#f4f1ea' });

const ratE2 = () =>
  rat({
    shape: SMALL,
    fur1: '#e8b27a',
    fur2: '#9c5f31',
    furMid: '#c4854f',
    belly: '#fbe3c4',
    defs: (g) => lin(`${g}h`, '#a6e05a', '#3f8f29'),
    head: (geo) =>
      helmet(
        geo,
        `${geo.g}h`,
        `<path d="M${geo.hx - 7} ${geo.hy - 15} l7 -5 l7 5 M${geo.hx - 7} ${geo.hy - 10} l7 -5 l7 5" fill="none" stroke="#ffe066" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
      ),
  });

const ratE3 = () =>
  rat({
    shape: SMALL,
    fur1: '#b07bd8',
    fur2: '#4c2a78',
    furMid: '#7d4fb0',
    belly: '#e9d5ff',
    iris: '#ffb703',
    earIn: '#ffb3d1',
    defs: (g) => lin(`${g}h`, '#fff0a0', '#e09b00') + lin(`${g}p`, '#ff7b7b', '#c1121f'),
    head: (geo) =>
      `<path d="M${geo.hx - 8} ${geo.hy - 24} C ${geo.hx - 10} ${geo.hy - 46}, ${geo.hx + 10} ${geo.hy - 46}, ${geo.hx + 8} ${geo.hy - 24} Z" fill="url(#${geo.g}p)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>` +
      helmet(
        geo,
        `${geo.g}h`,
        `<rect x="${geo.hx - 3.5}" y="${geo.hy - 22}" width="7" height="13" rx="2" fill="#c1121f" stroke="${INK}" stroke-width="2.4"/>`,
      ),
    body: ({ bodyRx, bodyCy }) =>
      `<ellipse cx="${50 - bodyRx + 4}" cy="${bodyCy - 11}" rx="8" ry="5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/><ellipse cx="${50 + bodyRx - 4}" cy="${bodyCy - 11}" rx="8" ry="5" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>`,
  });

const ratE4 = () =>
  rat({
    shape: FAT,
    fur1: '#c9a27e',
    fur2: '#6c4a32',
    furMid: '#99704f',
    belly: '#f1dcc0',
    eyes: 'goggles',
    body: ({ bodyCy }) =>
      `<path d="M24 ${bodyCy - 16} L74 ${bodyCy + 16}" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M24 ${bodyCy - 16} L74 ${bodyCy + 16}" stroke="#5a4634" stroke-width="5" stroke-linecap="round"/>`,
    front: () => launcher(70, 20, 17, 50, '#9fb352', '#55662a', 9),
  });

const ratE5 = () =>
  rat({
    shape: HUGE,
    fur1: '#f0a56c',
    fur2: '#9a4a1f',
    furMid: '#c97440',
    belly: '#ffe2c2',
    defs: (g) => lin(`${g}c`, '#fff3a6', '#f0a500') + rad(`${g}v`, '#ff8585', '#b3101d'),
    body: ({ bodyRx, bodyCy, g }) => `
<path d="M${f(50 - bodyRx * 0.93)} ${bodyCy + 6} Q50 ${bodyCy + 16} ${f(50 + bodyRx * 0.93)} ${bodyCy + 6} L${f(50 + bodyRx * 0.86)} ${bodyCy + 15} Q50 ${bodyCy + 25} ${f(50 - bodyRx * 0.86)} ${bodyCy + 15} Z" fill="url(#${g}c)" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
<circle cx="50" cy="${bodyCy + 16}" r="8" fill="url(#${g}c)" stroke="${INK}" stroke-width="3.2"/>
<circle cx="50" cy="${bodyCy + 16}" r="3.4" fill="#e5383b" stroke="${INK}" stroke-width="1.8"/>`,
    arms: ({ bodyRx, bodyCy, g }) =>
      [-1, 1]
        .map(
          (s) => `
<circle cx="${50 + s * (bodyRx + 2)}" cy="${bodyCy - 1}" r="12.5" fill="url(#${g}v)" stroke="${INK}" stroke-width="4"/>
<rect x="${f(50 + s * (bodyRx + 2) - 9)}" y="${bodyCy - 17}" width="18" height="6.5" rx="3" fill="#fff" stroke="${INK}" stroke-width="2.6"/>
<ellipse cx="${50 + s * (bodyRx + 2) - 4}" cy="${bodyCy - 5}" rx="4" ry="2.4" fill="#fff" opacity=".45"/>`,
        )
        .join(''),
    head: ({ hx, hy, g }) => `
<path d="M${hx - 15} ${hy - 13} L${hx - 19} ${hy - 31} L${hx - 8} ${hy - 22} L${hx} ${hy - 35} L${hx + 8} ${hy - 22} L${hx + 19} ${hy - 31} L${hx + 15} ${hy - 13} Q${hx} ${hy - 18} ${hx - 15} ${hy - 13} Z" fill="url(#${g}c)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<circle cx="${hx}" cy="${hy - 21}" r="2.8" fill="#e5383b" stroke="${INK}" stroke-width="1.6"/>
<circle cx="${hx - 11}" cy="${hy - 19.5}" r="2" fill="#4cc9f0" stroke="${INK}" stroke-width="1.4"/>
<circle cx="${hx + 11}" cy="${hy - 19.5}" r="2" fill="#4cc9f0" stroke="${INK}" stroke-width="1.4"/>`,
  });

const ratE6 = () =>
  rat({
    shape: HUGE,
    fur1: '#ff7a85',
    fur2: '#8f1d2c',
    furMid: '#c93a4b',
    belly: '#ffd0d5',
    iris: '#ffb703',
    defs: (g) => lin(`${g}h`, '#e3e9f2', '#77839a') + lin(`${g}i`, '#fffaf0', '#d6c29a') + lin(`${g}s`, '#aab4c6', '#4d566b'),
    back: ({ hx, hy, g }) =>
      [-1, 1]
        .map(
          (s) =>
            `<path d="M${hx + s * 17} ${hy - 9} C ${hx + s * 33} ${hy - 10}, ${hx + s * 42} ${hy - 20}, ${hx + s * 40} ${hy - 35} C ${hx + s * 32} ${hy - 27}, ${hx + s * 24} ${hy - 24}, ${hx + s * 13} ${hy - 21} Z" fill="url(#${g}i)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>`,
        )
        .join(''),
    body: ({ bodyRx, bodyCy, g }) =>
      [-1, 1]
        .map(
          (s) => `
<path d="M${50 + s * (bodyRx - 15)} ${bodyCy - 20} l${s * 4} -9 l${s * 4} 8 l${s * 5} -7 l${s * 3} 10 Z" fill="#e3e9f2" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
<ellipse cx="${50 + s * (bodyRx - 6)}" cy="${bodyCy - 14}" rx="12" ry="7.5" fill="url(#${g}s)" stroke="${INK}" stroke-width="3.4"/>`,
        )
        .join(''),
    head: (geo) =>
      helmet(geo, `${geo.g}h`, `<path d="M${geo.hx} ${geo.hy - 26} v15" stroke="${INK}" stroke-width="2.4"/>`) +
      `<circle cx="${geo.hx}" cy="${geo.hy + 13.5}" r="4.4" fill="none" stroke="#ffd23f" stroke-width="2.6"/>`,
  });

const ratE7 = () =>
  rat({
    shape: HUGE,
    fur1: '#9dbb8d',
    fur2: '#3d5a3a',
    furMid: '#6a8a5f',
    belly: '#e3f0d6',
    eyes: 'patch',
    defs: (g) => lin(`${g}h`, '#4f6d7a', '#263c47'),
    body: ({ bodyCy }) => `
<path d="M24 ${bodyCy - 18} L78 ${bodyCy + 18}" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>
<path d="M24 ${bodyCy - 18} L78 ${bodyCy + 18}" stroke="#5a4634" stroke-width="7" stroke-linecap="round"/>
<path d="M30 ${bodyCy - 14} L72 ${bodyCy + 14}" stroke="#ffd23f" stroke-width="4" stroke-dasharray="3.5 5" stroke-linecap="round"/>`,
    head: ({ hx, hy, g }) => `
<path d="M${hx - 23} ${hy - 13} Q${hx - 25} ${hy - 33} ${hx} ${hy - 33} Q${hx + 25} ${hy - 33} ${hx + 23} ${hy - 13} Z" fill="url(#${g}h)" stroke="${INK}" stroke-width="3.8" stroke-linejoin="round"/>
<path d="M${hx - 24} ${hy - 14} Q${hx} ${hy - 7} ${hx + 24} ${hy - 14} L${hx + 23} ${hy - 9.5} Q${hx} ${hy - 2} ${hx - 23} ${hy - 9.5} Z" fill="#191a2e" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="${hx}" cy="${hy - 23}" r="4.6" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/>
<path d="M${hx - 15} ${hy - 27} Q${hx - 8} ${hy - 30} ${hx - 1} ${hy - 30}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".35"/>`,
    front: () => launcher(69, 12, 21, 60, '#8d99ae', '#454d62', 8),
  });

const ratE8 = () =>
  rat({
    shape: HUGE,
    fur1: '#f1f5fb',
    fur2: '#7483a0',
    furMid: '#a9b6cc',
    belly: '#3a4560',
    tail: '#9aa8bd',
    earIn: '#4a5876',
    eyes: 'visor',
    mouth: 'grille',
    defs: (g) => lin(`${g}p`, '#7f8da3', '#3f495f') + glow(`${g}r`, '#5ff4ff', 1, 0.35),
    back: ({ hx, hy }) =>
      `<path d="M${hx + 6} ${hy - 16} L${hx + 12} ${hy - 34}" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M${hx + 6} ${hy - 16} L${hx + 12} ${hy - 34}" stroke="#a9b6cc" stroke-width="2" stroke-linecap="round"/><circle cx="${hx + 12.5}" cy="${hy - 34}" r="3.6" fill="#ff3b3b" stroke="${INK}" stroke-width="2"/>`,
    body: ({ bodyRx, bodyRy, bodyCy, g }) => `
<path d="M${f(50 - bodyRx * 0.6)} ${f(bodyCy - bodyRy * 0.45)} H${f(50 + bodyRx * 0.6)} M50 ${f(bodyCy + bodyRy * 0.55)} V${f(bodyCy + bodyRy * 0.9)}" stroke="${INK}" stroke-width="1.6" opacity=".55"/>
<circle cx="50" cy="${bodyCy + 5}" r="13" fill="url(#${g}r)"/>
<circle cx="50" cy="${bodyCy + 5}" r="6.5" fill="#d9fbff" stroke="${INK}" stroke-width="2.6"/>
<circle cx="50" cy="${bodyCy + 5}" r="2.8" fill="#35d6ea"/>
${[-1, 1].map((s) => `<circle cx="${f(50 + s * bodyRx * 0.72)}" cy="${f(bodyCy + bodyRy * 0.42)}" r="1.9" fill="${INK}" opacity=".6"/><circle cx="${f(50 + s * bodyRx * 0.5)}" cy="${f(bodyCy - bodyRy * 0.62)}" r="1.9" fill="${INK}" opacity=".6"/>`).join('')}`,
    arms: ({ bodyRx, bodyCy, g }) =>
      [-1, 1]
        .map((s) => {
          const x = 50 + s * (bodyRx - 1) - 11;
          const y = bodyCy - 23;
          const holes = [
            [6, 7],
            [16, 7],
            [6, 16.5],
            [16, 16.5],
          ]
            .map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="3.4" fill="#1a1c2c" stroke="${INK}" stroke-width="1.4"/><circle cx="${x + dx}" cy="${y + dy}" r="1.6" fill="#ff5a5a"/>`)
            .join('');
          return `<rect x="${x}" y="${y}" width="22" height="23.5" rx="4.5" fill="url(#${g}p)" stroke="${INK}" stroke-width="3.4"/>${holes}`;
        })
        .join(''),
    head: ({ hx, hy, k }) =>
      `<path d="M${f(hx - 17 * k)} ${f(hy - 16 * k)} H${f(hx + 17 * k)}" stroke="${INK}" stroke-width="1.6" opacity=".5"/>` +
      [-1, 1]
        .map(
          (s) =>
            `<circle cx="${f(hx + s * 24 * k)}" cy="${f(hy - 17.5 * k)}" r="${f(3.6 * k)}" fill="#35d6ea" stroke="${INK}" stroke-width="1.6"/><circle cx="${f(hx + s * 20.5 * k)}" cy="${f(hy + 4 * k)}" r="1.7" fill="${INK}" opacity=".6"/>`,
        )
        .join(''),
  });

// --- Tank (player powerup) ---------------------------------------------------------

function tank() {
  const g = uid('tank');
  const treads = (x) =>
    Array.from({ length: 9 }, (_, i) => `<path d="M${x + 2.5} ${27 + i * 7.6} h13" stroke="#565b78" stroke-width="2.6" stroke-linecap="round"/>`).join('');
  return `
<defs>${lin(`${g}h`, '#ffe08a', '#f29e00')}${rad(`${g}t`, '#fff1b8', '#f7b000')}${lin(`${g}b`, '#dfe6f0', '#8793a8', 1, 0)}</defs>
${shadow(50, 93, 44, 6)}
<rect x="5" y="20" width="18" height="74" rx="8" fill="#2d3142" stroke="${INK}" stroke-width="3.6"/>
<rect x="77" y="20" width="18" height="74" rx="8" fill="#2d3142" stroke="${INK}" stroke-width="3.6"/>
${treads(5)}${treads(77)}
<rect x="17" y="28" width="66" height="60" rx="12" fill="url(#${g}h)" stroke="${INK}" stroke-width="4"/>
<path d="M24 36 H76 M24 80 H76" stroke="${INK}" stroke-width="1.8" opacity=".35"/>
<path d="M23 34 Q50 28 77 34" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>
<rect x="44" y="3" width="12" height="42" rx="3" fill="url(#${g}b)" stroke="${INK}" stroke-width="3.6"/>
<rect x="40.5" y="2" width="19" height="10" rx="3.5" fill="#2d3142" stroke="${INK}" stroke-width="3.2"/>
<path d="M33 49 L29 31 L46 42 Z" fill="url(#${g}t)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<path d="M67 49 L71 31 L54 42 Z" fill="url(#${g}t)" stroke="${INK}" stroke-width="3.6" stroke-linejoin="round"/>
<circle cx="50" cy="59" r="21" fill="url(#${g}t)" stroke="${INK}" stroke-width="4"/>
${paw(50, 61, 0.85, '#b36b00', 0.75)}
<ellipse cx="41" cy="48" rx="8" ry="4" fill="#fff" opacity=".4" transform="rotate(-24 41 48)"/>
<circle cx="24" cy="82" r="1.8" fill="${INK}" opacity=".5"/><circle cx="76" cy="82" r="1.8" fill="${INK}" opacity=".5"/>`;
}

// --- Projectiles -------------------------------------------------------------------

function bullet(core, mid, edge) {
  const g = uid('blt');
  return `
<defs>${lin(`${g}c`, core, mid)}${glow(`${g}g`, mid, 0.55, 0.5)}</defs>
<ellipse cx="10" cy="18" rx="10" ry="18" fill="url(#${g}g)"/>
<rect x="6.5" y="5" width="7" height="26" rx="3.5" fill="url(#${g}c)" stroke="${edge}" stroke-width="1.4"/>
<rect x="8.3" y="7.5" width="1.8" height="9" rx=".9" fill="#fff" opacity=".85"/>`;
}

/** Rocket pointing up. Enemy rockets are the same sprite flipped by the renderer. */
function rocket(tip1, tip2, body1, body2) {
  const g = uid('rkt');
  return `
<defs>${lin(`${g}b`, body1, body2, 1, 0)}${lin(`${g}t`, tip1, tip2)}${lin(`${g}f`, '#fff3b0', '#ff7b00')}</defs>
<path d="M14 62 Q7 48 10 42 H18 Q21 48 14 62 Z" fill="url(#${g}f)" stroke="#d94f00" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M14 55 Q11 48 12 43 H16 Q17 48 14 55 Z" fill="#fffbe0"/>
<path d="M8 30 L2 44 L9 41 Z" fill="${tip2}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M20 30 L26 44 L19 41 Z" fill="${tip2}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
<rect x="8" y="13" width="12" height="30" rx="3" fill="url(#${g}b)" stroke="${INK}" stroke-width="2.6"/>
<path d="M8 17 Q8 4 14 2 Q20 4 20 17 Z" fill="url(#${g}t)" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
<path d="M8.5 33 H19.5" stroke="${INK}" stroke-width="1.6" opacity=".5"/>
<path d="M11 19 v11" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>`;
}

// --- Effects -----------------------------------------------------------------------

function puff() {
  const g = uid('puff');
  return `<defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#${g})"/>`;
}

function spark() {
  return `<path d="M32 2 Q35 26 62 32 Q35 38 32 62 Q29 38 2 32 Q29 26 32 2 Z" fill="#fff"/>`;
}

function ring() {
  return `<circle cx="32" cy="32" r="26" fill="none" stroke="#fff" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="#fff" stroke-width="11" opacity=".25"/>`;
}

function heroRing() {
  const g = uid('hero');
  return `
<defs>${glow(g, '#ffd166', 0.6, 0.6)}</defs>
<ellipse cx="64" cy="32" rx="62" ry="30" fill="url(#${g})"/>
<ellipse cx="64" cy="32" rx="44" ry="19" fill="none" stroke="#ffe9a8" stroke-width="4" opacity=".95"/>
<ellipse cx="64" cy="32" rx="44" ry="19" fill="none" stroke="#ffb703" stroke-width="9" opacity=".3"/>`;
}

function bubble() {
  const g = uid('bub');
  return `
<defs><radialGradient id="${g}" cx=".42" cy=".36" r=".62"><stop offset="0" stop-color="#e6fbff" stop-opacity=".1"/><stop offset=".72" stop-color="#8fe9ff" stop-opacity=".28"/><stop offset="1" stop-color="#4cc9f0" stop-opacity=".75"/></radialGradient></defs>
<circle cx="64" cy="64" r="59" fill="url(#${g})" stroke="#d9fbff" stroke-width="3.5" stroke-opacity=".9"/>
<path d="M27 49 Q34 26 58 19" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".8"/>
<circle cx="25" cy="64" r="4" fill="#fff" opacity=".7"/>
<path d="M104 78 Q98 100 78 108" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".35"/>`;
}

// --- Powerup icons -------------------------------------------------------------------

function badge(c1, c2, glyph) {
  const g = uid('bdg');
  return `
<defs>${lin(g, c1, c2)}</defs>
<rect x="9" y="13" width="78" height="78" rx="20" fill="${INK}" opacity=".35"/>
<rect x="8" y="7" width="80" height="80" rx="20" fill="url(#${g})" stroke="${INK}" stroke-width="5"/>
<rect x="12.5" y="11.5" width="71" height="71" rx="16" fill="none" stroke="#fff" stroke-width="2.4" opacity=".35"/>
<path d="M17 37 Q17 16 38 16 H58 Q79 16 79 37 Q48 27 17 37 Z" fill="#fff" opacity=".28"/>
${glyph}`;
}

const iconClone = () => badge('#7ae582', '#1e9e4a', paw(48, 50, 1.55, '#ffffff') + paw(48, 50, 1.55, 'none'));

const iconMinigun = () =>
  badge(
    '#ffc15e',
    '#f26a00',
    `
<g stroke="${INK}" stroke-width="3" stroke-linejoin="round">
<rect x="33" y="18" width="8" height="42" rx="2.5" fill="#eef2f7"/>
<rect x="44" y="14" width="8" height="46" rx="2.5" fill="#eef2f7"/>
<rect x="55" y="18" width="8" height="42" rx="2.5" fill="#eef2f7"/>
<rect x="30" y="29" width="36" height="7" rx="3" fill="#2d3142"/>
<rect x="30" y="47" width="36" height="7" rx="3" fill="#2d3142"/>
<rect x="28" y="58" width="40" height="19" rx="6" fill="#4a4e69"/>
</g>
<rect x="34" y="63" width="16" height="4" rx="2" fill="#fff" opacity=".4"/>`,
  );

const iconLaser = () => {
  const g = uid('lsr');
  return badge(
    '#ff7aa8',
    '#c9184a',
    `
<defs>${glow(g, '#ffffff', 0.95, 0.4)}</defs>
<rect x="38" y="20" width="20" height="60" rx="10" fill="#fff" opacity=".3"/>
<rect x="43.5" y="18" width="9" height="62" rx="4.5" fill="#fff" stroke="${INK}" stroke-width="2.6"/>
<circle cx="48" cy="27" r="22" fill="url(#${g})"/>
<path d="M48 7 Q50.5 24.5 68 27 Q50.5 29.5 48 47 Q45.5 29.5 28 27 Q45.5 24.5 48 7 Z" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  );
};

const iconRocket = () =>
  badge(
    '#74d7ff',
    '#2f6fd8',
    `<g transform="translate(48 49) rotate(38) scale(1.12) translate(-14 -30)">${rocket('#ff7b7b', '#d62839', '#ffffff', '#c7d0e0')}</g>`,
  );

const iconTank = () => badge('#fff1a1', '#f4a000', `<g transform="translate(18 19) scale(.6)">${tank()}</g>`);

// --- Repeating tiles ---------------------------------------------------------------

const GU = 44; // tile art is drawn at 44 px per grid unit

function laneTile() {
  const rnd = mulberry32(11);
  const size = 4 * GU;
  let s = `<rect width="${size}" height="${size}" fill="#4c5a8c"/>`;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const x = i * 2 * GU;
      const y = j * 2 * GU;
      const light = (i + j) % 2 === 0;
      s += `<rect x="${x + 2}" y="${y + 2}" width="${2 * GU - 4}" height="${2 * GU - 4}" rx="9" fill="${light ? '#5d6ca6' : '#5766a0'}"/>`;
      s += `<path d="M${x + 6} ${y + 2 * GU - 14} V${y + 12} Q${x + 6} ${y + 6} ${x + 12} ${y + 6} H${x + 2 * GU - 14}" fill="none" stroke="#7f8fca" stroke-width="2" stroke-linecap="round" opacity=".45"/>`;
      s += `<path d="M${x + 2 * GU - 6} ${y + 14} V${y + 2 * GU - 12} Q${x + 2 * GU - 6} ${y + 2 * GU - 6} ${x + 2 * GU - 12} ${y + 2 * GU - 6} H${x + 14}" fill="none" stroke="#3b477a" stroke-width="2" stroke-linecap="round" opacity=".5"/>`;
    }
  }
  for (let n = 0; n < 34; n++) {
    const x = 8 + rnd() * (size - 16);
    const y = 8 + rnd() * (size - 16);
    const r = 0.8 + rnd() * 1.6;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${rnd() < 0.5 ? '#7a8ac6' : '#414d80'}" opacity="${f(0.25 + rnd() * 0.3)}"/>`;
  }
  return { w: size, h: size, body: s };
}

/** Left wall: [top face][inner side face][shadow on the lane]. Mirrored for the right wall. */
function barrierTile() {
  const g = uid('wall');
  const w = 2 * GU;
  const h = 4 * GU;
  const top = 46;
  const face = 26;
  let s = `<defs>${lin(`${g}t`, '#58e6d2', '#2bb8a8', 1, 0)}${lin(`${g}f`, '#1c877c', '#0c4a47', 1, 0)}<linearGradient id="${g}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0a1f" stop-opacity=".5"/><stop offset="1" stop-color="#0b0a1f" stop-opacity="0"/></linearGradient>${glow(`${g}l`, '#fff3b0', 0.9, 0.35)}</defs>`;
  s += `<rect x="${top + face}" y="0" width="${w - top - face}" height="${h}" fill="url(#${g}s)"/>`;
  s += `<rect x="${top}" y="0" width="${face}" height="${h}" fill="url(#${g}f)"/>`;
  s += `<rect x="0" y="0" width="${top}" height="${h}" fill="url(#${g}t)"/>`;
  s += `<rect x="0" y="0" width="5" height="${h}" fill="#167e74"/>`;
  s += `<rect x="${top - 6}" y="0" width="6" height="${h}" fill="#a8fff2" opacity=".75"/>`;
  s += `<rect x="${top + face - 3}" y="0" width="3" height="${h}" fill="#072f2d" opacity=".8"/>`;
  for (let j = 0; j < 2; j++) {
    const y = j * 2 * GU;
    s += `<rect x="0" y="${y - 1.5}" width="${top}" height="3" fill="#178a7e"/>`;
    s += `<rect x="${top}" y="${y - 1.5}" width="${face}" height="3" fill="#083533"/>`;
    s += `<rect x="12" y="${y + 12}" width="${top - 26}" height="${2 * GU - 24}" rx="9" fill="#3fcdbb" stroke="#1e9c8f" stroke-width="2"/>`;
    s += `<circle cx="${top / 2 - 1}" cy="${y + GU}" r="17" fill="url(#${g}l)"/>`;
    s += `<circle cx="${top / 2 - 1}" cy="${y + GU}" r="6.5" fill="#fff3b0" stroke="#b98a00" stroke-width="2"/>`;
    s += `<path d="M${top + 8} ${y + 12} V${y + 2 * GU - 12} M${top + 17} ${y + 12} V${y + 2 * GU - 12}" stroke="#0a3f3c" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
  }
  s += `<rect x="0" y="${h - 1.5}" width="${top}" height="1.5" fill="#178a7e"/><rect x="${top}" y="${h - 1.5}" width="${face}" height="1.5" fill="#083533"/>`;
  return { w, h, body: s };
}

/** Far parallax layer: the city far below the lane. Opaque. */
function sceneryFarTile() {
  const rnd = mulberry32(2024);
  const size = 512;
  const cell = 128;
  let s = `<rect width="${size}" height="${size}" fill="#0f1330"/>`;
  // Streets: faint lane markings between the blocks.
  for (let i = 0; i < 4; i++) {
    s += `<path d="M0 ${i * cell} H${size}" stroke="#262d5e" stroke-width="2" stroke-dasharray="10 12" opacity=".7"/>`;
    s += `<path d="M${i * cell} 0 V${size}" stroke="#262d5e" stroke-width="2" stroke-dasharray="10 12" opacity=".7"/>`;
  }
  const roofs = ['#1b2150', '#1f2759', '#182048', '#232a62'];
  const lights = ['#ffd166', '#ffd166', '#7bdff2', '#ff8fab'];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const x = i * cell + 13 + rnd() * 8;
      const y = j * cell + 13 + rnd() * 8;
      const w = cell - 34 - rnd() * 14;
      const h = cell - 34 - rnd() * 14;
      const fill = roofs[Math.floor(rnd() * roofs.length)];
      s += `<rect x="${f(x + 3)}" y="${f(y + 5)}" width="${f(w)}" height="${f(h)}" rx="7" fill="#090c22"/>`;
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="7" fill="${fill}" stroke="#2d3672" stroke-width="2"/>`;
      s += `<rect x="${f(x + 8)}" y="${f(y + 8)}" width="${f(w - 16)}" height="${f(h - 16)}" rx="4" fill="none" stroke="#2a3168" stroke-width="1.5"/>`;
      const n = 2 + Math.floor(rnd() * 4);
      for (let q = 0; q < n; q++) {
        const lx = x + 14 + rnd() * (w - 30);
        const ly = y + 14 + rnd() * (h - 30);
        const c = lights[Math.floor(rnd() * lights.length)];
        s += `<rect x="${f(lx)}" y="${f(ly)}" width="${f(4 + rnd() * 5)}" height="${f(3 + rnd() * 3)}" rx="1" fill="${c}" opacity="${f(0.45 + rnd() * 0.4)}"/>`;
      }
      if (rnd() < 0.5) {
        const cx = x + 18 + rnd() * (w - 36);
        const cy = y + 18 + rnd() * (h - 36);
        s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="9" fill="#2a3270" stroke="#39428a" stroke-width="2"/><circle cx="${f(cx)}" cy="${f(cy)}" r="3" fill="#39428a"/>`;
      }
      // Street lamp at the block corner.
      s += `<circle cx="${i * cell + 3}" cy="${j * cell + 3}" r="10" fill="#ffd166" opacity=".1"/><circle cx="${i * cell + 3}" cy="${j * cell + 3}" r="2.4" fill="#ffe9a8" opacity=".85"/>`;
    }
  }
  return { w: size, h: size, body: s };
}

/** Near parallax layer: rooftops just below the lane. Transparent between them. */
function sceneryNearTile() {
  const g = uid('near');
  const size = 512;
  const roof = (x, y, w, h, depth, top, edge) => `
<rect x="${x + 6}" y="${y + depth + 6}" width="${w}" height="${h}" rx="12" fill="#05061a" opacity=".5"/>
<rect x="${x}" y="${y + depth}" width="${w}" height="${h}" rx="12" fill="#171c44" stroke="#0d1030" stroke-width="3"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${top}" stroke="${edge}" stroke-width="4"/>
<rect x="${x + 10}" y="${y + 10}" width="${w - 20}" height="${h - 20}" rx="7" fill="none" stroke="${edge}" stroke-width="2" opacity=".6"/>`;
  const ac = (x, y) =>
    `<rect x="${x}" y="${y}" width="40" height="30" rx="5" fill="#9aa5c4" stroke="#1b1736" stroke-width="3"/><circle cx="${x + 20}" cy="${y + 15}" r="9" fill="#5b6688" stroke="#1b1736" stroke-width="2.5"/><path d="M${x + 20} ${y + 6} v18 M${x + 11} ${y + 15} h18" stroke="#c8d0e6" stroke-width="2"/>`;
  const tank = (x, y) =>
    `<circle cx="${x}" cy="${y}" r="26" fill="#b5774a" stroke="#1b1736" stroke-width="3.5"/><circle cx="${x}" cy="${y}" r="17" fill="#d99a66" stroke="#8b5630" stroke-width="2.5"/><path d="M${x - 17} ${y} h34 M${x} ${y - 17} v34" stroke="#8b5630" stroke-width="2"/>`;
  const skylight = (x, y, w, h) =>
    `<rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="12" fill="url(#${g}c)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#8ff0ff" stroke="#1b1736" stroke-width="3"/><path d="M${x + w / 2} ${y} v${h} M${x} ${y + h / 2} h${w}" stroke="#1b1736" stroke-width="2.5"/><path d="M${x + 6} ${y + h - 8} L${x + w / 2 - 8} ${y + 7}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
  const fishSign = (x, y) => `
<ellipse cx="${x + 34}" cy="${y + 18}" rx="56" ry="34" fill="url(#${g}p)"/>
<path d="M${x} ${y + 18} Q${x + 22} ${y - 6} ${x + 50} ${y + 18} Q${x + 22} ${y + 42} ${x} ${y + 18} Z M${x + 50} ${y + 18} L${x + 70} ${y + 2} V${y + 34} Z" fill="#3b1437" stroke="#ff7ab8" stroke-width="5" stroke-linejoin="round"/>
<circle cx="${x + 14}" cy="${y + 14}" r="3.5" fill="#ffd6ea"/>`;
  const lights = (x1, y1, x2, y2, sag) => {
    let out = `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 + sag} ${x2} ${y2}" fill="none" stroke="#0b0d26" stroke-width="2"/>`;
    const colors = ['#ffd166', '#ff7ab8', '#7bdff2', '#b8f28a'];
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 + sag;
      const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
      const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
      out += `<circle cx="${f(x)}" cy="${f(y + 4)}" r="9" fill="${colors[i % 4]}" opacity=".16"/><circle cx="${f(x)}" cy="${f(y + 4)}" r="3.6" fill="${colors[i % 4]}"/>`;
    }
    return out;
  };
  const s = `
<defs>${glow(`${g}c`, '#4cc9f0', 0.5, 0.6)}${glow(`${g}p`, '#ff4fa3', 0.45, 0.55)}</defs>
${roof(26, 34, 214, 168, 30, '#2c3777', '#4a58a8')}
${ac(46, 56)}${ac(46, 100)}
${skylight(118, 62, 96, 46)}
${tank(196, 160)}
${fishSign(70, 142)}
${roof(292, 250, 186, 208, 34, '#333d86', '#5563b8')}
${skylight(316, 280, 54, 54)}
${ac(410, 276)}
${tank(338, 408)}
${paw(420, 396, 2.1, '#7bdff2', 0.85)}
${roof(318, 24, 150, 122, 26, '#2a3370', '#4654a2')}
${ac(336, 44)}
${tank(424, 96)}
${roof(40, 302, 170, 152, 28, '#2f3a7d', '#4d5bae')}
${skylight(62, 326, 60, 40)}
${ac(148, 392)}
${lights(240, 60, 318, 50, 26)}
${lights(210, 372, 292, 350, 24)}`;
  return { w: size, h: size, body: s };
}

/** Defence line drawn on the last row of the lane. Mostly transparent. */
function baselineTile() {
  const g = uid('base');
  const w = 4 * GU;
  const h = GU;
  let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166" stop-opacity="0"/><stop offset="1" stop-color="#ffb703" stop-opacity=".42"/></linearGradient></defs>`;
  s += `<rect width="${w}" height="${h}" fill="url(#${g})"/>`;
  s += `<rect x="0" y="0" width="${w}" height="7" fill="#ffd166" opacity=".22"/>`;
  s += `<rect x="0" y="1.5" width="${w}" height="3" fill="#fff3c4" opacity=".95"/>`;
  for (let i = 0; i < 4; i++) {
    const x = i * GU;
    s += `<path d="M${x + 9} ${h - 9} L${x + 22} ${h - 23} L${x + 35} ${h - 9}" fill="none" stroke="#fff3c4" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;
  }
  return { w, h, body: s };
}

// --- Atlases -------------------------------------------------------------------------

/**
 * name, output size in px, design viewBox, drawing.
 * Two atlases: `atlas` is needed for first paint, `bosses` can load after the menu.
 */
const CORE_SPRITES = [
  ['tank', 256, 256, 100, 100, tank],
  ['rat_e4', 192, 192, 100, 100, ratE4],
  ['bubble', 128, 128, 128, 128, bubble],
  ['hero_ring', 128, 64, 128, 64, heroRing],
  ['icon_clone', 96, 96, 96, 96, iconClone],
  ['icon_minigun', 96, 96, 96, 96, iconMinigun],
  ['icon_laser', 96, 96, 96, 96, iconLaser],
  ['icon_rocket', 96, 96, 96, 96, iconRocket],
  ['icon_tank', 96, 96, 96, 96, iconTank],
  ['cat_black', 64, 64, 100, 100, catBlack],
  ['cat_white', 64, 64, 100, 100, catWhite],
  ['rat_e1', 64, 64, 100, 100, ratE1],
  ['rat_e2', 64, 64, 100, 100, ratE2],
  ['rat_e3', 64, 64, 100, 100, ratE3],
  ['puff', 64, 64, 64, 64, puff],
  ['spark', 64, 64, 64, 64, spark],
  ['ring', 64, 64, 64, 64, ring],
  ['rocket_player', 28, 64, 28, 64, () => rocket('#74d7ff', '#2f6fd8', '#ffffff', '#c7d0e0')],
  ['rocket_enemy', 28, 64, 28, 64, () => rocket('#ff7b7b', '#d62839', '#c3cad8', '#7b8499')],
  ['bullet', 20, 36, 20, 36, () => bullet('#fffbe0', '#ffd23f', '#c98a00')],
  ['bullet_minigun', 20, 36, 20, 36, () => bullet('#fff1d6', '#ff8c1a', '#c14f00')],
];

const BOSS_SPRITES = [
  ['rat_e8', 448, 448, 100, 100, ratE8],
  ['rat_e5', 320, 320, 100, 100, ratE5],
  ['rat_e6', 320, 320, 100, 100, ratE6],
  ['rat_e7', 320, 320, 100, 100, ratE7],
];

const PAD = 2;

function packAtlas(sprites, atlasWidth) {
  const sorted = [...sprites].sort((a, b) => b[2] - a[2]);
  const frames = {};
  let x = PAD;
  let y = PAD;
  let shelf = 0;
  let body = '';
  for (const [name, w, h, vw, vh, draw] of sorted) {
    if (x + w + PAD > atlasWidth) {
      x = PAD;
      y += shelf + PAD;
      shelf = 0;
    }
    body += `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">${draw()}</svg>
`;
    frames[name] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
    x += w + PAD;
    shelf = Math.max(shelf, h);
  }
  const height = y + shelf + PAD;
  return { frames, width: atlasWidth, height, body };
}

/** Renders an SVG body. `outWidth` rescales the output, e.g. to a power-of-two tile. */
function rasterise(width, height, body, outWidth = width) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return new Resvg(svg, { fitTo: { mode: 'width', value: outWidth } }).render().asPng();
}

/** ICO container around a single PNG image (supported since Windows Vista). */
function icoFromPng(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

/** name, drawing, output width in px. Outputs are power-of-two so they can repeat on any GPU. */
const TILES = [
  ['lane', laneTile, 256],
  ['barrier', barrierTile, 128],
  ['scenery_far', sceneryFarTile, 512],
  ['scenery_near', sceneryNearTile, 512],
  ['baseline', baselineTile, 256],
];

/**
 * Review sheet for the artist: every sprite enlarged on the lane colour, plus the
 * small units at the sizes they have on a phone and on a desktop screen.
 */
function previewSheet() {
  const all = [...CORE_SPRITES, ...BOSS_SPRITES];
  const cell = 232;
  const cols = 6;
  const rows = Math.ceil(all.length / cols);
  const stripY = rows * cell + 10;
  let body = `<rect width="${cols * cell}" height="${stripY + 150}" fill="#5766a0"/>`;
  all.forEach(([, w, h, vw, vh, draw], i) => {
    const scale = Math.min(200 / w, 200 / h);
    const dw = w * scale;
    const dh = h * scale;
    const x = (i % cols) * cell + (cell - dw) / 2;
    const y = Math.floor(i / cols) * cell + (cell - dh) / 2;
    body += `<svg x="${f(x)}" y="${f(y)}" width="${f(dw)}" height="${f(dh)}" viewBox="0 0 ${vw} ${vh}">${draw()}</svg>`;
  });
  const units = [catBlack, catWhite, ratE1, ratE2, ratE3];
  let x = 12;
  for (const size of [22, 33, 44, 64]) {
    for (let n = 0; n < 12; n++) {
      const draw = units[n < 2 ? n : 2 + (n % 3)];
      body += `<svg x="${x}" y="${stripY + 20}" width="${size}" height="${size}" viewBox="0 0 100 100">${draw()}</svg>`;
      body += `<svg x="${x}" y="${stripY + 20 + size * 0.74}" width="${size}" height="${size}" viewBox="0 0 100 100">${draw()}</svg>`;
      x += size * 0.74;
    }
    x += 26;
  }
  return rasterise(cols * cell, stripY + 150, body);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = [];
  const write = (file, data) => {
    writeFileSync(file, data);
    report.push(`${file.replace(ROOT, '.').replaceAll('\\', '/')}  ${(data.length / 1024).toFixed(1)} KB`);
  };

  for (const [name, sprites, width] of [
    ['atlas', CORE_SPRITES, 1024],
    ['bosses', BOSS_SPRITES, 1024],
  ]) {
    const atlas = packAtlas(sprites, width);
    write(join(OUT_DIR, `${name}.png`), rasterise(atlas.width, atlas.height, atlas.body));
    const json = {
      frames: atlas.frames,
      meta: { image: `${name}.png`, format: 'RGBA8888', size: { w: atlas.width, h: atlas.height }, scale: 1 },
    };
    write(join(OUT_DIR, `${name}.json`), Buffer.from(`${JSON.stringify(json, null, 1)}
`));
  }

  for (const [name, make, outWidth] of TILES) {
    const t = make();
    write(join(OUT_DIR, `${name}.png`), rasterise(t.w, t.h, t.body, outWidth));
  }

  const favicon = rasterise(48, 48, `<svg x="0" y="0" width="48" height="48" viewBox="0 0 100 100">${catBlack()}</svg>`);
  write(join(ROOT, 'public', 'favicon.ico'), icoFromPng(favicon, 48));

  // Optional: `npm run gen:sprites -- --preview some/dir` writes review images there.
  const flag = process.argv.indexOf('--preview');
  if (flag !== -1 && process.argv[flag + 1]) {
    const dir = process.argv[flag + 1];
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'preview-sprites.png'), previewSheet());
    for (const [name, make] of TILES) {
      const t = make();
      const reps = name === 'scenery_far' || name === 'scenery_near' ? 2 : 3;
      let body = `<rect width="${t.w * reps}" height="${t.h * reps}" fill="#0f1330"/>`;
      for (let j = 0; j < reps; j++) for (let i = 0; i < reps; i++) body += `<svg x="${i * t.w}" y="${j * t.h}" width="${t.w}" height="${t.h}">${make().body}</svg>`;
      writeFileSync(join(dir, `preview-${name}.png`), rasterise(t.w * reps, t.h * reps, body));
    }
    report.push(`preview images written to ${dir}`);
  }

  console.log(report.join('\n'));
}

main();
