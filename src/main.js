// The app: one painted stage, two modes.
//   cup   – the jelly cup, Cherry or Kiwi (each brings its own backdrop)
//   model – an empty painting with a + in the middle; drop or pick a glTF; any backdrop from the swatches

import { createStage } from './stage.js';
import { THEMES, PALETTES, backdropAt } from './themes.js';
import { buildCup, updateJelly } from './scene.js';
import { createModelMode } from './model.js';
import { crayonCanvas, plusShape } from './crayon.js';
import { PRESETS } from './presets.js';

const params = new URLSearchParams(location.search);
const state = {
  mode: params.get('mode') === 'model' ? 'model' : 'cup',
  theme: THEMES[params.get('theme')] ? params.get('theme') : 'cherry',
  palette: PALETTES[params.get('palette')] ? params.get('palette') : 'lilac',
};

const stage = await createStage();

let cup = null;
const cupMode = {
  enter() {
    this.show(state.theme);
  },
  exit() {
    stage.subject.remove(cup.group);
  },
  show(name) {
    state.theme = name;
    if (cup) {
      stage.subject.remove(cup.group);
      cup.group.traverse((o) => o.geometry?.dispose());
    }
    const theme = THEMES[name];
    cup = buildCup(theme);
    stage.subject.add(cup.group);
    stage.hit = cup.hit;
    stage.table.setShadowVisible(true);
    stage.setPalette(theme.palette);
    stage.frame(cup.dims.H, cup.dims.Rt * 2, cup.dims.H * 0.45, theme.cameraAzimuth);
  },
  update(dt, s) {
    updateJelly(cup, dt, s);
  },
};
const modelMode = createModelMode(stage);
const modes = { cup: cupMode, model: modelMode };
let current = null;

// ---- UI -------------------------------------------------------------------------------------------------

const swatches = document.querySelector('.swatches');
const swatchImages = {};

// A tiny painting of the palette: its gradient, paper grain, a soft rounded edge.
function swatchCanvas(palette) {
  const css = 56, px = css * 2;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const img = g.createImageData(px, px);
  const half = px / 2, rad = px * 0.1;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const qx = Math.abs(x - half) - half + rad + 2, qy = Math.abs(y - half) - half + rad + 2;
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
      const a = Math.max(0, Math.min(1, 0.5 - (d + (Math.random() - 0.5) * 5) / 4));
      if (!a) continue;
      const col = backdropAt(palette.backdrop, x / px, y / px);
      const k = (Math.random() - 0.5) * 18;
      img.data.set([col[0] + k, col[1] + k, col[2] + k, a * 255], (y * px + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function renderSwatches() {
  swatches.replaceChildren();
  const names = state.mode === 'cup' ? Object.keys(THEMES) : Object.keys(PALETTES);
  for (const name of names) {
    const key = state.mode === 'cup' ? THEMES[name].palette : name;
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = state.mode === 'cup' ? THEMES[name].label : PALETTES[key].label;
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', state.mode === 'cup' ? state.theme === name : state.palette === name);
    b.append((swatchImages[key] ??= swatchCanvas(PALETTES[key])));
    b.onclick = () => {
      if (state.mode === 'cup') cupMode.show(name);
      else {
        state.palette = name;
        stage.setPalette(name);
      }
      sync();
    };
    swatches.append(b);
  }
}

function sync() {
  document.body.dataset.mode = state.mode;
  document.body.classList.toggle('has-model', modelMode.hasModel);
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-pressed', b.dataset.mode === state.mode);
  renderSwatches();
  history.replaceState(null, '', state.mode === 'cup' ? `?theme=${state.theme}` : `?mode=model&palette=${state.palette}`);
}

function setMode(mode) {
  if (mode === state.mode && current) return;
  current?.exit();
  state.mode = mode;
  current = modes[mode];
  if (mode === 'model') stage.setPalette(state.palette);
  current.enter();
  sync();
}

for (const b of document.querySelectorAll('.modes button')) b.onclick = () => setMode(b.dataset.mode);

// The + buttons: a crayon plus in the middle of the empty painting, and a small one in the corner once a model is in.
const input = document.querySelector('.file');
for (const el of document.querySelectorAll('.add')) {
  const size = el.classList.contains('small') ? 34 : 84;
  const c = crayonCanvas(size * 2, plusShape);
  c.style.width = c.style.height = `${size}px`;
  el.prepend(c);
}
// Big +: pick a file. Small +: put the model away and go back to the choice (presets or a file).
document.querySelector('.add.big').onclick = () => input.click();
document.querySelector('.add.small').onclick = () => {
  modelMode.clear();
  sync();
};
const presets = document.querySelector('.presets');
for (const [name, p] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.onclick = () => {
    modelMode.preset(name);
    sync();
  };
  presets.append(b);
}

async function load(file) {
  if (!file) return;
  if (state.mode !== 'model') setMode('model');
  try {
    await modelMode.load(file);
  } catch (e) {
    console.error(e);
    alert('Could not read this file. A .gltf needs its textures and .bin embedded; a .glb always works.');
  }
  sync();
}
input.addEventListener('change', () => {
  load(input.files[0]);
  input.value = '';
});
addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragover');
});
addEventListener('dragleave', () => document.body.classList.remove('dragover'));
addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragover');
  load(e.dataTransfer.files[0]);
});

setMode(state.mode);
stage.run((dt, s) => current.update(dt, s));

// Once the painting is up, quietly compile the other cups and the presets so switching to them doesn't stall.
setTimeout(async () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    if (name === state.theme) continue;
    const other = buildCup(theme);
    await stage.warm(other.group);
    other.group.traverse((o) => o.geometry?.dispose());
  }
  for (const preset of Object.values(PRESETS)) {
    const model = preset.build();
    await stage.warm(model);
    model.traverse((o) => o.geometry?.dispose());
  }
}, 2500);

// Local development only: a panel for the painting's texture and grain.
if (location.hostname === 'localhost') import('./tune.js').then((m) => m.createTuner(stage));
