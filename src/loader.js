// Loading screen: a brush paints a quick study of the cup on the paper while the scene compiles.
// Kept free of three.js so it starts before the big bundle arrives.

import { THEMES } from './themes.js';

const canvas = document.createElement('canvas');
canvas.className = 'loader';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const g = canvas.getContext('2d');
// Finished strokes live here; only the stroke in progress is redrawn each frame.
const doneCanvas = document.createElement('canvas');
const dg = doneCanvas.getContext('2d');

let themeName = new URLSearchParams(location.search).get('theme');
if (!THEMES[themeName]) themeName = 'cherry';
const theme = THEMES[themeName];

let seed = 5;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const R = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];

// Strokes in frame units: (0,0) top-left of the painting, (1,1) bottom-right.
// Each: from (x0,y0) to (x1,y1) bending by `bend`, width w, colour, duration.
const strokes = [];
const add = (x0, y0, x1, y1, w, color, dur, alpha = 0.85, bend = R(-0.03, 0.03)) => strokes.push({ x0, y0, x1, y1, w, color, dur, alpha, bend });

const t = theme.table;
for (let i = 0; i < 26; i++) {
  // Blocked in top to bottom, the way a painter covers the ground first.
  const y = -0.04 + ((i % 13) + R(0.2, 0.8)) / 12;
  const left = rand() < 0.5;
  add(left ? -0.1 : 1.1, y, left ? R(0.6, 1.1) : R(-0.1, 0.4), y + R(-0.06, 0.06), R(0.1, 0.16), pick([t.base, t.base, t.light, t.dark]), R(0.12, 0.2), i < 12 ? 0.9 : 0.5);
}
// Shadow pooling away from the light.
for (let i = 0; i < 3; i++) add(0.18, R(0.72, 0.8), 0.55, R(0.76, 0.84), 0.06, '#8a76a8', 0.25, 0.55);
// Cream band at the bottom of the cup.
const cupX = () => 0.5;
const halfW = (y) => 0.34 - 0.1 * ((y - 0.17) / 0.61);
for (let i = 0; i < 4; i++) {
  const y = R(0.64, 0.74);
  add(cupX(y) - halfW(y) + 0.02, y, cupX(y) + halfW(y) - 0.02, y + R(-0.01, 0.01), 0.05, pick([theme.cream.color, theme.cream.shade]), 0.18, 0.9);
}
// Jelly body.
for (let i = 0; i < 9; i++) {
  const y = R(0.3, 0.62);
  add(cupX(y) - halfW(y) + 0.03, y, cupX(y) + halfW(y) - 0.03, y + R(-0.02, 0.02), 0.06, pick([theme.jelly.attenuation, '#ffd0f4', '#ffffff']), 0.18, 0.55);
}
// Fruit dabs.
const fruitColors = { cherry: '#c00c22', mandarin: '#ff9a18', shiratama: '#f4f0e8', peach: '#ffa8b6', kiwi: '#78be26', pineapple: '#ffd63a', mango: '#ffb418' };
for (let i = 0; i < 8; i++) {
  const x = R(0.3, 0.7), y = R(0.3, 0.55);
  add(x, y, x + R(0.03, 0.07), y + R(-0.03, 0.03), R(0.04, 0.06), fruitColors[pick(theme.fruits)], 0.1, 0.9, 0.05);
}
// Glass: the rim and the two walls, thin and pale.
for (let k = 0; k < 2; k++) {
  add(0.16, 0.24, 0.84, 0.24, 0.025, '#f2ecff', 0.2, 0.7, -0.09);
  add(0.16, 0.24, 0.84, 0.24, 0.02, '#f2ecff', 0.2, 0.5, 0.06);
}
add(0.17, 0.25, 0.25, 0.76, 0.02, '#f2ecff', 0.15, 0.6, 0);
add(0.83, 0.25, 0.75, 0.76, 0.02, '#f2ecff', 0.15, 0.6, 0);
add(0.26, 0.77, 0.74, 0.77, 0.025, '#f2ecff', 0.15, 0.5, 0.04);

const start = performance.now();
let drawn = 0; // index of stroke being drawn
let progress = 0; // 0..1 along it
let frame = { x: 0, y: 0, s: 1 };
let edge = [];
let running = true;

function layout() {
  const dpr = Math.min(devicePixelRatio, 2);
  for (const [c, x] of [[canvas, g], [doneCanvas, dg]]) {
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const s = Math.min(innerWidth, innerHeight) * 0.82;
  frame = { x: (innerWidth - s) / 2, y: (innerHeight - s) / 2, s };
  // Deckled square, same idea as the post-processing frame.
  edge = [];
  const n = 240;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const side = Math.floor(u * 4), f = (u * 4) % 1;
    const j = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const o = (j - 0.5) * 0.02 + Math.sin(i * 0.7) * 0.004;
    const p = [[f, 0 - o], [1 + o, f], [1 - f, 1 + o], [0 - o, 1 - f]][side];
    edge.push(p);
  }
  // Repaint what was already done.
  dg.fillStyle = '#f7f5f0';
  dg.fillRect(0, 0, innerWidth, innerHeight);
  for (let i = 0; i < drawn; i++) paintStroke(dg, strokes[i], 1);
  present();
}

function present() {
  g.drawImage(doneCanvas, 0, 0, innerWidth, innerHeight);
  if (drawn < strokes.length) paintStroke(g, strokes[drawn], progress);
}

const pt = (st, u) => {
  const mx = (st.x0 + st.x1) / 2 - (st.y1 - st.y0) * st.bend * 4;
  const my = (st.y0 + st.y1) / 2 + (st.x1 - st.x0) * st.bend * 4;
  const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
  return [a * st.x0 + b * mx + c * st.x1, a * st.y0 + b * my + c * st.y1];
};

// One brush stroke up to u1: a bundle of bristles with their own offsets and opacity, some running out early.
function paintStroke(g, st, u1) {
  const u0 = 0;
  if (u1 <= u0) return;
  g.save();
  g.beginPath();
  edge.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, frame.x + x * frame.s, frame.y + y * frame.s));
  g.closePath();
  g.clip();
  st.bristles ??= Array.from({ length: 14 }, () => ({ o: R(-0.5, 0.5), a: R(0.35, 1), w: R(0.5, 1.2), end: R(0.8, 1) }));
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = st.color;
  const steps = Math.max(2, Math.ceil((u1 - u0) * 40));
  for (const b of st.bristles) {
    const e1 = Math.min(u1, b.end);
    if (e1 <= u0) continue;
    g.globalAlpha = st.alpha * b.a * 0.55;
    g.lineWidth = ((st.w * frame.s) / 14) * 2.6 * b.w;
    g.beginPath();
    for (let k = 0; k <= steps; k++) {
      const u = u0 + ((e1 - u0) * k) / steps;
      const [x, y] = pt(st, u);
      const [x2, y2] = pt(st, Math.min(1, u + 0.01));
      const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
      const off = b.o * st.w;
      const px = frame.x + (x - (dy / l) * off) * frame.s;
      const py = frame.y + (y + (dx / l) * off) * frame.s;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
  g.restore();
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
