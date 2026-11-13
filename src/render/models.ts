// 3D models, built from code (decision A20). Every character is a set of
// simple solids merged into one geometry and coloured per vertex, so a whole
// crowd is drawn as one instanced mesh.
//
// All models stand on y = 0, are about one unit wide, and are original designs.
// Cats face -z (up the lane, so the camera sees their backs); rats face +z.
//
// `detail` is the number of segments round a solid: 10 for crowd units, 20 or
// more for the few big enemies. Three levels of features follow from it:
// crowd units get eyes with pupils, arms and a belly; big enemies add cheeks,
// brows, teeth and whiskers.
//
// Each solid is tagged with the limb it belongs to. The walk cycle is not
// stored anywhere: `walking()` adds it to a material, and the graphics card
// moves feet, arms, tail and body for every unit on its own beat.

import {
  BackSide,
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
  type Material,
  Matrix4,
  MeshBasicMaterial,
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

// Limb tags, read by the walk cycle in the vertex shader.
const BODY = 0;
const FOOT_L = 1;
const FOOT_R = 2;
const TAIL = 3;
const ARM_L = 4;
const ARM_R = 5;
const HEAD = 6;
/**
 * Added to a limb tag for small features such as eyes and brows: they get no outline
 * of their own, which would turn a face into a dark smudge at crowd size.
 */
const DETAIL = 0.25;

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const euler = new Euler();
const scale = new Vector3();
const tint = new Color();

/** Places a solid, paints it one colour and tags it with its limb. */
function part(geometry: BufferGeometry, color: number, placement: Placement = {}, limb = BODY): BufferGeometry {
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
  const limbs = new Float32Array(count).fill(limb);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.setAttribute('limb', new Float32BufferAttribute(limbs, 1));
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
/** Small detail such as a nose or a pupil: a 16-triangle solid for crowd units, a smooth ball up close. */
const bit = (r: number, d: number): BufferGeometry => (d >= 14 ? ball(r, d - 4) : new SphereGeometry(r, 4, 3));
const rod = (r1: number, r2: number, h: number, d: number): BufferGeometry =>
  new CylinderGeometry(r1, r2, h, Math.max(5, Math.round(d * 0.7)));
const spike = (r: number, h: number, d: number): BufferGeometry =>
  new ConeGeometry(r, h, Math.max(4, Math.round(d * 0.6)));
const box = (x: number, y: number, z: number): BufferGeometry => new BoxGeometry(x, y, z);
const ring = (r: number, tube: number, d: number): BufferGeometry =>
  new TorusGeometry(r, tube, Math.max(4, Math.round(d * 0.4)), Math.max(8, d));
const limbSolid = (r: number, length: number, d: number): BufferGeometry =>
  new CapsuleGeometry(r, length, d >= 14 ? 4 : 2, d >= 14 ? 10 : 6);

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
  const steps = d >= 14 ? profile : profile.filter((_, i) => i % 2 === 0 || i === profile.length - 1 || i === 3);
  return new LatheGeometry(
    steps.map(([r, y]) => new Vector2(r * width, y * height)),
    Math.max(6, d),
  );
}

/** A tail along a curve. */
function tail(points: Vec3[], radius: number, d: number): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  return new TubeGeometry(curve, d >= 14 ? 14 : 5, radius, d >= 14 ? 8 : 4, false);
}

// --- Cats -----------------------------------------------------------------------

export interface CatLook {
  fur: number;
  furDark: number;
  /** Backs of the ears and tip of the tail: what tells a cat from a ball when seen from above. */
  ear: number;
  tip: number;
  scarf: number;
}

export const CAT_BLACK: CatLook = { fur: 0x3b3f66, furDark: 0x22243f, ear: 0x7279c2, tip: 0xf4f1ea, scarf: 0xff3d4f };
export const CAT_WHITE: CatLook = { fur: 0xf7f3ec, furDark: 0xcfc9da, ear: 0x4d5385, tip: 0x4d5385, scarf: 0x2f8bff };

export function catGeometry(look: CatLook, d: number): BufferGeometry {
  const { fur, furDark, ear, tip, scarf } = look;
  const fine = d >= 14;
  // The camera looks down on the cats from behind, so the features that make a cat are
  // the ones on top and at the back: ears laid back and flattened into triangles, a
  // raised tail with a coloured tip, a scarf that flies.
  const parts = [
    part(pear(0.35, 0.86, d), fur, { p: [0, 0.08, 0.02], s: [1, 1, 0.92] }),
    part(ball(0.33, d), fur, { p: [0, 1.2, -0.06], s: [1.06, 0.94, 1] }, HEAD),
    // Ears.
    part(spike(0.15, 0.4, d), ear, { p: [-0.25, 1.54, -0.02], r: [0.4, 0, 0.5], s: [1, 1, 0.6] }, HEAD),
    part(spike(0.15, 0.4, d), ear, { p: [0.25, 1.54, -0.02], r: [0.4, 0, -0.5], s: [1, 1, 0.6] }, HEAD),
    // Tail, raised over the back, with a coloured tip.
    part(
      tail(
        [
          [0, 0.3, 0.28],
          [0.04, 0.62, 0.56],
          [0.08, 1.05, 0.63],
          [0.1, 1.4, 0.52],
          [0.08, 1.56, 0.36],
        ],
        0.095,
        d,
      ),
      fur,
      {},
      TAIL,
    ),
    part(bit(0.14, d), tip, { p: [0.08, 1.57, 0.34] }, TAIL),
    // Scarf, its knot and its two ends flying behind.
    part(rod(0.33, 0.36, 0.2, d + 2), scarf, { p: [0, 0.9, -0.03] }),
    part(box(0.16, 0.34, 0.07), scarf, { p: [0.2, 0.78, 0.33], r: [0.7, 0, -0.45] }, TAIL),
    part(box(0.13, 0.28, 0.06), scarf, { p: [0.3, 0.8, 0.27], r: [0.9, 0, -0.9] }, TAIL),
    // Feet.
    part(bit(0.13, d), furDark, { p: [-0.18, 0.09, 0.02], s: [1, 0.7, 1.3] }, FOOT_L),
    part(bit(0.13, d), furDark, { p: [0.18, 0.09, 0.02], s: [1, 0.7, 1.3] }, FOOT_R),
    // Arms holding the blaster, which points up the lane.
    part(limbSolid(0.075, 0.22, d), fur, { p: [0.3, 0.68, -0.14], r: [1.2, 0, -0.25] }),
    part(limbSolid(0.075, 0.22, d), fur, { p: [-0.26, 0.64, -0.12], r: [1.2, 0, 0.6] }),
    part(rod(0.08, 0.08, 0.66, d), 0x8f9ab8, { p: [0.31, 0.72, -0.44], r: [Math.PI / 2, 0, 0] }),
    part(rod(0.11, 0.11, 0.15, d), 0xffd23f, { p: [0.31, 0.72, -0.8], r: [Math.PI / 2, 0, 0] }),
  ];
  if (fine) {
    parts.push(
      // Inner ears, seen when the head turns.
      part(spike(0.09, 0.25, d), 0xff9eb5, { p: [-0.245, 1.51, -0.07], r: [0.4, 0, 0.5], s: [1, 1, 0.5] }, HEAD + DETAIL),
      part(spike(0.09, 0.25, d), 0xff9eb5, { p: [0.245, 1.51, -0.07], r: [0.4, 0, -0.5], s: [1, 1, 0.5] }, HEAD + DETAIL),
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
  const small = Math.max(6, d - 3);
  const parts = [
    part(pear(0.36 * fat, 0.84, d), fur, { p: [0, 0.06, -0.02], s: [1, 1, 0.94] }),
    part(ball(0.27 * fat, small), belly, { p: [0, 0.46, 0.2], s: [1, 1.25, 0.6] }),
    part(ball(0.31, d), fur, { p: [0, 1.14, 0.06], s: [1.06, 0.94, 1] }, HEAD),
    // Snout and nose.
    part(ball(0.16, small), belly, { p: [0, 1.04, 0.33], s: [1, 0.82, 1.35] }, HEAD),
    part(bit(0.065, d), 0xff5c8a, { p: [0, 1.08, 0.55] }, HEAD + DETAIL),
    // Eyes: whites with dark pupils, set a little forward so they read from above.
    part(bit(0.085, d), 0xffffff, { p: [-0.125, 1.23, 0.28] }, HEAD + DETAIL),
    part(bit(0.085, d), 0xffffff, { p: [0.125, 1.23, 0.28] }, HEAD + DETAIL),
    part(bit(0.05, d), fine ? eye : INK, { p: [-0.12, 1.225, 0.345] }, HEAD + DETAIL),
    part(bit(0.05, d), fine ? eye : INK, { p: [0.12, 1.225, 0.345] }, HEAD + DETAIL),
    // Angry brows give the face its character even at crowd size.
    part(box(0.2, 0.055, 0.07), INK, { p: [-0.13, 1.34, 0.31], r: [0.2, 0, -0.42] }, HEAD + DETAIL),
    part(box(0.2, 0.055, 0.07), INK, { p: [0.13, 1.34, 0.31], r: [0.2, 0, 0.42] }, HEAD + DETAIL),
    // Round ears with pink insides.
    part(ball(0.2, small), fur, { p: [-0.3, 1.47, 0], s: [1, 1, 0.3] }, HEAD),
    part(ball(0.2, small), fur, { p: [0.3, 1.47, 0], s: [1, 1, 0.3] }, HEAD),
    part(new CircleGeometry(0.135, Math.max(7, d)), skin, { p: [-0.3, 1.47, 0.065] }, HEAD + DETAIL),
    part(new CircleGeometry(0.135, Math.max(7, d)), skin, { p: [0.3, 1.47, 0.065] }, HEAD + DETAIL),
    // Feet.
    part(bit(0.12, d), skin, { p: [-0.18 * fat, 0.06, 0.16], s: [1, 0.55, 1.6] }, FOOT_L),
    part(bit(0.12, d), skin, { p: [0.18 * fat, 0.06, 0.16], s: [1, 0.55, 1.6] }, FOOT_R),
    // Arms and hands.
    part(limbSolid(0.085, 0.26, d), furDark, { p: [-0.4 * fat, 0.56, 0.1], r: [0.3, 0, 0.5] }, ARM_L),
    part(limbSolid(0.085, 0.26, d), furDark, { p: [0.4 * fat, 0.56, 0.1], r: [0.3, 0, -0.5] }, ARM_R),
    part(bit(0.1, d), skin, { p: [-0.49 * fat, 0.4, 0.17] }, ARM_L),
    part(bit(0.1, d), skin, { p: [0.49 * fat, 0.4, 0.17] }, ARM_R),
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
      {},
      TAIL,
    ),
  ];

  if (fine) {
    parts.push(
      // Cheeks, pupils and buck teeth.
      part(ball(0.13, 12), belly, { p: [-0.17, 1.03, 0.23] }, HEAD),
      part(ball(0.13, 12), belly, { p: [0.17, 1.03, 0.23] }, HEAD),
      part(ball(0.026, 8), INK, { p: [-0.116, 1.222, 0.39] }, HEAD + DETAIL),
      part(ball(0.026, 8), INK, { p: [0.116, 1.222, 0.39] }, HEAD + DETAIL),
      part(box(0.05, 0.085, 0.03), 0xffffff, { p: [-0.028, 0.945, 0.47] }, HEAD + DETAIL),
      part(box(0.05, 0.085, 0.03), 0xffffff, { p: [0.028, 0.945, 0.47] }, HEAD + DETAIL),
    );
    // Whiskers.
    for (const side of [-1, 1]) {
      for (const tilt of [-0.18, 0.18]) {
        parts.push(
          part(
            rod(0.006, 0.006, 0.3, 6),
            INK,
            { p: [side * 0.27, 1.05 + tilt * 0.2, 0.4], r: [0, 0, Math.PI / 2 + side * tilt] },
            HEAD + DETAIL,
          ),
        );
      }
    }
  }
  return parts;
}

/** Dome helmet over the head. */
const helmet = (color: number, d: number): BufferGeometry =>
  part(
    new SphereGeometry(0.345, Math.max(8, d), Math.max(4, Math.round(d * 0.4)), 0, Math.PI * 2, 0, Math.PI / 2),
    color,
    { p: [0, 1.17, 0.05] },
    HEAD,
  );

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
    case 2: // Sergeant: green helmet with a yellow stripe.
      return [helmet(0x58c93f, d), part(box(0.1, 0.04, 0.5), 0xffe066, { p: [0, 1.52, 0.05] }, HEAD)];
    case 3: // Elite: gold helmet with a red crest, and gold shoulder guards.
      return [
        helmet(0xffc400, d),
        part(box(0.09, 0.3, 0.46), 0xe5383b, { p: [0, 1.6, 0.03] }, HEAD),
        part(bit(0.13, d), 0xffc400, { p: [-0.34, 0.8, 0.02], s: [1.2, 0.7, 1.2] }, ARM_L),
        part(bit(0.13, d), 0xffc400, { p: [0.34, 0.8, 0.02], s: [1.2, 0.7, 1.2] }, ARM_R),
      ];
    case 4: // Sniper: goggles, rocket tube, ammunition belt.
      return [
        part(ring(0.1, 0.028, 16), INK, { p: [-0.125, 1.23, 0.3] }, HEAD),
        part(ring(0.1, 0.028, 16), INK, { p: [0.125, 1.23, 0.3] }, HEAD),
        part(ball(0.092, 14), 0x7fe3ff, { p: [-0.125, 1.23, 0.3], s: [1, 1, 0.45] }, HEAD),
        part(ball(0.092, 14), 0x7fe3ff, { p: [0.125, 1.23, 0.3], s: [1, 1, 0.45] }, HEAD),
        part(ring(0.315, 0.03, 24), 0x3d2c2e, { p: [0, 1.23, 0.05], r: [Math.PI / 2, 0, 0] }, HEAD),
        ...launcher(0x86993f, 0x2c3140, 1, fat),
        ...bandolier(fat),
      ];
    case 5: // Boss: crown, boxing gloves, champion's belt.
      return [
        part(rod(0.23, 0.19, 0.13, 24), GOLD, { p: [0, 1.47, 0.05] }, HEAD),
        ...[0, 1, 2, 3, 4, 5].map((i) =>
          part(
            spike(0.055, 0.17, 10),
            GOLD,
            { p: [0.2 * Math.cos((i * Math.PI) / 3), 1.61, 0.05 + 0.2 * Math.sin((i * Math.PI) / 3)] },
            HEAD,
          ),
        ),
        part(ball(0.04, 10), 0xe5383b, { p: [0, 1.48, 0.275] }, HEAD),
        part(ball(0.2, 20), 0xe5383b, { p: [-0.5 * fat, 0.4, 0.2] }, ARM_L),
        part(ball(0.2, 20), 0xe5383b, { p: [0.5 * fat, 0.4, 0.2] }, ARM_R),
        part(rod(0.12, 0.12, 0.09, 16), 0xffffff, { p: [-0.45 * fat, 0.56, 0.14], r: [0.3, 0, 0.5] }, ARM_L),
        part(rod(0.12, 0.12, 0.09, 16), 0xffffff, { p: [0.45 * fat, 0.56, 0.14], r: [0.3, 0, -0.5] }, ARM_R),
        part(ring(0.355 * fat, 0.05, 28), GOLD, { p: [0, 0.33, -0.02], r: [Math.PI / 2, 0, 0], s: [1, 0.94, 1] }),
        part(rod(0.1, 0.1, 0.05, 18), GOLD, { p: [0, 0.33, 0.34 * fat], r: [Math.PI / 2, 0, 0] }),
        part(ball(0.05, 10), 0xe5383b, { p: [0, 0.33, 0.37 * fat] }),
      ];
    case 6: // Charger: horned steel helmet, nose ring, spiked shoulders.
      return [
        helmet(STEEL, d),
        part(box(0.03, 0.02, 0.4), INK, { p: [0, 1.52, 0.05] }, HEAD),
        part(spike(0.085, 0.42, 14), 0xfff3d6, { p: [-0.4, 1.5, 0.05], r: [0, 0, 0.95] }, HEAD),
        part(spike(0.085, 0.42, 14), 0xfff3d6, { p: [0.4, 1.5, 0.05], r: [0, 0, -0.95] }, HEAD),
        part(ring(0.05, 0.014, 14), GOLD, { p: [0, 1.0, 0.56] }, HEAD),
        ...[-1, 1].flatMap((side) => [
          part(ball(0.17, 16), 0x6d7790, { p: [side * 0.36 * fat, 0.78, 0.02], s: [1.1, 0.7, 1.1] }),
          part(spike(0.05, 0.2, 10), STEEL, { p: [side * 0.42 * fat, 0.94, 0.02], r: [0, 0, -side * 0.5] }),
          part(spike(0.05, 0.2, 10), STEEL, { p: [side * 0.3 * fat, 0.96, 0.02], r: [0, 0, side * 0.1] }),
        ]),
      ];
    case 7: // Boss sniper: peaked cap, eye patch, heavy launcher.
      return [
        part(rod(0.27, 0.3, 0.17, 24), 0x3f5d6b, { p: [0, 1.46, 0.02] }, HEAD),
        part(rod(0.3, 0.3, 0.035, 24), 0x16182b, { p: [0, 1.375, 0.16], s: [1, 1, 0.9] }, HEAD),
        part(ball(0.05, 12), GOLD, { p: [0, 1.47, 0.3] }, HEAD),
        part(ball(0.095, 14), 0x16182b, { p: [-0.125, 1.23, 0.29], s: [1, 1, 0.5] }, HEAD),
        part(ring(0.318, 0.016, 24), 0x16182b, { p: [0, 1.25, 0.05], r: [Math.PI / 2 - 0.15, 0, 0.2] }, HEAD),
        ...launcher(0x8b95aa, 0x2c3140, 1.3, fat),
        ...bandolier(fat),
      ];
    case 8: // Robo rat: visor, antenna, reactor, rocket pods.
      return [
        part(box(0.5, 0.15, 0.1), 0x151827, { p: [0, 1.23, 0.3] }, HEAD),
        part(ball(0.05, 10), 0xff3030, { p: [-0.12, 1.23, 0.355] }, HEAD),
        part(ball(0.05, 10), 0xff3030, { p: [0.12, 1.23, 0.355] }, HEAD),
        part(rod(0.012, 0.012, 0.36, 8), STEEL, { p: [0.08, 1.6, 0.02], r: [0, 0, -0.25] }, HEAD),
        part(ball(0.045, 10), 0xff3030, { p: [0.125, 1.77, 0.02] }, HEAD),
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

// --- Walk cycle -------------------------------------------------------------------

/** Clock shared by every walking material. The renderer advances `value` each frame. */
export const walkClock = { value: 0 };

/**
 * Makes a material walk: its models step, swing their arms, sway their tails
 * and waddle. `pace` is steps per second times pi, `stride` how big the motion
 * is (1 for a march, less for cats shuffling on the spot).
 *
 * The motion is computed in the vertex shader from the limb tag of each vertex
 * and the position of each instance, so every unit in a crowd is on its own
 * beat and the animation costs nothing per unit on the CPU.
 */
export function walking<T extends Material>(material: T, pace: number, stride: number, hull = 0): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWalkTime = walkClock;
    shader.uniforms.uWalkPace = { value: pace };
    shader.uniforms.uWalkStride = { value: stride };
    shader.uniforms.uHull = { value: hull };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float limb;
attribute vec2 punch;
uniform float uWalkTime;
uniform float uWalkPace;
uniform float uWalkStride;
uniform float uHull;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  // Outline materials draw the model a little fatter; everything else has uHull = 0.
  // Small features (limb tag with a fraction) keep their size, so they get no outline.
  transformed += normal * uHull * step(fract(limb), 0.1);
  #ifdef USE_INSTANCING
    float beat = instanceMatrix[3].x * 1.31 + instanceMatrix[3].z * 0.83;
  #else
    float beat = 0.0;
  #endif
  float w = uWalkTime * uWalkPace + beat;
  float swing = sin(w);
  if (limb > 0.5 && limb < 2.5) {
    // Feet step in turn: lift, then swing forward and back.
    float step = limb < 1.5 ? swing : -swing;
    transformed.y += max(0.0, step) * 0.17 * uWalkStride;
    transformed.z += step * 0.15 * uWalkStride;
  } else if (limb > 3.5 && limb < 5.5) {
    // Arms swing against the feet.
    float reach = limb < 4.5 ? -swing : swing;
    transformed.z += reach * 0.13 * uWalkStride;
    transformed.y += abs(reach) * 0.05 * uWalkStride;
  } else if (limb > 2.5 && limb < 3.5) {
    // The tail sways, more towards its tip.
    transformed.x += sin(w * 0.6 + transformed.y * 2.5) * 0.12 * (0.3 + transformed.y);
  } else if (limb > 5.5) {
    // The head bobs a beat behind the body.
    transformed.y += sin(w * 2.0 - 0.9) * 0.022 * uWalkStride;
  }
  // A punch (big rats only; the punch attribute is zero for everyone else): the arm stretches
  // out hand first, x for the left arm and y for the right, and the body leans into it.
  if (limb > 3.5 && limb < 5.5) {
    float p = limb < 4.5 ? punch.x : punch.y;
    float hand = clamp((0.8 - transformed.y) / 0.4, 0.0, 1.0);
    transformed.z += p * 0.8 * hand;
    transformed.y += max(p, 0.0) * 0.34 * hand;
    transformed.x *= 1.0 - 0.5 * max(p, 0.0) * hand;
  }
  transformed.z += max(0.0, max(punch.x, punch.y)) * 0.12 * transformed.y;
  // The whole body bobs twice a cycle and waddles from foot to foot.
  float roll = swing * 0.1 * uWalkStride;
  float cr = cos(roll);
  float sr = sin(roll);
  transformed.xy = vec2(transformed.x * cr - transformed.y * sr, transformed.x * sr + transformed.y * cr);
  transformed.y += abs(swing) * 0.07 * uWalkStride;
}`,
      );
  };
  // Materials that differ only in pace and stride can share one compiled program.
  material.customProgramCacheKey = () => 'walk';
  return material;
}

/**
 * The dark line round a character: the same model drawn a little fatter, inside out,
 * in one flat colour. Only the rim shows past the model itself. It walks in step with
 * the material it outlines, so give it the same pace and stride. `width` is in model
 * units.
 */
export function outlineMaterial(pace: number, stride: number, width: number): MeshBasicMaterial {
  return walking(new MeshBasicMaterial({ color: 0x1b1533, side: BackSide }), pace, stride, width);
}

// --- Props ------------------------------------------------------------------------

/** Soft contact shadow under a unit: a flat disc on the lane. */
export function blobGeometry(): BufferGeometry {
  return new CircleGeometry(0.46, 12).rotateX(-Math.PI / 2);
}

/**
 * The tank the swarm rides in (SPEC 8.1): one unit wide, nose towards -z. It
 * wears the black cat's ears and red scarf so it reads as the player's.
 */
export function tankGeometry(): BufferGeometry {
  const hull = 0x4c9c62;
  const hullDark = 0x2f6b42;
  const track = 0x262a40;
  const steel = 0x8f9ab8;
  const parts = [
    // Tracks and their wheels.
    part(box(0.22, 0.24, 1.12), track, { p: [-0.39, 0.12, 0] }),
    part(box(0.22, 0.24, 1.12), track, { p: [0.39, 0.12, 0] }),
    ...[-0.4, -0.13, 0.13, 0.4].flatMap((z) => [
      part(rod(0.1, 0.1, 0.24, 12), steel, { p: [-0.39, 0.12, z], r: [0, 0, Math.PI / 2] }),
      part(rod(0.1, 0.1, 0.24, 12), steel, { p: [0.39, 0.12, z], r: [0, 0, Math.PI / 2] }),
    ]),
    // Hull, with a sloped nose.
    part(box(0.62, 0.22, 1.0), hull, { p: [0, 0.3, 0.02] }),
    part(box(0.6, 0.16, 0.34), hullDark, { p: [0, 0.27, -0.5], r: [0.5, 0, 0] }),
    part(box(0.5, 0.05, 0.3), hullDark, { p: [0, 0.42, 0.34] }),
    // Turret, barrel and muzzle.
    part(rod(0.27, 0.31, 0.2, 18), hull, { p: [0, 0.5, 0.06] }),
    part(rod(0.33, 0.33, 0.06, 18), 0xff3d4f, { p: [0, 0.42, 0.06] }),
    part(rod(0.06, 0.06, 0.62, 12), steel, { p: [0, 0.52, -0.48], r: [Math.PI / 2, 0, 0] }),
    part(rod(0.09, 0.09, 0.14, 12), track, { p: [0, 0.52, -0.82], r: [Math.PI / 2, 0, 0] }),
    // Cat ears and a hatch on the turret.
    part(spike(0.09, 0.2, 10), 0x22243f, { p: [-0.15, 0.68, 0.1], r: [0, 0, 0.25] }),
    part(spike(0.09, 0.2, 10), 0x22243f, { p: [0.15, 0.68, 0.1], r: [0, 0, -0.25] }),
    part(rod(0.11, 0.11, 0.04, 12), hullDark, { p: [0, 0.61, 0.08] }),
    // Headlamps.
    part(ball(0.05, 10), 0xfff1a8, { p: [-0.22, 0.34, -0.56] }),
    part(ball(0.05, 10), 0xfff1a8, { p: [0.22, 0.34, -0.56] }),
  ];
  return shade(merge(parts), 0.7);
}

/** A rocket, one unit long, nose towards -z: white body, red nose, blue fins. */
export function rocketGeometry(): BufferGeometry {
  const parts = [
    part(rod(0.11, 0.11, 0.62, 12), 0xf2f2f7, { p: [0, 0, 0.06], r: [Math.PI / 2, 0, 0] }),
    part(spike(0.11, 0.3, 12), 0xe5383b, { p: [0, 0, -0.4], r: [-Math.PI / 2, 0, 0] }),
    part(rod(0.08, 0.11, 0.08, 12), 0x55617d, { p: [0, 0, 0.41], r: [Math.PI / 2, 0, 0] }),
    part(box(0.42, 0.03, 0.22), 0x3b6cf0, { p: [0, 0, 0.3] }),
    part(box(0.03, 0.42, 0.22), 0x3b6cf0, { p: [0, 0, 0.3] }),
  ];
  return merge(parts);
}

/** Bullet: a capsule lying along the lane. */
export function bulletGeometry(radius: number, length: number): BufferGeometry {
  return new CapsuleGeometry(radius, length, 2, 6).rotateX(Math.PI / 2);
}
