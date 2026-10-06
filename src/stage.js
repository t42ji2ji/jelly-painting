// Shared stage for both pages: renderer, painted backdrop + table, lights, camera, painterly post, theme switch,
// loading reveal. A page adds its subject to `stage.subject` and supplies per-frame work through stage.run().

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { THEMES } from './themes.js';
import { buildTable, setTableTheme, backdropNode } from './scene.js';
import { createPost, postU } from './post.js';
import { createSim } from './sim.js';
import { cursor } from './cursor.js';
import { loader } from './loader.js';

const deg = Math.PI / 180;
export const sph = (az, el, d) =>
  new THREE.Vector3(Math.sin(az * deg) * Math.cos(el * deg), Math.sin(el * deg), Math.cos(az * deg) * Math.cos(el * deg)).multiplyScalar(d);

const KEY = { az: -121, el: 54 };
// Shadow direction: away from the key light, as a rotation about Y for the shadow arm.
const away = sph(KEY.az + 180, 0, 1);
export const SHADOW_ANGLE = Math.atan2(-away.z, away.x);

export async function createStage({ onTheme }) {
  const canvas = document.querySelector('canvas.scene');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.88;
  await renderer.init();

  const scene = new THREE.Scene();
  scene.backgroundNode = backdropNode();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 1.01;

  const camera = new THREE.PerspectiveCamera(35.5, innerWidth / innerHeight, 0.05, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.minDistance = 1.1;
  controls.maxDistance = 9;
  controls.minPolarAngle = 1 * deg;
  controls.maxPolarAngle = 82 * deg;

  const hemi = new THREE.HemisphereLight('#b096c2', '#ffabab', 0.98);
  const key = new THREE.DirectionalLight('#ffdcbd', 3.2);
  key.position.copy(sph(KEY.az, KEY.el, 5));
  const rim = new THREE.DirectionalLight('#b68bff', 0.85);
  rim.position.copy(sph(64, 18, 5));
  scene.add(hemi, key, rim);

  const table = buildTable();
  scene.add(table.group);

  const subject = new THREE.Group();
  scene.add(subject);

  const stage = {
    renderer, scene, camera, controls, table, subject, canvas,
    themeName: null,
    get theme() {
      return THEMES[this.themeName];
    },
    setTheme(name) {
      this.themeName = name;
      setTableTheme(THEMES[name]);
      key.color.set(THEMES[name].light);
      for (const b of document.querySelectorAll('.themes button')) b.setAttribute('aria-pressed', b.dataset.theme === name);
      onTheme(name, this);
    },
    // Put the camera at the theme's default angle, framing a subject of the given height and width.
    frame(height, width, targetY) {
      controls.target.set(0, targetY, 0);
      camera.position.copy(controls.target).add(sph(this.theme.cameraAzimuth, 32.5, (Math.max(height * 1.1 + 0.15, width * 0.95) / 0.237) * 0.95));
      controls.update();
    },
  };

  const nav = document.querySelector('.themes');
  for (const name of Object.keys(THEMES)) {
    const b = document.createElement('button');
    b.textContent = THEMES[name].label;
    b.dataset.theme = name;
    b.onclick = () => stage.setTheme(name);
    nav.insertBefore(b, nav.querySelector("a"));
  }
  let first = new URLSearchParams(location.search).get('theme');
  if (!THEMES[first]) first = 'cherry';
  stage.setTheme(first);

  const { pipeline } = createPost(renderer, scene, camera);
  postU.reveal.value = 0;

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Dragging the subject: grab it (stage.hit), slide it across the table; elsewhere the orbit controls take over.
  const sim = createSim();
  stage.sim = sim;
  stage.hit = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const grab = new THREE.Vector2();
  let dragging = null;
  const pointerRay = (e) => {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const onSubject = () => stage.hit && ray.intersectObject(stage.hit, true).length > 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerRay(e);
    if (!onSubject()) return;
    plane.constant = -controls.target.y;
    if (!ray.ray.intersectPlane(plane, hitPoint)) return;
    dragging = e.pointerId;
    controls.enabled = false;
    grab.set(hitPoint.x - sim.state.target.x, hitPoint.z - sim.state.target.z);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    pointerRay(e);
    if (dragging === null) return cursor.hover(onSubject());
    if (ray.ray.intersectPlane(plane, hitPoint)) sim.setTarget(hitPoint.x - grab.x, hitPoint.z - grab.y);
  });
  const release = (e) => {
    if (e.pointerId !== dragging) return;
    dragging = null;
    controls.enabled = true;
    // Keep it where it was let go (the sim already clamps the range).
    sim.setTarget(sim.state.cup.x, sim.state.cup.z);
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
  const nudge = (dt) => {
    if (!keys.size) return;
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    const f = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
    const r = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const v = 3.3 * dt;
    const t = sim.state.target;
    sim.setTarget(t.x + (camDir.x * f - camDir.z * r) * v, t.z + (camDir.z * f + camDir.x * r) * v);
  };

  stage.run = async (update) => {
    await renderer.compileAsync(scene, camera);
    const clock = new THREE.Timer();
    let frames = 0;
    let revealStart = -1;
    renderer.setAnimationLoop((now) => {
      clock.update(now);
      const dt = clock.getDelta();
      nudge(dt);
      sim.step(dt);
      const s = sim.state;
      subject.position.set(s.cup.x, 0, s.cup.z);
      subject.rotation.set(s.tilt.x, 0, s.tilt.z);
      table.placeShadow(stage.theme, s.cup.x, s.cup.z, SHADOW_ANGLE);
      update(dt, s);
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
  };

  return stage;
}
