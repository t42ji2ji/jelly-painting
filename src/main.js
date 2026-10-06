import * as THREE from 'three/webgpu';
import { mix, screenUV, smoothstep } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSim } from './sim.js';
import { THEMES } from './themes.js';
import { wobbleU, buildCup, updateFruits, buildTable, setTableTheme, tableU } from './scene.js';
import { createPost, postU } from './post.js';
import { loader } from './loader.js';

const canvas = document.querySelector('canvas.scene');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.88;
await renderer.init();

const scene = new THREE.Scene();
scene.backgroundNode = mix(tableU.horizon, tableU.background, smoothstep(0.7, 0.0, screenUV.y));
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 1.01;

const deg = Math.PI / 180;
const sph = (az, el, d) => new THREE.Vector3(Math.sin(az * deg) * Math.cos(el * deg), Math.sin(el * deg), Math.cos(az * deg) * Math.cos(el * deg)).multiplyScalar(d);

const camera = new THREE.PerspectiveCamera(35.5, innerWidth / innerHeight, 0.05, 100);
const target = new THREE.Vector3(0, 0.3, 0);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.minDistance = 1.1;
controls.maxDistance = 7;
controls.minPolarAngle = 1 * deg;
controls.maxPolarAngle = 82 * deg;

const hemi = new THREE.HemisphereLight('#b096c2', '#ffabab', 0.98);
const key = new THREE.DirectionalLight('#ffdcbd', 3.2);
key.position.copy(sph(-121, 54, 5));
const rim = new THREE.DirectionalLight('#b68bff', 0.85);
rim.position.copy(sph(64, 18, 5));
scene.add(hemi, key, rim);

const table = buildTable();
scene.add(table.group);
// The painted shadow falls away from the key light.
const away = sph(-121 + 180, 0, 0.28);
table.shadow.position.x = away.x;
table.shadow.position.z = away.z;

const cupRoot = new THREE.Group();
scene.add(cupRoot);
let cup = null;

const sim = createSim();
const themeNames = Object.keys(THEMES);
let themeName = new URLSearchParams(location.search).get('theme');
if (!THEMES[themeName]) themeName = 'cherry';

function applyTheme(name) {
  themeName = name;
  const t = THEMES[name];
  setTableTheme(t);
  key.color.set(t.light);
  if (cup) {
    cupRoot.remove(cup.group);
    cup.group.traverse((o) => o.geometry?.dispose());
  }
  cup = buildCup(t);
  cupRoot.add(cup.group);
  const az = name === 'cherry' ? 113.5 : -23.5;
  camera.position.copy(target).add(sph(az, 32.5, 3.1));
  controls.update();
  for (const b of document.querySelectorAll('.themes button')) b.setAttribute('aria-pressed', b.dataset.theme === name);
}

const nav = document.querySelector('.themes');
for (const name of themeNames) {
  const b = document.createElement('button');
  b.textContent = THEMES[name].label;
  b.dataset.theme = name;
  b.onclick = () => applyTheme(name);
  nav.append(b);
}
applyTheme(themeName);

const { pipeline } = createPost(renderer, scene, camera);
postU.reveal.value = 0;
await renderer.compileAsync(scene, camera);
let frames = 0;
let revealStart = -1;

// Dragging the cup: grab it, slide it across the table plane; elsewhere the orbit controls take over.
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
const hitPoint = new THREE.Vector3();
const grab = new THREE.Vector2();
let dragging = null;

function pointerRay(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerRay(e);
  if (!ray.intersectObject(cup.hit).length) return;
  if (!ray.ray.intersectPlane(plane, hitPoint)) return;
  dragging = e.pointerId;
  controls.enabled = false;
  grab.set(hitPoint.x - sim.state.target.x, hitPoint.z - sim.state.target.z);
  canvas.setPointerCapture(e.pointerId);
  document.body.classList.add('grabbing');
});
canvas.addEventListener('pointermove', (e) => {
  pointerRay(e);
  if (dragging === null) {
    document.body.classList.toggle('can-grab', ray.intersectObject(cup.hit).length > 0);
    return;
  }
  if (ray.ray.intersectPlane(plane, hitPoint)) sim.setTarget(hitPoint.x - grab.x, hitPoint.z - grab.y);
});
const release = (e) => {
  if (e.pointerId !== dragging) return;
  dragging = null;
  controls.enabled = true;
  document.body.classList.remove('grabbing');
  // Keep the cup where it was let go (the sim already clamps the range).
  const c = sim.state.cup;
  sim.setTarget(c.x, c.z);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') sim.shake();
  if (e.key.startsWith('Arrow')) {
    keys.add(e.key);
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key));
const camDir = new THREE.Vector3();
function nudge(dt) {
  if (!keys.size) return;
  camera.getWorldDirection(camDir);
  camDir.y = 0;
  camDir.normalize();
  const f = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  const r = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const v = 3.3 * dt;
  const t = sim.state.target;
  sim.setTarget(t.x + (camDir.x * f - camDir.z * r) * v, t.z + (camDir.z * f + camDir.x * r) * v);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Timer();
renderer.setAnimationLoop((now) => {
  clock.update(now);
  const dt = clock.getDelta();
  nudge(dt);
  sim.step(dt);
  const s = sim.state;
  cupRoot.position.set(s.cup.x, 0, s.cup.z);
  cupRoot.rotation.set(s.tilt.x, 0, s.tilt.z);
  table.shadow.position.set(s.cup.x + away.x, 0.002, s.cup.z + away.z);
  wobbleU.slosh.value.set(s.slosh.x, s.slosh.z);
  wobbleU.wave.value = s.wave.y;
  updateFruits(cup.fruits, s);
  controls.update();
  pipeline.render();

  // Let the study paint a while, then sweep the real painting over it.
  frames++;
  if (revealStart < 0 && frames > 2 && loader.elapsed() > 1.6) revealStart = now;
  if (revealStart >= 0 && postU.reveal.value < 1) {
    postU.reveal.value = Math.min(1, (now - revealStart) / 1800);
    if (postU.reveal.value === 1) loader.remove();
  }
});

document.documentElement.dataset.state = 'ready';
