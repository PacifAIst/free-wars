// 3D models, built from code (decision A20). Every character is a set of
// simple solids merged into one geometry and coloured per vertex, so a whole
// crowd is drawn as one instanced mesh.
//
// All models stand on y = 0, are about one unit wide, and are original designs.
// Cats face -z (up the lane, so the camera sees their backs); rats face +z.
//
// `detail` is the number of segments round a solid: about 7 for crowd units
// that are drawn thousands of times, 20 or more for the few big enemies.

import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Vec3 = readonly [number, number, number];

interface Placement {
  /** Position. */
  p?: Vec3;
  /** Rotation in radians (XYZ order). */
  r?: Vec3;
  /** Scale. */
  s?: Vec3;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const tint = new Color();

/** Places a solid and paints it one colour. */
function part(geometry: BufferGeometry, color: number, placement: Placement = {}): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const [px, py, pz] = placement.p ?? [0, 0, 0];
  const [rx, ry, rz] = placement.r ?? [0, 0, 0];
  const [sx, sy, sz] = placement.s ?? [1, 1, 1];
  matrix.compose(
    position.set(px, py, pz),
    quaternion.setFromEuler(euler.set(rx, ry, rz)),
    scale.set(sx, sy, sz),
  );
  g.applyMatrix4(matrix);
  tint.set(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('Model parts could not be merged');
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Bakes soft shading into the vertex colours of a character: darker near the
 * ground and on surfaces that face down, where less light would reach. It
 * gives a crowd of small models depth at no cost per frame.
 */
function shade(geometry: BufferGeometry, height: number): BufferGeometry {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const colors = geometry.attributes.color;
  for (let i = 0; i < positions.count; i++) {
    const rise = Math.min(1, Math.max(0, positions.getY(i) / height));
    const facing = normals.getY(i) * 0.5 + 0.5;
    const light = (0.6 + 0.4 * Math.sqrt(rise)) * (0.8 + 0.2 * facing);
    colors.setXYZ(i, colors.getX(i) * light, colors.getY(i) * light, colors.getZ(i) * light);
  }
  return geometry;
}

const ball = (r: number, d: number): BufferGeometry => new SphereGeometry(r, d, Math.max(4, Math.round(d * 0.7)));
/** Small detail such as a nose or a foot: a 16-triangle solid for crowd units, a smooth ball up close. */
const bit = (r: number, d: number): BufferGeometry => (d >= 14 ? ball(r, d - 4) : new SphereGeometry(r, 4, 3));
const rod = (r1: number, r2: number, h: number, d: number): BufferGeometry =>
  new CylinderGeometry(r1, r2, h, Math.max(5, Math.round(d * 0.7)));
const spike = (r: number, h: number, d: number): BufferGeometry =>
  new ConeGeometry(r, h, Math.max(4, Math.round(d * 0.6)));
const box = (x: number, y: number, z: number): BufferGeometry => new BoxGeometry(x, y, z);
const ring = (r: number, tube: number, d: number): BufferGeometry =>
  new TorusGeometry(r, tube, Math.max(4, Math.round(d * 0.4)), Math.max(8, d));

/** A pear-shaped body turned on a lathe: smoother and more characterful than a ball. */
function pear(width: number, height: number, d: number): BufferGeometry {
  const profile: [number, number][] = [
    [0, 0.0],
    [0.62, 0.03],
    [0.94, 0.18],
    [1.0, 0.4],
    [0.9, 0.62],
    [0.68, 0.82],
    [0.4, 0.95],
    [0, 1.0],
  ];
  const steps = d >= 14 ? profile : profile.filter((_, i) => i % 2 === 0 || i === profile.length - 1);
  return new LatheGeometry(
    steps.map(([r, y]) => new Vector2(r * width, y * height)),
    Math.max(6, d),
  );
}

/** A tapering tail along a curve. */
function tail(points: Vec3[], radius: number, d: number): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  return new TubeGeometry(curve, d >= 14 ? 14 : 3, radius, d >= 14 ? 8 : 3, false);
}

// --- Cats -----------------------------------------------------------------------

export interface CatLook {
  fur: number;
  furDark: number;
  scarf: number;
}

export const CAT_BLACK: CatLook = { fur: 0x3b3f66, furDark: 0x22243f, scarf: 0xff3d4f };
export const CAT_WHITE: CatLook = { fur: 0xfff3df, furDark: 0xe3cba6, scarf: 0x2f8bff };

export function catGeometry(look: CatLook, d: number): BufferGeometry {
  const { fur, furDark, scarf } = look;
  const fine = d >= 14;
  const parts = [
    part(pear(0.36, 0.86, d), fur, { p: [0, 0.08, 0.02], s: [1, 1, 0.92] }),
    part(ball(0.35, d), fur, { p: [0, 1.2, -0.05], s: [1.05, 0.95, 1] }),
    // Ears.
    part(spike(0.15, 0.36, d), furDark, { p: [-0.21, 1.58, -0.04], r: [0, 0.6, 0.16] }),
    part(spike(0.15, 0.36, d), furDark, { p: [0.21, 1.58, -0.04], r: [0, -0.6, -0.16] }),
    // Tail, raised.
    part(
      tail(
        [
          [0.02, 0.3, 0.3],
          [0.1, 0.5, 0.62],
          [0.14, 0.86, 0.72],
          [0.1, 1.1, 0.62],
        ],
        0.07,
        d,
      ),
      furDark,
    ),
    // Scarf and its knot.
    part(rod(0.31, 0.34, 0.18, d + 2), scarf, { p: [0, 0.92, -0.03] }),
    part(box(0.17, 0.32, 0.07), scarf, { p: [0.17, 0.78, 0.31], r: [0.55, 0, -0.4] }),
    // Feet.
    part(bit(0.13, d), furDark, { p: [-0.18, 0.09, 0.02], s: [1, 0.7, 1.3] }),
    part(bit(0.13, d), furDark, { p: [0.18, 0.09, 0.02], s: [1, 0.7, 1.3] }),
    // Blaster, pointing up the lane.
    part(rod(0.075, 0.075, 0.62, d), 0xa9b2c8, { p: [0.31, 0.72, -0.42], r: [Math.PI / 2, 0, 0] }),
    part(rod(0.1, 0.1, 0.14, d), 0xffd23f, { p: [0.31, 0.72, -0.76], r: [Math.PI / 2, 0, 0] }),
  ];
  if (fine) {
    parts.push(
      part(ball(0.11, 10), fur, { p: [0.3, 0.66, -0.16] }),
      part(ball(0.11, 10), fur, { p: [-0.3, 0.62, -0.1] }),
      // Tabby marks on the back of the head.
      part(box(0.05, 0.16, 0.03), furDark, { p: [0, 1.38, 0.27], r: [-0.5, 0, 0] }),
      part(box(0.05, 0.13, 0.03), furDark, { p: [-0.12, 1.34, 0.26], r: [-0.5, 0, 0.3] }),
      part(box(0.05, 0.13, 0.03), furDark, { p: [0.12, 1.34, 0.26], r: [-0.5, 0, -0.3] }),
    );
  }
  return shade(merge(parts), 1.3);
}

// --- Rats -----------------------------------------------------------------------

export interface RatLook {
  fur: number;
  furDark: number;
  belly: number;
  /** Iris colour. */
  eye: number;
  /** Body width relative to a minion. */
  fat: number;
  /** Skin colour of tail, feet, ears and nose. */
  skin: number;
}

const SKIN = 0xf28ba8;

const RAT_LOOKS: readonly RatLook[] = [
  { fur: 0, furDark: 0, belly: 0, eye: 0, fat: 1, skin: SKIN },
  { fur: 0xa2978d, furDark: 0x746a61, belly: 0xe6ddd0, eye: 0xd62839, fat: 1, skin: SKIN }, // E1
  { fur: 0xd0894d, furDark: 0xa5652f, belly: 0xfbe3c4, eye: 0xd62839, fat: 1, skin: SKIN }, // E2
  { fur: 0x9a5fd6, furDark: 0x6c3aa6, belly: 0xe9d5ff, eye: 0xffb703, fat: 1, skin: SKIN }, // E3
  { fur: 0xb5875f, furDark: 0x7d5636, belly: 0xf1dcc0, eye: 0xd62839, fat: 1.18, skin: SKIN }, // E4
  { fur: 0xe08a4f, furDark: 0xa9541f, belly: 0xffe2c2, eye: 0xd62839, fat: 1.3, skin: SKIN }, // E5
  { fur: 0xe2505f, furDark: 0x9c1f2e, belly: 0xffd0d5, eye: 0xffb703, fat: 1.3, skin: SKIN }, // E6
  { fur: 0x7fa06f, furDark: 0x47663f, belly: 0xe3f0d6, eye: 0xd62839, fat: 1.3, skin: SKIN }, // E7
  { fur: 0xc9d3e3, furDark: 0x7f8da6, belly: 0x55617d, eye: 0xff3030, fat: 1.25, skin: 0x8e9bb3 }, // E8
];

const INK = 0x2a1620;
const STEEL = 0xaab4c8;
const GOLD = 0xffcb2e;

/** The rat body shared by every enemy type. Accessories are added on top. */
function ratBody(look: RatLook, d: number): BufferGeometry[] {
  const { fur, furDark, belly, eye, fat, skin } = look;
  const fine = d >= 14;
  const small = Math.max(5, d - 2);
  const parts = [
    part(pear(0.36 * fat, 0.84, d), fur, { p: [0, 0.06, -0.02], s: [1, 1, 0.94] }),
    part(ball(0.31, d), fur, { p: [0, 1.14, 0.06], s: [1.06, 0.94, 1] }),
    // Snout and nose.
    part(ball(0.16, small), belly, { p: [0, 1.04, 0.33], s: [1, 0.82, 1.35] }),
    part(bit(0.065, d), 0xff5c8a, { p: [0, 1.08, 0.55] }),
    // Eyes.
    part(bit(0.075, d), fine ? 0xffffff : INK, { p: [-0.125, 1.23, 0.28] }),
    part(bit(0.075, d), fine ? 0xffffff : INK, { p: [0.125, 1.23, 0.28] }),
    // Feet.
    part(bit(0.12, d), skin, { p: [-0.18 * fat, 0.06, 0.16], s: [1, 0.55, 1.6] }),
    part(bit(0.12, d), skin, { p: [0.18 * fat, 0.06, 0.16], s: [1, 0.55, 1.6] }),
  ];

  // Ears: thin discs for the crowd, soft rounded ears up close.
  for (const side of [-1, 1]) {
    if (fine) {
      parts.push(
        part(ball(0.2, d), fur, { p: [side * 0.3, 1.47, 0], s: [1, 1, 0.3] }),
        part(ball(0.135, d), skin, { p: [side * 0.3, 1.47, 0.035], s: [1, 1, 0.3] }),
      );
    } else {
      parts.push(
        part(new CircleGeometry(0.2, 7), fur, { p: [side * 0.3, 1.47, 0], r: [-0.2, 0, 0] }),
        part(new CircleGeometry(0.125, 7), skin, { p: [side * 0.3, 1.47, 0.02], r: [-0.2, 0, 0] }),
      );
    }
  }

  parts.push(
    part(
      tail(
        [
          [0.08, 0.16, -0.3],
          [0.32, 0.1, -0.62],
          [0.56, 0.26, -0.7],
          [0.66, 0.52, -0.56],
        ],
        0.04,
        d,
      ),
      skin,
    ),
  );

  if (fine) {
    parts.push(
      // Belly patch and cheeks.
      part(ball(0.27 * fat, d), belly, { p: [0, 0.46, 0.2], s: [1, 1.25, 0.6] }),
      part(ball(0.13, 12), belly, { p: [-0.17, 1.03, 0.23] }),
      part(ball(0.13, 12), belly, { p: [0.17, 1.03, 0.23] }),
      // Irises, pupils and angry brows.
      part(ball(0.046, 10), eye, { p: [-0.118, 1.225, 0.338] }),
      part(ball(0.046, 10), eye, { p: [0.118, 1.225, 0.338] }),
      part(ball(0.024, 8), INK, { p: [-0.114, 1.222, 0.376] }),
      part(ball(0.024, 8), INK, { p: [0.114, 1.222, 0.376] }),
      part(box(0.2, 0.05, 0.06), INK, { p: [-0.13, 1.335, 0.31], r: [0.2, 0, -0.42] }),
      part(box(0.2, 0.05, 0.06), INK, { p: [0.13, 1.335, 0.31], r: [0.2, 0, 0.42] }),
      // Buck teeth.
      part(box(0.05, 0.085, 0.03), 0xffffff, { p: [-0.028, 0.945, 0.47] }),
      part(box(0.05, 0.085, 0.03), 0xffffff, { p: [0.028, 0.945, 0.47] }),
      // Arms and hands.
      part(new CapsuleGeometry(0.085, 0.26, 4, 10), furDark, { p: [-0.4 * fat, 0.56, 0.1], r: [0.3, 0, 0.5] }),
      part(new CapsuleGeometry(0.085, 0.26, 4, 10), furDark, { p: [0.4 * fat, 0.56, 0.1], r: [0.3, 0, -0.5] }),
      part(ball(0.1, 12), skin, { p: [-0.49 * fat, 0.4, 0.17] }),
      part(ball(0.1, 12), skin, { p: [0.49 * fat, 0.4, 0.17] }),
    );
    // Whiskers.
    for (const side of [-1, 1]) {
      for (const tilt of [-0.18, 0.18]) {
        parts.push(
          part(rod(0.006, 0.006, 0.3, 6), INK, {
            p: [side * 0.27, 1.05 + tilt * 0.2, 0.4],
            r: [0, 0, Math.PI / 2 + side * tilt],
          }),
        );
      }
    }
  }
  return parts;
}

/** Dome helmet over the head. */
const helmet = (color: number, d: number): BufferGeometry =>
  part(new SphereGeometry(0.345, Math.max(8, d), Math.max(4, Math.round(d * 0.4)), 0, Math.PI * 2, 0, Math.PI / 2), color, {
    p: [0, 1.17, 0.05],
  });

/** Shoulder-mounted rocket tube with a red warhead showing, pointing at the player. */
function launcher(color: number, dark: number, size: number, fat: number): BufferGeometry[] {
  const x = 0.34 * fat + 0.08;
  return [
    part(rod(0.11 * size, 0.11 * size, 0.95 * size, 16), color, { p: [x, 1.02, 0.02], r: [Math.PI / 2 - 0.2, 0, 0] }),
    part(rod(0.125 * size, 0.125 * size, 0.1, 16), dark, { p: [x, 0.94, 0.42 * size], r: [Math.PI / 2 - 0.2, 0, 0] }),
    part(rod(0.125 * size, 0.125 * size, 0.1, 16), dark, { p: [x, 1.1, -0.38 * size], r: [Math.PI / 2 - 0.2, 0, 0] }),
    part(spike(0.09 * size, 0.24 * size, 16), 0xff3b3b, { p: [x, 0.905, 0.57 * size], r: [Math.PI / 2 - 0.2, 0, 0] }),
  ];
}

/** Ammunition belt slung across the chest. */
function bandolier(fat: number): BufferGeometry[] {
  const parts = [part(ring(0.37 * fat, 0.035, 22), 0x5a4634, { p: [0, 0.55, 0], r: [Math.PI / 2 - 0.5, 0.75, 0] })];
  for (let i = 0; i < 5; i++) {
    const t = -0.5 + i * 0.25;
    parts.push(part(ball(0.04, 8), GOLD, { p: [t * 0.5 * fat, 0.56 - t * 0.36, 0.33 * fat - Math.abs(t) * 0.12] }));
  }
  return parts;
}

function accessories(type: number, look: RatLook, d: number): BufferGeometry[] {
  const { fat } = look;
  switch (type) {
    case 2: // Sergeant: green helmet.
      return [helmet(0x58c93f, d)];
    case 3: // Elite: gold helmet with a red crest.
      return [helmet(0xffc400, d), part(box(0.09, 0.3, 0.46), 0xe5383b, { p: [0, 1.6, 0.03] })];
    case 4: // Sniper: goggles, rocket tube, ammunition belt.
      return [
        part(ring(0.1, 0.028, 16), INK, { p: [-0.125, 1.23, 0.3] }),
        part(ring(0.1, 0.028, 16), INK, { p: [0.125, 1.23, 0.3] }),
        part(ball(0.092, 14), 0x7fe3ff, { p: [-0.125, 1.23, 0.3], s: [1, 1, 0.45] }),
        part(ball(0.092, 14), 0x7fe3ff, { p: [0.125, 1.23, 0.3], s: [1, 1, 0.45] }),
        part(ring(0.315, 0.03, 24), 0x3d2c2e, { p: [0, 1.23, 0.05], r: [Math.PI / 2, 0, 0] }),
        ...launcher(0x86993f, 0x2c3140, 1, fat),
        ...bandolier(fat),
      ];
    case 5: // Boss: crown, boxing gloves, champion's belt.
      return [
        part(rod(0.23, 0.19, 0.13, 24), GOLD, { p: [0, 1.47, 0.05] }),
        ...[0, 1, 2, 3, 4, 5].map((i) =>
          part(spike(0.055, 0.17, 10), GOLD, {
            p: [0.2 * Math.cos((i * Math.PI) / 3), 1.61, 0.05 + 0.2 * Math.sin((i * Math.PI) / 3)],
          }),
        ),
        part(ball(0.04, 10), 0xe5383b, { p: [0, 1.48, 0.275] }),
        part(ball(0.2, 20), 0xe5383b, { p: [-0.5 * fat, 0.4, 0.2] }),
        part(ball(0.2, 20), 0xe5383b, { p: [0.5 * fat, 0.4, 0.2] }),
        part(rod(0.12, 0.12, 0.09, 16), 0xffffff, { p: [-0.45 * fat, 0.56, 0.14], r: [0.3, 0, 0.5] }),
        part(rod(0.12, 0.12, 0.09, 16), 0xffffff, { p: [0.45 * fat, 0.56, 0.14], r: [0.3, 0, -0.5] }),
        part(ring(0.355 * fat, 0.05, 28), GOLD, { p: [0, 0.33, -0.02], r: [Math.PI / 2, 0, 0], s: [1, 0.94, 1] }),
        part(rod(0.1, 0.1, 0.05, 18), GOLD, { p: [0, 0.33, 0.34 * fat], r: [Math.PI / 2, 0, 0] }),
        part(ball(0.05, 10), 0xe5383b, { p: [0, 0.33, 0.37 * fat] }),
      ];
    case 6: // Charger: horned steel helmet, nose ring, spiked shoulders.
      return [
        helmet(STEEL, d),
        part(box(0.03, 0.02, 0.4), INK, { p: [0, 1.52, 0.05] }),
        part(spike(0.085, 0.42, 14), 0xfff3d6, { p: [-0.4, 1.5, 0.05], r: [0, 0, 0.95] }),
        part(spike(0.085, 0.42, 14), 0xfff3d6, { p: [0.4, 1.5, 0.05], r: [0, 0, -0.95] }),
        part(ring(0.05, 0.014, 14), GOLD, { p: [0, 1.0, 0.56] }),
        ...[-1, 1].flatMap((side) => [
          part(ball(0.17, 16), 0x6d7790, { p: [side * 0.36 * fat, 0.78, 0.02], s: [1.1, 0.7, 1.1] }),
          part(spike(0.05, 0.2, 10), STEEL, { p: [side * 0.42 * fat, 0.94, 0.02], r: [0, 0, -side * 0.5] }),
          part(spike(0.05, 0.2, 10), STEEL, { p: [side * 0.3 * fat, 0.96, 0.02], r: [0, 0, side * 0.1] }),
        ]),
      ];
    case 7: // Boss sniper: peaked cap, eye patch, heavy launcher.
      return [
        part(rod(0.27, 0.3, 0.17, 24), 0x3f5d6b, { p: [0, 1.46, 0.02] }),
        part(rod(0.3, 0.3, 0.035, 24), 0x16182b, { p: [0, 1.375, 0.16], s: [1, 1, 0.9] }),
        part(ball(0.05, 12), GOLD, { p: [0, 1.47, 0.3] }),
        part(ball(0.095, 14), 0x16182b, { p: [-0.125, 1.23, 0.29], s: [1, 1, 0.5] }),
        part(ring(0.318, 0.016, 24), 0x16182b, { p: [0, 1.25, 0.05], r: [Math.PI / 2 - 0.15, 0, 0.2] }),
        ...launcher(0x8b95aa, 0x2c3140, 1.3, fat),
        ...bandolier(fat),
      ];
    case 8: // Robo rat: visor, antenna, reactor, rocket pods.
      return [
        part(box(0.5, 0.15, 0.1), 0x151827, { p: [0, 1.23, 0.28] }),
        part(ball(0.05, 10), 0xff3030, { p: [-0.12, 1.23, 0.335] }),
        part(ball(0.05, 10), 0xff3030, { p: [0.12, 1.23, 0.335] }),
        part(rod(0.012, 0.012, 0.36, 8), STEEL, { p: [0.08, 1.6, 0.02], r: [0, 0, -0.25] }),
        part(ball(0.045, 10), 0xff3030, { p: [0.125, 1.77, 0.02] }),
        part(ball(0.11, 16), 0x6ff3ff, { p: [0, 0.5, 0.33 * fat], s: [1, 1, 0.5] }),
        part(ring(0.13, 0.025, 18), 0x39435c, { p: [0, 0.5, 0.33 * fat] }),
        ...[-1, 1].flatMap((side) => {
          const x = side * (0.36 * fat + 0.1);
          return [
            part(box(0.26, 0.26, 0.3), 0x55617d, { p: [x, 0.86, 0.04] }),
            ...[
              [-0.06, 0.06],
              [0.06, 0.06],
              [-0.06, -0.06],
              [0.06, -0.06],
            ].map(([dx, dy]) =>
              part(rod(0.04, 0.04, 0.04, 10), 0xff5a5a, { p: [x + dx, 0.86 + dy, 0.2], r: [Math.PI / 2, 0, 0] }),
            ),
          ];
        }),
        part(box(0.3, 0.012, 0.012), INK, { p: [0, 0.74, 0.335 * fat] }),
      ];
    default:
      return [];
  }
}

/** Geometry for enemy type 1..8. */
export function ratGeometry(type: number, d: number): BufferGeometry {
  const look = RAT_LOOKS[type];
  return shade(merge([...ratBody(look, d), ...accessories(type, look, d)]), 1.2);
}

// --- Props ------------------------------------------------------------------------

/** Soft contact shadow under a unit: a flat disc on the lane. */
export function blobGeometry(): BufferGeometry {
  return new CircleGeometry(0.46, 10).rotateX(-Math.PI / 2);
}

/** Bullet: a capsule lying along the lane. */
export function bulletGeometry(radius: number, length: number): BufferGeometry {
  return new CapsuleGeometry(radius, length, 2, 6).rotateX(Math.PI / 2);
}

/** Low-poly ball for glow effects. */
export function glowGeometry(): BufferGeometry {
  return new SphereGeometry(0.5, 10, 7);
}
