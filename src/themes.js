// Colour tables per theme. Values follow the original's Cherry / Kiwi presets.

export const THEMES = {
  cherry: {
    label: 'Cherry',
    background: '#ffc7fe',
    horizon: '#8d95e2',
    table: { base: '#48a8ff', dark: '#ff2482', light: '#91fffa' },
    light: '#ffdcbd',
    jelly: { attenuation: '#e86dff', glow: '#ff1200' },
    cream: { color: '#ffcbb2', shade: '#ee8c72', glow: '#f44b85' },
    contactColor: '#ffb8e5',
    fruits: ['cherry', 'cherry', 'cherry', 'mandarin', 'mandarin', 'mandarin', 'shiratama', 'shiratama', 'peach', 'peach'],
  },
  kiwi: {
    label: 'Kiwi',
    background: '#2105ff',
    horizon: '#8fcbf7',
    table: { base: '#0dcbd4', dark: '#efff23', light: '#00a7ff' },
    light: '#ffe48c',
    jelly: { attenuation: '#b6ff00', glow: '#15bf10' },
    cream: { color: '#e1ff00', shade: '#c7ffca', glow: '#ffcf00' },
    contactColor: '#fff781',
    fruits: ['kiwi', 'kiwi', 'kiwi', 'pineapple', 'pineapple', 'pineapple', 'mango', 'mango', 'mango', 'shiratama'],
  },
};

export const FRUIT_COLORS = {
  mandarin: { color: '#ff9a18', color2: '#fff2dc', sss: '#ff7a00', roughness: 0.22 },
  cherry: { color: '#c00c22', color2: '#4f9a22', sss: '#ff2014', roughness: 0.16 },
  shiratama: { color: '#f4f0e8', color2: '#e2dbd0', sss: '#fff0e2', roughness: 0.34 },
  peach: { color: '#ffe6da', color2: '#ffa8b6', sss: '#ff8a8a', roughness: 0.24 },
  kiwi: { color: '#78be26', color2: '#eef0c4', color3: '#1c180c', sss: '#8ad030', roughness: 0.2 },
  pineapple: { color: '#ffd63a', color2: '#fff09a', sss: '#ffc000', roughness: 0.36 },
  mango: { color: '#ffb418', color2: '#ffca3c', sss: '#ff7a00', roughness: 0.32 },
};
