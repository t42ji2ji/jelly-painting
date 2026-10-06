// The dessert cup: glass, lid, jelly, cream, fruits, plus the table it sits on.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, float, mix, smoothstep, clamp, cos, positionLocal, positionWorld, normalView,
  positionViewDirection, normalMap, texture, mx_fractal_noise_float, mx_noise_float, uv, length, dot,
} from 'three/tsl';
import { paintNormalMap, kiwiTexture, rng } from './paint.js';
import { FRUIT_COLORS } from './themes.js';

// Cup dimensions (scene units, table at y = 0).
export const CUP = { H: 0.62, Rb: 0.4, Rt: 0.5, T: 0.018, BASE: 0.035 };
CUP.yJ = CUP.BASE + 0.78 * (CUP.H - CUP.BASE); // jelly surface
CUP.yC = CUP.BASE + 0.31 * (CUP.yJ - CUP.BASE); // cream top

const rOut = (y) => CUP.Rb + ((CUP.Rt - CUP.Rb) * y) / CUP.H;
const rIn = (y) => rOut(y) - CUP.T;

// Wobble uniforms, written from the simulation every frame.
export const wobbleU = {
  slosh: uniform(new THREE.Vector2()),
  wave: uniform(0),
};

// Jelly deformation: the top shears and tilts, the wall stays glued to the glass.
// Mirrored on the CPU in wobbleAt() for the fruits.
const wobbleNode = (yLo, yHi, gain) =>
  Fn(() => {
    const p = positionLocal;
    const h = clamp(p.y.sub(yLo).div(yHi - yLo), 0, 1);
    const rWall = float(CUP.Rb - CUP.T).add(p.y.mul((CUP.Rt - CUP.Rb) / CUP.H));
    const rad = clamp(length(p.xz).div(rWall), 0, 1);
    const s = wobbleU.slosh;
    const lat = s.mul(h.mul(h)).mul(float(1).sub(rad.mul(rad).mul(0.7))).mul(gain);
    const lift = dot(p.xz, s).mul(1.3 / CUP.Rt).mul(h.pow(3))
      .add(wobbleU.wave.mul(cos(rad.mul(Math.PI))).mul(h.pow(4)))
      .mul(gain);
    return vec3(p.x.add(lat.x), p.y.add(lift), p.z.add(lat.y));
  })();

export function wobbleAt(x, y, z, sx, sz, wave, yLo = CUP.yC, yHi = CUP.yJ) {
  const h = Math.min(1, Math.max(0, (y - yLo) / (yHi - yLo)));
  const rad = Math.min(1, Math.hypot(x, z) / rIn(y));
  const k = h * h * (1 - 0.7 * rad * rad);
  const lift = ((x * sx + z * sz) * 1.3) / CUP.Rt * h ** 3 + wave * Math.cos(rad * Math.PI) * h ** 4;
  return [sx * k, lift, sz * k];
}

const V = (x, y) => new THREE.Vector2(x, y);

function arc(points, cx, cy, r, a0, a1, n) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    points.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
}

function cupProfile() {
  const { H, Rb, T, BASE } = CUP;
  const pts = [V(0.0001, 0), V(Rb - 0.02, 0)];
  arc(pts, Rb - 0.02, 0.02, 0.02, -Math.PI / 2, 0, 4);
  for (let i = 1; i <= 16; i++) {
    const y = 0.02 + ((H - 0.02 - T / 2) * i) / 16;
    pts.push(V(rOut(y), y));
  }
  // Rolled lip, outside to inside.
  arc(pts, rOut(H) - T / 2, H - T / 2, T / 2 + 0.004, 0, Math.PI, 6);
  for (let i = 1; i <= 16; i++) {
    const y = H - T / 2 - ((H - T / 2 - BASE) * i) / 16;
    pts.push(V(rIn(y), y));
  }
  pts.push(V(0.0001, BASE));
  return pts;
}

function lidProfile() {
  const { H, Rt } = CUP;
  const R = Rt + 0.03;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const x = 0.0001 + ((R - 0.012) * i) / 10;
    pts.push(V(x, H + 0.036 - 0.03 * (x / R) ** 2));
  }
  pts.push(V(R - 0.012, H - 0.04), V(R, H - 0.04));
  for (let i = 10; i >= 0; i--) {
    const x = 0.0001 + (R * i) / 10;
    pts.push(V(x, H + 0.046 - 0.03 * (x / R) ** 2));
  }
  return pts;
}

// A column hugging the inner wall: flat bottom, wall, then a top surface with a meniscus at the glass.
function fillProfile(y0, y1, meniscus) {
  const e = 0.004;
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push(V(0.0001 + ((rIn(y0) - e) * i) / 10, y0));
  for (let i = 1; i <= 10; i++) {
    const y = y0 + ((y1 - y0) * i) / 10;
    pts.push(V(rIn(y) - e, y + (i === 10 ? meniscus : 0)));
  }
  for (let i = 1; i <= 16; i++) {
    const r = (rIn(y1) - e) * (1 - i / 16);
    const d = rIn(y1) - e - r;
    pts.push(V(Math.max(r, 0.0001), y1 + meniscus * Math.exp(-d / 0.03)));
  }
  return pts;
}

function fresnel(power) {
  return float(1).sub(normalView.dot(positionViewDirection).abs()).pow(power);
}

const paintedNormals = {};
function painted(key, opts) {
  return (paintedNormals[key] ??= paintNormalMap(opts));
}

function glassMaterial(normalTex, scale) {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: '#ffffff',
    roughness: 0.075,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    iridescence: 0.6,
    iridescenceIOR: 1.3,
    envMapIntensity: 0.9,
    specularIntensity: 1,
  });
  const edge = fresnel(4);
  m.normalNode = normalMap(texture(normalTex, uv().mul(vec2(3, 1))), vec2(scale));
  m.opacityNode = mix(float(0.05), float(0.7), edge);
  m.emissiveNode = vec3(0.92, 0.87, 1).mul(edge.mul(0.55));
  return m;
}

function roundedBox(w, h, d, r, seg = 6) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = v.clone().clamp(inner.clone().negate(), inner);
    v.sub(c).normalize().multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A bent, flattened ellipsoid: citrus segment / peach slice.
function crescent(len, hgt, thick, bend) {
  const g = new THREE.SphereGeometry(1, 40, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * len, y = p.getY(i) * hgt, z = p.getZ(i) * thick;
    // Sharpen the inner edge (wedge cross-section).
    z *= 1 - 0.75 * Math.max(0, -y / hgt);
    y -= bend * (x / len) ** 2;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function fruitMaterial(type) {
  const c = FRUIT_COLORS[type];
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: c.roughness, sheen: 0.3, sheenColor: c.color2 });
  const base = uniform(new THREE.Color(c.color));
  const second = uniform(new THREE.Color(c.color2));
  if (type === 'mandarin' || type === 'peach') {
    // Pale toward the inner (lower) edge, saturated along the back.
    const y = positionLocal.y.div(type === 'peach' ? 0.06 : 0.05);
    m.colorNode = mix(second, base, smoothstep(-1.2, 0.6, y));
  } else if (type === 'pineapple' || type === 'mango') {
    m.colorNode = mix(base, second, mx_noise_float(positionLocal.mul(18)).mul(0.5).add(0.5));
  } else {
    m.colorNode = base;
  }
  m.emissiveNode = uniform(new THREE.Color(c.sss)).mul(fresnel(1.5).oneMinus().mul(0.14));
  m.normalNode = normalMap(texture(painted('fruit', { strokes: 220, angle: 0, jitter: 1.4, width: [4, 14], length: [20, 90], strength: 2.5, seed: 11 })), vec2(0.6));
  return m;
}

function fruitMesh(type, r) {
  const mat = fruitMaterial(type);
  const g = new THREE.Group();
  if (type === 'cherry') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.072, 32, 24), mat);
    s.scale.set(1, 0.92, 1);
    g.add(s);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.06, 0), new THREE.Vector3(0.02, 0.14, 0), new THREE.Vector3(0.07, 0.2, 0.01));
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.0055, 6), new THREE.MeshStandardNodeMaterial({ color: FRUIT_COLORS.cherry.color2, roughness: 0.5 }));
    g.add(stem);
  } else if (type === 'mandarin') {
    g.add(new THREE.Mesh(crescent(0.12, 0.05, 0.045, 0.05), mat));
  } else if (type === 'peach') {
    g.add(new THREE.Mesh(crescent(0.15, 0.06, 0.04, 0.06), mat));
  } else if (type === 'shiratama') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.068, 32, 24), mat);
    s.scale.set(1, 0.72, 1);
    g.add(s);
  } else if (type === 'kiwi') {
    const tex = kiwiTexture(FRUIT_COLORS.kiwi);
    const face = new THREE.MeshPhysicalNodeMaterial({ map: tex, roughness: 0.2, sheen: 0.3 });
    face.emissiveNode = uniform(new THREE.Color(FRUIT_COLORS.kiwi.sss)).mul(0.06);
    const side = fruitMaterial('kiwi');
    const geo = new THREE.CylinderGeometry(0.085, 0.085, 0.035, 40);
    g.add(new THREE.Mesh(geo, [side, face, face]));
  } else if (type === 'pineapple') {
    g.add(new THREE.Mesh(roundedBox(0.11, 0.075, 0.08, 0.015), mat));
  } else if (type === 'mango') {
    g.add(new THREE.Mesh(roundedBox(0.085, 0.085, 0.085, 0.02), mat));
  }
  g.rotation.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2);
  if (type === 'cherry') g.rotation.set((r() - 0.5) * 0.6, r() * Math.PI * 2, (r() - 0.5) * 0.6);
  return g;
}

function placeFruits(types, seed) {
  const r = rng(seed);
  const placed = [];
  const radius = { cherry: 0.075, mandarin: 0.09, peach: 0.11, shiratama: 0.07, kiwi: 0.085, pineapple: 0.07, mango: 0.065 };
  for (const type of types) {
    const fr = radius[type];
    for (let tries = 0; tries < 400; tries++) {
      // Cherries ride the surface, the rest settle through the jelly.
      const yMin = CUP.yC + fr * 0.8;
      const yMax = type === 'cherry' ? CUP.yJ - 0.01 : CUP.yJ - fr * 0.7;
      const y = type === 'cherry' ? yMax - r() * 0.05 : yMin + r() * (yMax - yMin);
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * (rIn(y) - fr - 0.01);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y, p.z - z) > (p.fr + fr) * 0.95)) {
        placed.push({ type, x, y, z, fr });
        break;
      }
    }
  }
  return placed;
}

// Everything that sits in the cup group and changes with the theme.
export function buildCup(theme) {
  const group = new THREE.Group();

  const glassNormals = painted('glass', { strokes: 160, angle: Math.PI / 2, jitter: 0.25, width: [6, 20], length: [80, 260], strength: 4, seed: 3 });

  const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile(), 96), glassMaterial(glassNormals, 0.5));
  cup.renderOrder = 3;
  group.add(cup);

  const lid = new THREE.Mesh(new THREE.LatheGeometry(lidProfile(), 96), glassMaterial(glassNormals, 0.35));
  lid.renderOrder = 4;
  group.add(lid);

  // Jelly: transmission, so it refracts the fruits and cream behind it.
  const jellyMat = new THREE.MeshPhysicalNodeMaterial({
    color: '#fff0ec',
    transmission: 1,
    roughness: 0.075,
    ior: 1.355,
    thickness: 0.22,
    attenuationColor: theme.jelly.attenuation,
    attenuationDistance: 1.1,
    sheen: 0.21,
    sheenColor: '#ffffff',
  });
  jellyMat.positionNode = wobbleNode(CUP.yC, CUP.yJ, 1);
  jellyMat.emissiveNode = uniform(new THREE.Color(theme.jelly.glow)).mul(fresnel(1).oneMinus().mul(0.23));
  jellyMat.normalNode = normalMap(texture(glassNormals, uv().mul(vec2(2, 1))), vec2(0.25));
  const jelly = new THREE.Mesh(new THREE.LatheGeometry(fillProfile(CUP.yC - 0.004, CUP.yJ, 0.012), 96), jellyMat);
  jelly.renderOrder = 2;
  group.add(jelly);

  // Cream: opaque, wavy top, soft glow from inside.
  const creamGeo = new THREE.LatheGeometry(fillProfile(CUP.BASE + 0.001, CUP.yC, 0.008), 96);
  {
    const p = creamGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = Math.min(1, Math.max(0, (y - CUP.BASE) / (CUP.yC - CUP.BASE))) ** 3;
      const w = 0.018 * Math.sin(a * 3 + 0.7) + 0.01 * Math.sin(a * 7 + 2.1);
      p.setY(i, y + w * k);
    }
    creamGeo.computeVertexNormals();
  }
  const creamMat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.4, sheen: 0.51, sheenColor: '#ffffff' });
  const cc = uniform(new THREE.Color(theme.cream.color));
  const cs = uniform(new THREE.Color(theme.cream.shade));
  const grain = mx_fractal_noise_float(positionLocal.mul(14 * 1.35), 3).mul(0.39);
  creamMat.colorNode = mix(cs, cc, smoothstep(CUP.BASE, CUP.yC, positionLocal.y).add(grain.mul(0.4)).clamp(0, 1));
  creamMat.emissiveNode = uniform(new THREE.Color(theme.cream.glow)).mul(fresnel(1.2).mul(0.64 * 0.4));
  creamMat.positionNode = wobbleNode(CUP.BASE, CUP.yC, 0.25);
  group.add(new THREE.Mesh(creamGeo, creamMat));

  const fruits = placeFruits(theme.fruits, theme.label === 'Cherry' ? 4 : 7).map((f) => {
    const mesh = fruitMesh(f.type, rng(Math.floor(f.x * 1e4) ^ 99));
    mesh.position.set(f.x, f.y, f.z);
    mesh.userData.home = { x: f.x, y: f.y, z: f.z, rot: mesh.rotation.clone() };
    group.add(mesh);
    return mesh;
  });

  // Invisible grab target for dragging the cup.
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(CUP.Rt + 0.03, CUP.Rb, CUP.H + 0.05, 24), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.position.y = (CUP.H + 0.05) / 2;
  group.add(hit);

  return { group, fruits, hit };
}

export function updateFruits(fruits, s) {
  for (const f of fruits) {
    const h = f.userData.home;
    const [dx, dy, dz] = wobbleAt(h.x, h.y, h.z, s.lag.x, s.lag.z, s.wave.y);
    f.position.set(h.x + dx, h.y + dy, h.z + dz);
    f.rotation.set(h.rot.x + s.lag.z * 2.5, h.rot.y, h.rot.z - s.lag.x * 2.5);
  }
}

// Table, contact shadow and backdrop colours: uniforms so a theme switch is a value change.
export const tableU = {
  base: uniform(new THREE.Color()),
  dark: uniform(new THREE.Color()),
  light: uniform(new THREE.Color()),
  horizon: uniform(new THREE.Color()),
  background: uniform(new THREE.Color()),
  contact: uniform(new THREE.Color()),
};

export function setTableTheme(theme) {
  tableU.base.value.set(theme.table.base);
  tableU.dark.value.set(theme.table.dark);
  tableU.light.value.set(theme.table.light);
  tableU.horizon.value.set(theme.horizon);
  tableU.background.value.set(theme.background);
  tableU.contact.value.set(theme.contactColor);
}

export function buildTable() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.82 });
  const xz = positionWorld.xz;
  const variation = mx_fractal_noise_float(vec3(xz.mul(0.51 * 0.9), 3), 4).mul(0.96);
  const streak = mx_noise_float(vec3(xz.x.mul(0.6), xz.y.mul(9), 1)).mul(0.39);
  let col = mix(tableU.base, tableU.light, smoothstep(-0.1, 0.5, variation.add(streak.mul(0.5))));
  col = mix(col, tableU.dark, smoothstep(0.25, 0.75, variation.negate()).mul(0.55));
  const dist = length(xz);
  mat.colorNode = mix(col, tableU.horizon, smoothstep(3.5, 6.8, dist));
  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat);
  table.rotation.x = -Math.PI / 2;
  group.add(table);

  // Painted contact shadow: a soft violet pool, a bright rim of caustic light hugging the foot.
  const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const sp = uv().sub(0.5).mul(2);
  const r = length(sp).add(mx_noise_float(vec3(sp.mul(3), 5)).mul(0.08));
  const pool = smoothstep(1, 0.35, r).mul(0.53);
  const ring = smoothstep(0.42, 0.36, r).mul(smoothstep(0.2, 0.34, r));
  shadowMat.colorNode = mix(mix(vec3(0.35, 0.29, 0.4), vec3(0.85, 0.64, 1), smoothstep(0.5, 0.15, r).mul(0.6)), tableU.contact, ring.mul(0.41));
  shadowMat.opacityNode = pool.add(ring.mul(0.3)).clamp(0, 1);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  group.add(shadow);

  return { group, shadow };
}
