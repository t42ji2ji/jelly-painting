// Tuning panel for the painterly post (local development only): sliders on postU, remembered in this browser,
// and a button that copies the values so they can become the defaults in post.js.

import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { postU } from './post.js';

const KEY = 'jelly-tune';
const PARAMS = {
  Paint: {
    strength: [0, 1, 0.01, 'smear'],
    strokeLength: [0, 40, 0.5, 'stroke length (px)'],
    speckle: [0, 20, 0.5, 'edge scatter (px)'],
    ribContrast: [0, 0.6, 0.01, 'bristle ribs'],
    bristleScale: [1, 10, 0.1, 'rib size (px)'],
    spacing: [1, 12, 0.5, 'stroke direction blur'],
  },
  Grain: {
    grain: [0, 0.4, 0.005, 'amount'],
    grainSize: [1, 4, 1, 'size (px)'],
    grainColor: [0, 1.5, 0.05, 'colour noise'],
  },
};

export function createTuner(stage) {
  const defaults = {};
  const values = {};
  for (const group of Object.values(PARAMS)) for (const k of Object.keys(group)) defaults[k] = values[k] = postU[k].value;
  try {
    Object.assign(values, JSON.parse(localStorage.getItem(KEY)) ?? {});
  } catch {}

  const apply = (k) => {
    postU[k].value = values[k];
    if (k === 'bristleScale') stage.bristles.textureNeedsUpdate = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(values));
    } catch {}
  };

  const gui = new GUI({ title: 'Painting' });
  for (const [name, group] of Object.entries(PARAMS)) {
    const folder = gui.addFolder(name);
    for (const [k, [min, max, step, label]] of Object.entries(group)) {
      folder.add(values, k, min, max, step).name(label).onChange(() => apply(k));
      apply(k);
    }
  }
  const actions = {
    copy() {
      const changed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, +v.toFixed(3)]));
      navigator.clipboard?.writeText(JSON.stringify(changed, null, 2));
      console.log(changed);
    },
    reset() {
      Object.assign(values, defaults);
      for (const k of Object.keys(values)) apply(k);
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
  };
  gui.add(actions, 'copy').name('Copy values');
  gui.add(actions, 'reset').name('Reset');
}
