// Backdrops: base colour plus soft glows in painting coordinates ((0,0) top-left, (1,1) bottom-right), display space.
// Cherry and Kiwi are sampled from the original; the rest are new, built the same way (a mid tone, a light corner,
// a cool or warm counter-corner, a deeper pool low in the frame).

export const PALETTES = {
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
    light: '#ffdcbd',
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
    light: '#ffe48c',
  },
  milktea: {
    label: 'Milk tea',
    backdrop: {
      base: '#dfc0ad',
      glows: [
        { at: [1, 0], radius: 0.75, color: '#f3e3cf', strength: 0.9 },
        { at: [0, 0.65], radius: 0.6, color: '#c7a6b6', strength: 0.75 },
        { at: [0.55, 1.05], radius: 0.5, color: '#c39a86', strength: 0.6 },
        { at: [0.9, 0.85], radius: 0.4, color: '#e9cdb6', strength: 0.45 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#946a5c', opacity: 0.45, length: 1.4, width: 0.85 },
    light: '#ffe6c8',
  },
  peach: {
    label: 'Peach',
    backdrop: {
      base: '#efb9a6',
      glows: [
        { at: [1, 0], radius: 0.75, color: '#f8dcc0', strength: 0.9 },
        { at: [0, 0.6], radius: 0.6, color: '#e2a3b6', strength: 0.8 },
        { at: [0.6, 1.05], radius: 0.55, color: '#dc928c', strength: 0.6 },
        { at: [0.1, 0.05], radius: 0.4, color: '#f3c8b4', strength: 0.5 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#c0707e', opacity: 0.45, length: 1.4, width: 0.95 },
    light: '#ffe2c4',
  },
  lilac: {
    label: 'Lilac',
    backdrop: {
      base: '#a59bd4',
      glows: [
        { at: [1, 0], radius: 0.7, color: '#d2c3ea', strength: 0.9 },
        { at: [0, 0.7], radius: 0.6, color: '#8288cc', strength: 0.75 },
        { at: [0.5, 1.05], radius: 0.5, color: '#8c79c2', strength: 0.6 },
        { at: [0.85, 0.9], radius: 0.4, color: '#e4b9d6', strength: 0.5 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#5f5aa8', opacity: 0.5, length: 1.5, width: 1.0 },
    light: '#ffe0d0',
  },
  butter: {
    label: 'Butter',
    backdrop: {
      base: '#efd48e',
      glows: [
        { at: [1, 0], radius: 0.75, color: '#f8ebbf', strength: 0.9 },
        { at: [0, 0.65], radius: 0.6, color: '#e6bc78', strength: 0.75 },
        { at: [0.55, 1.05], radius: 0.5, color: '#d8a86a', strength: 0.55 },
        { at: [0.9, 0.85], radius: 0.4, color: '#c9d49a', strength: 0.45 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#b48850', opacity: 0.45, length: 1.4, width: 0.95 },
    light: '#fff0cc',
  },
  seaglass: {
    label: 'Sea glass',
    backdrop: {
      base: '#8ec6bd',
      glows: [
        { at: [1, 0], radius: 0.7, color: '#cfe6d6', strength: 0.9 },
        { at: [0, 0.7], radius: 0.6, color: '#6ea9bf', strength: 0.75 },
        { at: [0.55, 1.05], radius: 0.5, color: '#5f9fae', strength: 0.55 },
        { at: [0.1, 0.05], radius: 0.4, color: '#b5d8c9', strength: 0.5 },
      ],
      noise: 0.03,
    },
    shadow: { color: '#4b8a9e', opacity: 0.45, length: 1.4, width: 0.95 },
    light: '#fff2dc',
  },
  night: {
    label: 'Night',
    backdrop: {
      base: '#3d4878',
      glows: [
        { at: [1, 0], radius: 0.75, color: '#6670a6', strength: 0.85 },
        { at: [0, 0.7], radius: 0.6, color: '#2c3360', strength: 0.75 },
        { at: [0.5, 1.05], radius: 0.55, color: '#4a3c74', strength: 0.6 },
        { at: [0.15, 0.05], radius: 0.4, color: '#525e93', strength: 0.5 },
      ],
      noise: 0.04,
    },
    shadow: { color: '#1c2146', opacity: 0.55, length: 1.5, width: 1.0 },
    light: '#ffd9b0',
  },
};

// Cup scenes: contents and framing; the backdrop comes from their palette.
export const THEMES = {
  cherry: {
    label: 'Cherry',
    palette: 'cherry',
    cameraAzimuth: 113.5,
    cup: { H: 0.5, Rb: 0.36, Rt: 0.52, flange: false },
    jelly: { attenuation: '#e86dff', glow: '#ff3a40', fill: 0.78 },
    cream: { color: '#ffcbb2', shade: '#f19a8c', glow: '#f44b85', height: 0.28 },
    fruits: { peach: 6, mandarin: 5, cherry: 4, pineapple: 3, mango: 3, shiratama: 2 },
    study: { jelly: '#e7aabb', cream: '#f2a6a6', fruit: ['#e07155', '#df9a71', '#d23a4a', '#f2b38a'], glass: '#eef4fb' },
  },
  kiwi: {
    label: 'Kiwi',
    palette: 'kiwi',
    cameraAzimuth: -23.5,
    cup: { H: 0.74, Rb: 0.27, Rt: 0.4, flange: true },
    jelly: { attenuation: '#b6ff00', glow: '#2bd410', fill: 0.8 },
    cream: { color: '#efe34a', shade: '#d7e08c', glow: '#ffcf00', height: 0.3 },
    fruits: { kiwi: 8, pineapple: 6, mango: 6 },
    study: { jelly: '#9cbd55', cream: '#d6c96c', fruit: ['#7fb33a', '#e9c13c', '#f0a23a', '#5f9a30'], glass: '#eef7f2' },
  },
  boba: {
    label: 'Boba',
    palette: 'milktea',
    cameraAzimuth: 55,
    cup: { H: 0.8, Rb: 0.29, Rt: 0.39, flange: true },
    // Milk tea: milky, so a short attenuation distance and a pale body colour; brown-sugar syrup in place of cream.
    jelly: { attenuation: '#e2b17c', glow: '#d79a5c', fill: 0.86, color: '#efcfa8', distance: 0.5, transmission: 0.45, clearBottom: 1 },
    cream: { color: '#6a3214', shade: '#3a1608', glow: '#9a5420', height: 0.06 },
    fruits: { pearl: 40 },
    straw: '#ff9fbd',
    study: { jelly: '#d7b28e', cream: '#5a2a12', fruit: ['#2a140c', '#3a2010'], glass: '#f5efe8' },
  },
  coupe: {
    label: 'Coupe',
    palette: 'peach',
    cameraAzimuth: 70,
    cup: { shape: 'coupe', H: 0.7, Rb: 0.24, Rt: 0.54, D: 0.3 },
    jelly: { attenuation: '#ff8fb4', glow: '#ff5f8a', fill: 0.92 },
    cream: { color: '#fff4e6', shade: '#f0d6c2', glow: '#ffcdb8', height: 0.32 },
    fruits: { raspberry: 4, blueberry: 5 },
    study: { jelly: '#f2a9bd', cream: '#fbeee2', fruit: ['#d81f4a', '#3b4c8f', '#ff6f8f'], glass: '#f7f1ee' },
  },
  soda: {
    label: 'Soda',
    palette: 'seaglass',
    cameraAzimuth: 20,
    cup: { H: 0.86, Rb: 0.29, Rt: 0.33, flange: false },
    jelly: { attenuation: '#7fd6ff', glow: '#2aa8ff', fill: 0.84, color: '#f2fbff', distance: 1.4 },
    fruits: { ice: 4, lemon: 2, bubble: 40 },
    straw: '#ff8fa3',
    study: { jelly: '#9fdcf0', cream: '#9fdcf0', fruit: ['#f4fbff', '#ffe14a', '#ffffff'], glass: '#eef8fb' },
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
  pearl: { color: '#2b140b', color2: '#5a2e18', color3: '#1a0a05', sss: '#5a2a10', roughness: 0.12 },
  raspberry: { color: '#d81f4a', color2: '#ff6f8f', color3: '#8f0f2a', sss: '#ff2050', roughness: 0.3 },
  blueberry: { color: '#3b4c8f', color2: '#8797c8', color3: '#1e2550', sss: '#4a5aa0', roughness: 0.45 },
  ice: { color: '#f4fbff', color2: '#ffffff', color3: '#c4e6f7', sss: '#d8f3ff', roughness: 0.05 },
  lemon: { color: '#ffd92e', color2: '#fffbe8', color3: '#fff07a', sss: '#ffd000', roughness: 0.25 },
  bubble: { color: '#ffffff', color2: '#ffffff', color3: '#e0f6ff', sss: '#ffffff', roughness: 0.02 },
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
