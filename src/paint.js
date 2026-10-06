// "Hand-painted" normal maps: brush strokes laid into a height field, then differentiated into normals.

import { CanvasTexture, RepeatWrapping, NoColorSpace, SRGBColorSpace } from 'three/webgpu';

export function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// angle: main stroke direction in radians (0 = along u), jitter: spread around it.
export function paintNormalMap({ size = 512, strokes = 140, angle = Math.PI / 2, jitter = 0.35, width = [6, 22], length = [60, 220], strength = 3, seed = 1 } = {}) {
  const r = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';

  for (let i = 0; i < strokes; i++) {
    const a = angle + (r() - 0.5) * 2 * jitter;
    const len = length[0] + r() * (length[1] - length[0]);
    const w = width[0] + r() * (width[1] - width[0]);
    const x = r() * size;
    const y = r() * size;
    const bend = (r() - 0.5) * 0.6;
    const v = r() < 0.5 ? 255 : 0;
    // Each stroke is a stack of thinning passes: a ridge with soft shoulders, like a loaded brush.
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.05})`;
      g.lineWidth = w * (1 - k * 0.22);
      // Draw wrapped copies so the map tiles around the cup.
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          g.beginPath();
          const sx = x + ox, sy = y + oy;
          const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
          const mx = (sx + ex) / 2 - Math.sin(a) * len * bend, my = (sy + ey) / 2 + Math.cos(a) * len * bend;
          g.moveTo(sx, sy);
          g.quadraticCurveTo(mx, my, ex, ey);
          g.stroke();
        }
      }
    }
  }

  // Bristle grain inside strokes.
  const img = g.getImageData(0, 0, size, size);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = img.data[i * 4] / 255 + (r() - 0.5) * 0.015;

  const out = g.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      out.data[o] = (-dx / l) * 127.5 + 127.5;
      out.data[o + 1] = (dy / l) * 127.5 + 127.5;
      out.data[o + 2] = (1 / l) * 127.5 + 127.5;
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);

  const tex = new CanvasTexture(c);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = NoColorSpace;
  return tex;
}

// Kiwi cross-section: green flesh, pale core, a ring of black seeds.
export function kiwiTexture(colors) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = rng(7);
  const m = size / 2;
  const grad = g.createRadialGradient(m, m, 0, m, m, m);
  grad.addColorStop(0, colors.color2);
  grad.addColorStop(0.28, colors.color2);
  grad.addColorStop(0.4, colors.color);
  grad.addColorStop(1, colors.color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.fillStyle = colors.color3;
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + r() * 0.08;
    const d = m * (0.36 + r() * 0.08);
    g.save();
    g.translate(m + Math.cos(a) * d, m + Math.sin(a) * d);
    g.rotate(a);
    g.beginPath();
    g.ellipse(0, 0, 6, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
