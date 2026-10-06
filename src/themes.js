// Colour tables per theme. Display-space colours sampled from the original's Cherry / Kiwi paintings.
// backdrop: base colour plus soft glows, positioned in painting coordinates ((0,0) top-left, (1,1) bottom-right).

export const THEMES = {
  cherry: {
    label: 'Cherry',
    backdrop: {
      base: '#84b3cb',
      glows: [
        { at: [1, 0], radius: 0.75, color: '#a2ccce', strength: 0.9 },
        { at: [0, 0.65], radius: 0.6, color: '#9a9ccd', strength: 0.85 },
        { at: [0.55, 1.05], radius: 0.55, color: '#6aa3cb', strength: 0.7 },
        { at: [0.15, 0.05], radius: 0.4, color: '#93bccc', strength: 0.5 },
      ],
      noise: 0.035,
    },
    shadow: { color: '#5d78c0', opacity: 0.55, length: 1.5, width: 1.05 },
    cameraAzimuth: 113.5,
    light: '#ffdcbd',
    cup: { H: 0.5, Rb: 0.36, Rt: 0.52, flange: false },
    jelly: { attenuation: '#e86dff', glow: '#ff3a40', fill: 0.78 },
    cream: { color: '#ffcbb2', shade: '#f19a8c', glow: '#f44b85', height: 0.28 },
    fruits: { peach: 6, mandarin: 5, cherry: 4, pineapple: 3, mango: 3, shiratama: 2 },
    study: { jelly: '#e7aabb', cream: '#f2a6a6', fruit: ['#e07155', '#df9a71', '#d23a4a', '#f2b38a'], glass: '#eef4fb' },
  },
  kiwi: {
    label: 'Kiwi',
    backdrop: {
      base: '#52c1ad',
      glows: [
        { at: [1, 0], radius: 0.7, color: '#d2cd86', strength: 0.95 },
        { at: [0, 0], radius: 0.45, color: '#b0c9a2', strength: 0.75 },
        { at: [1, 1], radius: 0.5, color: '#a8c69e', strength: 0.7 },
        { at: [0.2, 0.75], radius: 0.45, color: '#4cbdb4', strength: 0.5 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#3a9fae', opacity: 0.4, length: 1.3, width: 0.8 },
    cameraAzimuth: -23.5,
    light: '#ffe48c',
    cup: { H: 0.74, Rb: 0.27, Rt: 0.4, flange: true },
    jelly: { attenuation: '#b6ff00', glow: '#2bd410', fill: 0.8 },
    cream: { color: '#efe34a', shade: '#d7e08c', glow: '#ffcf00', height: 0.3 },
    fruits: { kiwi: 8, pineapple: 6, mango: 6 },
    study: { jelly: '#9cbd55', cream: '#d6c96c', fruit: ['#7fb33a', '#e9c13c', '#f0a23a', '#5f9a30'], glass: '#eef7f2' },
  },
};

export const FRUIT_COLORS = {
  mandarin: { color: '#ff9a18', color2: '#fff2dc', color3: '#ff840e', sss: '#ff7a00', roughness: 0.22 },
  cherry: { color: '#c00c22', color2: '#4f9a22', color3: '#6a3a1a', sss: '#ff2014', roughness: 0.16 },
  shiratama: { color: '#f4f0e8', color2: '#e2dbd0', color3: '#dfe2e6', sss: '#fff0e2', roughness: 0.34 },
  peach: { color: '#ffe6da', color2: '#ffa8b6', color3: '#ff3f73', sss: '#ff8a8a', roughness: 0.24 },
  kiwi: { color: '#78be26', color2: '#eef0c4', color3: '#1c180c', sss: '#8ad030', roughness: 0.2 },
  pineapple: { color: '#ffd63a', color2: '#fff09a', color3: '#f0a818', sss: '#ffc000', roughness: 0.36 },
  mango: { color: '#ffb418', color2: '#ffca3c', color3: '#ff900c', sss: '#ff7a00', roughness: 0.32 },
};

// Backdrop colour at painting coordinates, shared by the table shader (via uniforms) and the loading study.
export function backdropAt(b, x, y) {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  let c = hex(b.base);
  for (const g of b.glows) {
    const d = Math.hypot(x - g.at[0], y - g.at[1]);
    const t = Math.max(0, Math.min(1, 1 - d / g.radius));
    const k = t * t * (3 - 2 * t) * g.strength;
    const gc = hex(g.color);
    c = c.map((v, i) => v + (gc[i] - v) * k);
  }
  return c;
}
