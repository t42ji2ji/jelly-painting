// Tuning panel (local development only): sliders on the painterly post (postU), the cup's motion (SIM) and the
// jelly (JELLY), remembered in this browser, and a button that copies the values so they can become the defaults.

import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { postU } from './post.js';
import { SIM } from './sim.js';
import { JELLY } from './jelly.js';

// Where each slider's value lives: uniforms hold it in .value, the sim objects directly.
const get = (k) => (k in postU ? postU[k].value : k in SIM ? SIM[k] : JELLY[k]);
const set = (k, v) => {
  if (k in postU) postU[k].value = v;
  else if (k in SIM) SIM[k] = v;
  else JELLY[k] = v;
};

const KEY = 'jelly-tune';
const PARAMS = {
  Paint: {
    strength: [0, 1, 0.01, 'smear'],
    strokeLength: [0, 40, 0.5, 'stroke length (px)'],
    speckle: [0, 40, 0.5, 'edge scatter (px)'],
    ribContrast: [0, 0.6, 0.01, 'bristle ribs'],
    bristleScale: [1, 10, 0.1, 'rib size (px)'],
    spacing: [1, 12, 0.5, 'stroke direction blur'],
  },
  Grain: {
    grain: [0, 0.4, 0.005, 'amount'],
    grainSize: [1, 4, 1, 'size (px)'],
    grainColor: [0, 1.5, 0.05, 'colour noise'],
  },
  Motion: {
    homeFrequency: [0.5, 8, 0.1, 'return speed (Hz)'],
    homeDamping: [0.1, 2, 0.05, 'return damping (<1 bounces)'],
    damping: [0.5, 15, 0.5, 'jelly damping'],
    stiffness: [1, 8, 0.1, 'jelly stiffness'],
    inertia: [0, 0.8, 0.01, 'jelly throw'],
    drag: [0, 2, 0.05, 'jelly trail'],
  },
};

export function createTuner(stage) {
  const defaults = {};
  const values = {};
  for (const group of Object.values(PARAMS)) for (const k of Object.keys(group)) defaults[k] = values[k] = get(k);
  try {
    Object.assign(values, JSON.parse(localStorage.getItem(KEY)) ?? {});
  } catch {}

  const apply = (k) => {
    set(k, values[k]);
    if (k === 'bristleScale') stage.bristles.textureNeedsUpdate = true;
  };
  // Only what was moved away from the defaults is remembered, so new defaults in the code still come through.
  const save = () => {
    const moved = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== defaults[k]));
    try {
      localStorage.setItem(KEY, JSON.stringify(moved));
    } catch {}
  };

  const gui = new GUI({ title: 'Painting' });
  gui.domElement.style.top = '52px'; // below the GitHub link
  for (const [name, group] of Object.entries(PARAMS)) {
    const folder = gui.addFolder(name);
    for (const [k, [min, max, step, label]] of Object.entries(group)) {
      folder.add(values, k, min, max, step).name(label).onChange(() => (apply(k), save()));
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
      save();
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
    },
  };
  gui.add(actions, 'copy').name('Copy values');
  gui.add(actions, 'reset').name('Reset');
}
