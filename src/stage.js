// Shared stage: renderer, painted backdrop + table, lights, camera, painterly post, drag + wobble sim, loading reveal.
// The app puts its subject in `stage.subject`, picks a palette, and supplies per-frame work through stage.run().

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTES } from './themes.js';
import { buildTable, setPalette, backdropNode } from './scene.js';
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

export async function createStage() {
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
    hit: null, // what can be grabbed; set by the app
    palette: PALETTES.cherry,
    setPalette(name) {
      this.palette = PALETTES[name];
      setPalette(this.palette);
      key.color.set(this.palette.light);
    },
    // Camera at the given azimuth, framing a subject of the given height and width; also re-centres the subject.
    frame(height, width, targetY, azimuth) {
      sim.reset();
      controls.target.set(0, targetY, 0);
      camera.position.copy(controls.target).add(sph(azimuth, 32.5, (Math.max(height * 1.1 + 0.15, width * 0.95) / 0.237) * 0.95));
      controls.update();
    },
  };

  const { pipeline, bristles } = createPost(renderer, scene, camera);
  stage.bristles = bristles; // the tuning panel re-renders it when the rib size changes
  postU.reveal.value = 0;

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Dragging the subject: grab it (stage.hit), slide it across the table; elsewhere the orbit controls take over.
  const sim = createSim();
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
    e.stopImmediatePropagation(); // the orbit controls never see a press that grabs the subject
    plane.constant = -controls.target.y;
    if (!ray.ray.intersectPlane(plane, hitPoint)) return;
    dragging = e.pointerId;
    controls.enabled = false;
    grab.set(hitPoint.x - sim.state.target.x, hitPoint.z - sim.state.target.z);
    canvas.setPointerCapture(e.pointerId);
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    pointerRay(e);
    if (dragging === null) return cursor.hover(onSubject());
    if (ray.ray.intersectPlane(plane, hitPoint)) sim.setTarget(hitPoint.x - grab.x, hitPoint.z - grab.y);
  });
  const release = (e) => {
    if (e.pointerId !== dragging) return;
    dragging = null;
    controls.enabled = true;
    // Let go: it eases back to the middle, and the jelly wobbles on the way.
    sim.goHome();
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
    let excite = 0;
    let revealStart = -1;
    renderer.setAnimationLoop((now) => {
      clock.update(now);
      const dt = clock.getDelta();
      nudge(dt);
      sim.step(dt);
      const s = sim.state;
      subject.position.set(s.cup.x, 0, s.cup.z);
      subject.rotation.set(s.tilt.x, 0, s.tilt.z);
      table.placeShadow(stage.palette, s.cup.x, s.cup.z, SHADOW_ANGLE);
      update(dt, s);
      // Shake energy for the stars: rises fast with the jelly's motion, fades over about a second.
      const energy = Math.min(1, Math.hypot(s.slosh.vx, s.slosh.vz) * 3 + Math.hypot(s.cup.vx, s.cup.vz) * 0.4);
      excite += (energy - excite) * (1 - Math.exp(-(energy > excite ? 3 : 1.2) * dt));
      postU.excite.value = excite;
      controls.update();
      pipeline.render();
      // Let the study paint a while, then sweep the real painting over it.
      frames++;
      if (revealStart < 0 && frames > 2 && loader.elapsed() > 0.9) revealStart = now;
      if (revealStart >= 0 && postU.reveal.value < 1) {
        postU.reveal.value = Math.min(1, (now - revealStart) / 1100);
        if (postU.reveal.value === 1) loader.remove();
      }
    });
    document.documentElement.dataset.state = 'ready';
  };

  return stage;
}
