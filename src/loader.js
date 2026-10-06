// Loading screen: a brush paints a quick study of the scene on the paper while the 3D side compiles.
// Kept free of three.js so it starts before the big bundle arrives.

import { THEMES, PALETTES, backdropAt } from './themes.js';

const FRAME = 0.62; // must match postU.frameSize

const canvas = document.createElement('canvas');
canvas.className = 'loader';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const g = canvas.getContext('2d');
// Finished strokes live here; only the stroke in progress is redrawn each frame.
const doneCanvas = document.createElement('canvas');
const dg = doneCanvas.getContext('2d');
// Painting mask (rounded square dissolving into grain) and paper-tooth grain, rebuilt on resize.
const maskCanvas = document.createElement('canvas');
const grainCanvas = document.createElement('canvas');

// Same choice the app will make from the URL: which cup, or which backdrop for an empty model painting.
const params = new URLSearchParams(location.search);
const withCup = params.get('mode') !== 'model';
const theme = THEMES[params.get('theme')] ?? THEMES.cherry;
const palette = withCup ? PALETTES[theme.palette] : PALETTES[params.get('palette')] ?? PALETTES.lilac;
const study = theme.study;

let seed = 5;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const R = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];
const rgb = (c, k = 0) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v + k)))).join(',')})`;

// Strokes in painting units: (0,0) top-left, (1,1) bottom-right.
const strokes = [];
const add = (x0, y0, x1, y1, w, color, dur, alpha = 0.8, bend = R(-0.03, 0.03)) => strokes.push({ x0, y0, x1, y1, w, color, dur, alpha, bend });

// Ground first, top to bottom, each stroke taking the backdrop colour where it lies.
for (let i = 0; i < 30; i++) {
  const y = -0.04 + ((i % 15) + R(0.2, 0.8)) / 14;
  const left = rand() < 0.5;
  const x0 = left ? -0.1 : 1.1, x1 = left ? R(0.55, 1.1) : R(-0.1, 0.45);
  const c = backdropAt(palette.backdrop, (x0 + x1) / 2, y);
  add(x0, y, x1, y + R(-0.05, 0.05), R(0.1, 0.16), rgb(c, R(-10, 10)), R(0.1, 0.16), i < 15 ? 0.85 : 0.45);
}

if (withCup) {
  // Cup silhouette in painting units, per theme proportions.
  const coupe = theme.cup.shape === 'coupe';
  const tall = !coupe && theme.cup.H > 0.6;
  // A coupe's bowl sits high on its stem: draw the bowl here, the stem and foot below.
  const top = coupe ? 0.34 : tall ? 0.27 : 0.33, bottom = coupe ? 0.52 : tall ? 0.76 : 0.72;
  const wTop = coupe ? 0.72 : tall ? 0.42 : 0.6, wBot = coupe ? 0.14 : tall ? 0.28 : 0.44;
  const halfW = (y) => (wTop + (wBot - wTop) * ((y - top) / (bottom - top))) / 2;
  const sd = tall ? 1 : -1; // shadow falls right for Kiwi, left for Cherry
  const sc = backdropAt(palette.backdrop, 0.5 + sd * 0.25, 0.8);
  for (let i = 0; i < 4; i++) add(0.5, bottom - 0.02 + R(-0.03, 0.03), 0.5 + sd * R(0.32, 0.45), bottom + R(0.03, 0.12), 0.09, rgb(sc, -38), 0.18, 0.5);
  const creamTop = bottom - (bottom - top) * 0.3;
  for (let i = 0; i < 4; i++) {
    const y = R(creamTop + 0.02, bottom - 0.02);
    add(0.5 - halfW(y) + 0.02, y, 0.5 + halfW(y) - 0.02, y + R(-0.01, 0.01), 0.06, study.cream, 0.14, 0.85);
  }
  for (let i = 0; i < 8; i++) {
    const y = R(top + 0.06, creamTop);
    add(0.5 - halfW(y) + 0.03, y, 0.5 + halfW(y) - 0.03, y + R(-0.02, 0.02), 0.06, study.jelly, 0.14, 0.5);
  }
  for (let i = 0; i < 16; i++) {
    const y = R(top + 0.07, creamTop - 0.02);
    const x = 0.5 + R(-1, 1) * (halfW(y) - 0.06);
    add(x, y, x + R(0.03, 0.06), y + R(-0.03, 0.03), R(0.05, 0.08), pick(study.fruit), 0.08, 0.85, 0.06);
  }
  for (let k = 0; k < 2; k++) {
    add(0.5 - wTop / 2, top, 0.5 + wTop / 2, top, 0.016, study.glass, 0.18, 0.75, -0.07);
    add(0.5 - wTop / 2, top, 0.5 + wTop / 2, top, 0.014, study.glass, 0.18, 0.55, 0.05);
  }
  add(0.5 - wTop / 2 + 0.01, top + 0.01, 0.5 - wBot / 2, bottom, 0.014, study.glass, 0.12, 0.6, 0);
  add(0.5 + wTop / 2 - 0.01, top + 0.01, 0.5 + wBot / 2, bottom, 0.014, study.glass, 0.12, 0.6, 0);
  add(0.5 - wTop / 2 + 0.07, top + 0.05, 0.5 - wBot / 2 + 0.06, bottom - 0.04, 0.01, '#ffffff', 0.1, 0.7, 0);
  if (coupe) {
    add(0.5, bottom, 0.5, 0.74, 0.012, study.glass, 0.12, 0.7, 0);
    add(0.38, 0.75, 0.62, 0.75, 0.016, study.glass, 0.12, 0.7, 0.02);
  }
}

const start = performance.now();
let drawn = 0; // index of stroke being drawn
let progress = 0; // 0..1 along it
let frame = { x: 0, y: 0, s: 1 };
let running = true;
let W = 0, H = 0;

function layout() {
  const dpr = Math.min(devicePixelRatio, 2);
  W = innerWidth;
  H = innerHeight;
  for (const c of [canvas, doneCanvas]) {
    c.width = W * dpr;
    c.height = H * dpr;
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const s = Math.min(W, H) * FRAME;
  frame = { x: (W - s) / 2, y: (H - s) / 2, s };
  buildMask();
  dg.clearRect(0, 0, W, H);
  for (let i = 0; i < drawn; i++) paintStroke(dg, strokes[i], 1);
  present();
}

// Same rule as the post-processing frame: rounded square whose edge dissolves into per-pixel grain.
function buildMask() {
  maskCanvas.width = grainCanvas.width = W;
  maskCanvas.height = grainCanvas.height = H;
  const m = maskCanvas.getContext('2d').createImageData(W, H);
  const gr = grainCanvas.getContext('2d').createImageData(W, H);
  const half = frame.s / 2, rad = half * 0.09, edge = 7;
  const cx = W / 2, cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x - cx) - half + rad, qy = Math.abs(y - cy) - half + rad;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad + Math.sin(x * 0.05) * Math.sin(y * 0.043) * 2;
      const a = Math.max(0, Math.min(1, 0.5 - (d + (Math.random() - 0.5) * edge * 2.4) / (2 * edge)));
      const o = (y * W + x) * 4;
      m.data[o + 3] = a * 255;
      const v = Math.random() < 0.5 ? 255 : 0;
      gr.data[o] = gr.data[o + 1] = gr.data[o + 2] = v;
      gr.data[o + 3] = Math.random() * 34;
    }
  }
  maskCanvas.getContext('2d').putImageData(m, 0, 0);
  grainCanvas.getContext('2d').putImageData(gr, 0, 0);
}

function present() {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.restore();
  g.drawImage(doneCanvas, 0, 0, W, H);
  if (drawn < strokes.length) paintStroke(g, strokes[drawn], progress);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(maskCanvas, 0, 0, W, H);
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(grainCanvas, 0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}

const pt = (st, u) => {
  const mx = (st.x0 + st.x1) / 2 - (st.y1 - st.y0) * st.bend * 4;
  const my = (st.y0 + st.y1) / 2 + (st.x1 - st.x0) * st.bend * 4;
  const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
  return [a * st.x0 + b * mx + c * st.x1, a * st.y0 + b * my + c * st.y1];
};

// One brush stroke up to u1: a bundle of bristles with their own offsets and opacity, some running out early.
function paintStroke(ctx, st, u1) {
  if (u1 <= 0) return;
  st.bristles ??= Array.from({ length: 14 }, () => ({ o: R(-0.5, 0.5), a: R(0.35, 1), w: R(0.5, 1.2), end: R(0.8, 1) }));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = st.color;
  const steps = Math.max(2, Math.ceil(u1 * 40));
  for (const b of st.bristles) {
    const e1 = Math.min(u1, b.end);
    ctx.globalAlpha = st.alpha * b.a * 0.55;
    ctx.lineWidth = ((st.w * frame.s) / 14) * 2.6 * b.w;
    ctx.beginPath();
    for (let k = 0; k <= steps; k++) {
      const u = (e1 * k) / steps;
      const [x, y] = pt(st, u);
      const [x2, y2] = pt(st, Math.min(1, u + 0.01));
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
      const off = b.o * st.w;
      const px = frame.x + (x - (dy / l) * off) * frame.s;
      const py = frame.y + (y + (dx / l) * off) * frame.s;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

let last = start;
function tick(now) {
  if (!running) return;
  // Catch up after main-thread stalls (shader compilation) instead of freezing mid-stroke.
  let dt = (now - last) / 1000;
  last = now;
  while (dt > 0 && drawn < strokes.length) {
    const st = strokes[drawn];
    const du = Math.min(1 - progress, dt / st.dur);
    progress += du;
    dt -= du * st.dur;
    if (progress >= 1) {
      paintStroke(dg, st, 1);
      drawn++;
      progress = 0;
    }
  }
  present();
  requestAnimationFrame(tick);
}

layout();
addEventListener('resize', layout);
requestAnimationFrame(tick);

export const loader = {
  // Seconds the study has been painting; the reveal waits for at least a few strokes.
  elapsed: () => (performance.now() - start) / 1000,
  remove() {
    running = false;
    removeEventListener('resize', layout);
    canvas.remove();
  },
};
