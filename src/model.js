// Model page: any dropped glTF on the painted stage. The wobble is a shear of the whole model (base pinned,
// top dragged behind the motion), so it works without touching the model's own materials.

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createStage } from './stage.js';

const FIT_HEIGHT = 0.6;
const FIT_WIDTH = 1.0;

// Shear wrapper: matrix written each frame from the jelly sim.
const holder = new THREE.Group();
holder.matrixAutoUpdate = false;
let model = null;
let height = FIT_HEIGHT;
let width = FIT_WIDTH;
let mixer = null;

// Until something is dropped: a caramel pudding, so the page shows what the effect does.
function pudding() {
  const pts = [];
  const H = 0.42;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = t * H;
    const r = 0.36 - 0.12 * t + 0.02 * Math.sin(t * Math.PI);
    pts.push(new THREE.Vector2(r, y));
  }
  for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector2(0.24 * (1 - i / 10) + 0.0001, H + 0.015 * Math.sin((i / 10) * Math.PI)));
  pts.unshift(new THREE.Vector2(0.0001, 0));
  const custard = new THREE.MeshPhysicalNodeMaterial({ color: '#ffd98a', roughness: 0.35, sheen: 0.5, sheenColor: '#fff3d0', clearcoat: 0.6 });
  const caramel = new THREE.MeshPhysicalNodeMaterial({ color: '#8a3c10', roughness: 0.12, clearcoat: 1 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), custard));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), caramel);
  cap.scale.y = 0.18;
  cap.position.y = H - 0.012;
  g.add(cap);
  return g;
}

function setModel(object) {
  if (model) {
    holder.remove(model);
    model.traverse((o) => o.geometry?.dispose());
  }
  // Fit: stand it on the table, centred, at a size comparable to the cup.
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min(FIT_HEIGHT / Math.max(size.y, 1e-6), FIT_WIDTH / Math.max(size.x, size.z, 1e-6));
  object.scale.multiplyScalar(k);
  const fitted = new THREE.Box3().setFromObject(object);
  const c = fitted.getCenter(new THREE.Vector3());
  object.position.sub(new THREE.Vector3(c.x, fitted.min.y, c.z));
  height = fitted.max.y - fitted.min.y;
  width = Math.max(fitted.max.x - fitted.min.x, fitted.max.z - fitted.min.z);
  model = object;
  holder.add(model);
  stage.frame(height, width, height * 0.45);
}

const stage = await createStage({
  onTheme(name, stage) {
    if (!holder.parent) stage.subject.add(holder);
    stage.frame(height, width, height * 0.45);
  },
});
stage.hit = holder;
setModel(pudding());

const gltf = new GLTFLoader();
async function load(file) {
  if (!file) return;
  try {
    const result = await gltf.parseAsync(await file.arrayBuffer(), '');
    setModel(result.scene);
    mixer = null;
    if (result.animations.length) {
      mixer = new THREE.AnimationMixer(result.scene);
      for (const clip of result.animations) mixer.clipAction(clip).play();
    }
  } catch (e) {
    console.error(e);
    alert('讀不了這個檔案（.gltf 需要把貼圖和 .bin 內嵌，或改用 .glb）。');
  }
}

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
document.querySelector('.drop input').addEventListener('change', (e) => load(e.target.files[0]));

const shear = new THREE.Matrix4();
stage.run((dt, s) => {
  mixer?.update(dt);
  // Same viscous sim as the jelly: the top trails the motion, the base stays put, a little squash while it leans.
  const kx = (s.slosh.x / height) * 2.2;
  const kz = (s.slosh.z / height) * 2.2;
  const sy = 1 - Math.hypot(kx, kz) * 0.25 + s.wave.y * 0.6;
  shear.set(1, kx, 0, 0, 0, sy, 0, 0, 0, kz, 1, 0, 0, 0, 0, 1);
  holder.matrix.copy(shear);
  holder.matrixWorldNeedsUpdate = true;
});
