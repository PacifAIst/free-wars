// Pictures of the items: what a panel on a rail or a falling box carries.
// One style for all of them: flat shapes with a thick dark outline, drawn with
// the 2D canvas, so there is still no image file to ship. The 3D view puts them
// on panels and boxes; the map editor uses the same pictures for its palette.

export interface Item {
  /** Name, shown when the item is collected and in the map editor. */
  text: string;
  /** Colour of the label, as CSS, and of the sides of its panel. */
  face: string;
  side: number;
  /** Colour of the light when it is collected. */
  glow: readonly [number, number, number];
}

/** Indexed by drop code (D9, A34). Code 0 is a surprise, rolled when it is collected. */
export const ITEMS: readonly Item[] = [
  { text: '?', face: '#e0448f', side: 0xa82566, glow: [1.0, 0.4, 0.7] },
  { text: '+1', face: '#2fb85c', side: 0x1f8a43, glow: [0.3, 1.0, 0.45] },
  { text: '+3', face: '#1fa7b8', side: 0x157887, glow: [0.25, 0.9, 1.0] },
  { text: '+10', face: '#8a5cf0', side: 0x6238c4, glow: [0.7, 0.5, 1.0] },
  { text: '+50', face: '#f2a000', side: 0xbf7a00, glow: [1.0, 0.75, 0.2] },
  { text: 'MINIGUN', face: '#f2701d', side: 0xb84f0e, glow: [1.0, 0.55, 0.2] },
  { text: 'LASER', face: '#d83a4c', side: 0xa81f22, glow: [1.0, 0.3, 0.3] },
  { text: 'ROCKET', face: '#3b6cf0', side: 0x2448b0, glow: [0.4, 0.6, 1.0] },
  { text: 'TANK', face: '#4f9a3a', side: 0x356d26, glow: [0.5, 1.0, 0.4] },
  { text: 'BOMB', face: '#5a5f85', side: 0x3a3e5c, glow: [1.0, 0.5, 0.2] },
];

const INK = '#1b1736';
const WHITE = '#ffffff';
const STEEL = '#c9d2e8';
const STEEL_DARK = '#7f8aa8';
const FAMILY = '"Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

type G = CanvasRenderingContext2D;

/** Fills the current path, then outlines it in ink. `line` is the outline width in picture units. */
function paint(g: G, fill: string, line = 0.09): void {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = line;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

function rect(g: G, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  paint(g, fill);
}

function circle(g: G, x: number, y: number, r: number, fill: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  paint(g, fill);
}

function polygon(g: G, points: readonly number[], fill: string): void {
  g.beginPath();
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath();
  paint(g, fill);
}

// Each picture is drawn in a square from -1 to 1.

function catHead(g: G): void {
  polygon(g, [-0.78, -0.82, -0.2, -0.5, -0.72, -0.1], WHITE);
  polygon(g, [0.78, -0.82, 0.2, -0.5, 0.72, -0.1], WHITE);
  circle(g, 0, 0.12, 0.72, WHITE);
  g.fillStyle = INK;
  for (const x of [-0.28, 0.28]) {
    g.beginPath();
    g.ellipse(x, 0.05, 0.09, 0.14, 0, 0, Math.PI * 2);
    g.fill();
  }
  polygon(g, [-0.09, 0.3, 0.09, 0.3, 0, 0.42], '#ff8fb0');
}

function minigun(g: G): void {
  rect(g, -0.3, 0.2, 0.26, 0.5, 0.06, STEEL_DARK);
  for (const y of [-0.34, -0.11, 0.12]) rect(g, -0.05, y, 0.98, 0.17, 0.05, STEEL);
  rect(g, 0.62, -0.42, 0.14, 0.79, 0.04, STEEL_DARK);
  rect(g, -0.62, -0.42, 0.66, 0.8, 0.12, WHITE);
  circle(g, -0.62, -0.02, 0.33, '#ffd23f');
  circle(g, -0.62, -0.02, 0.1, INK);
}

function laser(g: G): void {
  g.strokeStyle = '#ffe1e1';
  g.lineCap = 'round';
  for (const [x1, y1, x2, y2] of [
    [0.42, -0.3, 0.7, -0.62],
    [0.42, 0.3, 0.7, 0.62],
  ]) {
    g.lineWidth = 0.2;
    g.strokeStyle = INK;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.lineWidth = 0.08;
    g.strokeStyle = '#ffe1e1';
    g.stroke();
  }
  rect(g, 0.1, -0.11, 0.86, 0.22, 0.1, '#ffe1e1');
  rect(g, -0.9, -0.3, 0.72, 0.6, 0.12, WHITE);
  rect(g, -0.66, 0.2, 0.24, 0.5, 0.06, STEEL_DARK);
  polygon(g, [-0.2, -0.38, 0.22, -0.16, 0.22, 0.16, -0.2, 0.38], STEEL);
  circle(g, -0.54, 0, 0.13, '#ff5a6a');
}

function rocket(g: G): void {
  g.save();
  g.rotate(-0.6);
  polygon(g, [-0.62, -0.16, -1.0, 0, -0.62, 0.16], '#ffb020');
  polygon(g, [-0.62, -0.2, -0.3, -0.2, -0.62, -0.52], '#3bd0ff');
  polygon(g, [-0.62, 0.2, -0.3, 0.2, -0.62, 0.52], '#3bd0ff');
  rect(g, -0.64, -0.22, 1.0, 0.44, 0.08, WHITE);
  g.beginPath();
  g.moveTo(0.34, -0.22);
  g.quadraticCurveTo(0.86, -0.18, 0.98, 0);
  g.quadraticCurveTo(0.86, 0.18, 0.34, 0.22);
  g.closePath();
  paint(g, '#ff5a6a');
  circle(g, 0, 0, 0.11, '#3bd0ff');
  g.restore();
}

function tank(g: G): void {
  rect(g, 0.2, -0.5, 0.78, 0.17, 0.05, STEEL);
  rect(g, -0.42, -0.62, 0.72, 0.5, 0.14, '#b9f0a8');
  rect(g, -0.72, -0.16, 1.44, 0.42, 0.1, WHITE);
  rect(g, -0.92, 0.2, 1.84, 0.5, 0.25, STEEL_DARK);
  for (const x of [-0.6, -0.2, 0.2, 0.6]) circle(g, x, 0.45, 0.13, STEEL);
}

function bomb(g: G): void {
  g.beginPath();
  g.moveTo(0.28, -0.42);
  g.quadraticCurveTo(0.42, -0.86, 0.72, -0.74);
  g.lineWidth = 0.2;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.stroke();
  g.lineWidth = 0.08;
  g.strokeStyle = '#e8d9b0';
  g.stroke();
  // Spark at the end of the fuse.
  const spark: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.24 : 0.1;
    spark.push(0.74 + Math.cos(a) * r, -0.74 + Math.sin(a) * r);
  }
  polygon(g, spark, '#ffd23f');
  g.save();
  g.translate(0.22, -0.42);
  g.rotate(0.5);
  rect(g, -0.17, -0.13, 0.34, 0.26, 0.05, STEEL_DARK);
  g.restore();
  circle(g, -0.08, 0.2, 0.66, '#2a2d45');
  g.beginPath();
  g.arc(-0.08, 0.2, 0.44, Math.PI * 1.05, Math.PI * 1.45);
  g.lineWidth = 0.1;
  g.strokeStyle = WHITE;
  g.stroke();
}

function label(g: G, text: string, x: number, size: number): void {
  g.font = `900 ${size}px ${FAMILY}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.2;
  g.strokeStyle = INK;
  g.strokeText(text, x, 0.06);
  g.fillStyle = WHITE;
  g.fillText(text, x, 0.06);
}

const PICTURES: readonly ((g: G) => void)[] = [
  (g) => label(g, '?', 0, 1.7),
  catHead,
  catHead,
  catHead,
  catHead,
  minigun,
  laser,
  rocket,
  tank,
  bomb,
];

/**
 * Draws the picture of drop code `drop` centred on (cx, cy), fitted in a box
 * `width` by `height`. A clone reward is a cat's head with its number beside it.
 */
export function drawItem(g: G, drop: number, cx: number, cy: number, width: number, height: number): void {
  const item = ITEMS[drop] ?? ITEMS[0];
  const unit = height / 2;
  g.save();
  g.translate(cx, cy);
  g.scale(unit, unit);
  if (drop >= 1 && drop <= 4) {
    // The head on the left, the number on the right.
    const half = width / height;
    g.save();
    g.translate(-half * 0.6, 0);
    g.scale(0.8, 0.8);
    catHead(g);
    g.restore();
    label(g, item.text, half * 0.4, item.text.length > 2 ? 1.2 : 1.45);
  } else {
    g.scale(0.92, 0.92);
    PICTURES[drop in PICTURES ? drop : 0](g);
  }
  g.restore();
}

/** The label of an item: its colour, a pale frame, and its picture. */
export function itemCanvas(drop: number, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d') as G;
  g.fillStyle = (ITEMS[drop] ?? ITEMS[0]).face;
  g.fillRect(0, 0, width, height);
  const frame = Math.max(2, height * 0.07);
  g.lineWidth = frame;
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.strokeRect(frame * 0.75, frame * 0.75, width - frame * 1.5, height - frame * 1.5);
  drawItem(g, drop, width / 2, height / 2, width * 0.86, height * 0.78);
  return canvas;
}
