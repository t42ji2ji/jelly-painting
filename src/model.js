// Model mode: any glTF on the painted stage. The wobble is a shear of the whole model (base pinned, top dragged
// behind the motion), so it works without touching the model's own materials.

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PRESETS } from './presets.js';

const FIT_HEIGHT = 0.6;
const FIT_WIDTH = 1.0;
const AZIMUTH = 30;

export function createModelMode(stage) {
  // Shear wrapper: matrix written each frame from the jelly sim.
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  const shear = new THREE.Matrix4();
  const gltf = new GLTFLoader();
  let model = null;
  let mixer = null;
  let height = FIT_HEIGHT, width = FIT_WIDTH;

  function frame() {
    stage.frame(height, width, height * 0.45, AZIMUTH);
  }

  function clear() {
    if (!model) return;
    holder.remove(model);
    model.traverse((o) => o.geometry?.dispose());
    model = null;
    mixer = null;
    height = FIT_HEIGHT;
    width = FIT_WIDTH;
    stage.table.setShadowVisible(false);
  }

  function setModel(object) {
    clear();
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
    stage.table.setShadowVisible(true);
    frame();
  }

  return {
    get hasModel() {
      return model !== null;
    },
    enter() {
      stage.subject.add(holder);
      stage.hit = holder;
      stage.table.setShadowVisible(model !== null); // an empty painting has nothing to cast it
      frame();
    },
    exit() {
      stage.subject.remove(holder);
    },
    clear() {
      clear();
      frame();
    },
    preset(name) {
      setModel(PRESETS[name].build());
    },
    async load(file) {
      const result = await gltf.parseAsync(await file.arrayBuffer(), '');
      setModel(result.scene);
      mixer = null;
      if (result.animations.length) {
        mixer = new THREE.AnimationMixer(result.scene);
        for (const clip of result.animations) mixer.clipAction(clip).play();
      }
    },
    update(dt, s) {
      mixer?.update(dt);
      // Same viscous sim as the jelly: the top trails the motion, the base stays put, a little squash while it leans.
      const kx = (s.slosh.x / height) * 2.2;
      const kz = (s.slosh.z / height) * 2.2;
      const sy = 1 - Math.hypot(kx, kz) * 0.25 + s.wave.y * 0.6;
      shear.set(1, kx, 0, 0, 0, sy, 0, 0, 0, kz, 1, 0, 0, 0, 0, 1);
      holder.matrix.copy(shear);
      holder.matrixWorldNeedsUpdate = true;
    },
  };
}
