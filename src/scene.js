// The dessert cup: glass, jelly, cream, diced fruit, plus the table it sits on.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, float, mix, smoothstep, clamp, cos, max, positionLocal, positionWorld, normalView,
  positionViewDirection, normalMap, texture, texture3D, mx_fractal_noise_float, mx_noise_float, uv, length, dot, screenUV, screenSize, min,
} from 'three/tsl';
import { paintNormalMap, rng } from './paint.js';
import { FRUIT_COLORS } from './themes.js';
import { postU } from './post.js';
import { createJelly } from './jelly.js';

const EXPOSURE = 0.88;

// Cup geometry derived from a theme's { H, Rb, Rt }.
export function cupDims({ H, Rb, Rt, flange }, fill, creamHeight) {
  const c = { H, Rb, Rt, flange, T: 0.016, BASE: 0.03 };
  c.yJ = c.BASE + fill * (H - c.BASE);
  c.yC = c.BASE + creamHeight * (c.yJ - c.BASE);
  c.rOut = (y) => Rb + ((Rt - Rb) * y) / H;
  c.rIn = (y) => c.rOut(y) - c.T;
  return c;
}

// The jelly's displacement field (jelly.js) as a 3D texture, read in the vertex shader of the jelly and cream.
function jellyField(body) {
  const [nx, ny, nz] = body.grid.n;
  const tex = new THREE.Data3DTexture(new Uint16Array(nx * ny * nz * 4), nx, ny, nz);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.upload = () => {
    const u = body.field, d = tex.image.data;
    for (let i = 0, n = nx * ny * nz; i < n; i++) {
      d[i * 4] = THREE.DataUtils.toHalfFloat(u[i * 3]);
      d[i * 4 + 1] = THREE.DataUtils.toHalfFloat(u[i * 3 + 1]);
      d[i * 4 + 2] = THREE.DataUtils.toHalfFloat(u[i * 3 + 2]);
    }
    tex.needsUpdate = true;
  };
  tex.upload();
  return tex;
}

// Jelly deformation: displace each vertex by the field; sideways motion fades out at the glass so it never pokes through.
const warpNode = (c, body, tex, gain) =>
  Fn(() => {
    const p = positionLocal;
    const { n, min: lo, size } = body.grid;
    const uvw = p.sub(vec3(...lo)).div(vec3(...size)).mul(vec3(...n.map((k) => (k - 1) / k))).add(vec3(...n.map((k) => 0.5 / k)));
    const u = texture3D(tex, uvw).xyz.mul(gain);
    const rWall = float(c.Rb - c.T).add(p.y.mul((c.Rt - c.Rb) / c.H));
    const rad = clamp(length(p.xz).div(rWall), 0, 1);
    const side = float(1).sub(rad.pow(4));
    return vec3(p.x.add(u.x.mul(side)), p.y.add(u.y), p.z.add(u.z.mul(side)));
  })();

const V = (x, y) => new THREE.Vector2(x, y);

function arc(points, cx, cy, r, a0, a1, n) {
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    points.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
}

function cupProfile(c) {
  const { H, Rb, T, BASE } = c;
  // Base sits a hair above the table: coplanar faces z-fight and the bottom flickers.
  const lift = 0.004;
  const pts = [V(0.0001, lift), V(Rb - 0.02, lift)];
  arc(pts, Rb - 0.02, 0.02 + lift, 0.02, -Math.PI / 2, 0, 4);
  const top = c.flange ? H - 0.035 : H - T / 2;
  for (let i = 1; i <= 16; i++) {
    const y = 0.02 + ((top - 0.02) * i) / 16;
    pts.push(V(c.rOut(y), y));
  }
  if (c.flange) {
    // Sealing ledge where a film lid would sit: steps out, rounds over, comes back in.
    const R = c.Rt + 0.03;
    pts.push(V(R - 0.01, H - 0.022), V(R, H - 0.016));
    arc(pts, R - 0.006, H - 0.006, 0.008, -Math.PI / 4, Math.PI / 2, 4);
    pts.push(V(c.rIn(H) + 0.004, H + 0.002));
  } else {
    arc(pts, c.rOut(H) - T / 2, H - T / 2, T / 2 + 0.004, 0, Math.PI, 6);
  }
  for (let i = 1; i <= 16; i++) {
    const y = H - T / 2 - ((H - T / 2 - BASE) * i) / 16;
    pts.push(V(c.rIn(y), y));
  }
  pts.push(V(0.0001, BASE));
  return pts;
}

// A column hugging the inner wall: flat bottom, wall, then a top surface with a meniscus at the glass.
function fillProfile(c, y0, y1, meniscus) {
  const e = 0.004;
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push(V(0.0001 + ((c.rIn(y0) - e) * i) / 10, y0));
  for (let i = 1; i <= 10; i++) {
    const y = y0 + ((y1 - y0) * i) / 10;
    pts.push(V(c.rIn(y) - e, y + (i === 10 ? meniscus : 0)));
  }
  for (let i = 1; i <= 16; i++) {
    const r = (c.rIn(y1) - e) * (1 - i / 16);
    const d = c.rIn(y1) - e - r;
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

// Clear plastic: nearly invisible face-on, bright thin rim, and the vertical highlight streaks of a painted glass.
function glassMaterial(c, normalTex) {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: '#ffffff',
    roughness: 0.075,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    iridescence: 0.6,
    iridescenceIOR: 1.3,
    envMapIntensity: 0.6,
  });
  const edge = fresnel(4);
  const nx = normalView.x;
  const y = positionLocal.y;
  // Two streaks on the lit side, one thin on the other; broken up by brush noise along the height.
  const band = (a, b, soft) => smoothstep(a - soft, a, nx).mul(smoothstep(b + soft, b, nx));
  const breakup = mx_noise_float(vec3(y.mul(9), nx.mul(3), 4)).mul(0.5).add(0.6).clamp(0, 1);
  const streaks = band(0.42, 0.52, 0.03).add(band(0.62, 0.66, 0.02).mul(0.7)).add(band(-0.74, -0.7, 0.02).mul(0.55))
    .mul(breakup).mul(smoothstep(0.02, 0.12, y)).mul(0.55);
  const rimTop = c.H - 0.012;
  // Thin bright line along the lip only (the band is a few millimetres of the profile, not the whole rolled edge).
  const rim = smoothstep(rimTop - 0.003, rimTop + 0.002, y).mul(smoothstep(rimTop + 0.016, rimTop + 0.008, y));
  m.normalNode = normalMap(texture(normalTex, uv().mul(vec2(3, 1))), vec2(0.4));
  m.opacityNode = max(max(mix(float(0.03), float(0.4), edge), streaks.mul(0.9)), rim.mul(0.6)).clamp(0, 1);
  m.emissiveNode = vec3(0.92, 0.87, 1).mul(edge.mul(0.5))
    .add(vec3(1, 0.95, 0.89).mul(streaks.mul(1.6)))
    .add(vec3(1, 0.98, 0.96).mul(rim.mul(0.7)));
  return m;
}

// ---- Fruit ----------------------------------------------------------------------------------------------

function roundedBox(w, h, d, r, seg = 5) {
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
  return g;
}

const R = (r, a, b) => a + r() * (b - a);
const col = (hex) => uniform(new THREE.Color(hex));

// Knife-cut chunk: a rounded box, optionally tapered into a wedge, with a lumpy surface.
function chunk(r, w, h, d, { taper = 0, lumps = 0.006 } = {}) {
  const g = roundedBox(w, h, d, Math.min(w, h, d) * R(r, 0.12, 0.22));
  const p = g.attributes.position;
  const a = R(r, 0, 9), b = R(r, 0, 9), e = R(r, 0, 9);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= 1 - taper * (0.5 - y / h); // wedge: narrower toward -y
    const n = Math.sin(x * 37 + a) * Math.sin(y * 41 + b) * Math.sin(z * 39 + e);
    const l = Math.hypot(x, y, z) || 1;
    x += (x / l) * n * lumps;
    y += (y / l) * n * lumps;
    z += (z / l) * n * lumps;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// A bent, flattened ellipsoid: citrus segment.
function crescent(len, hgt, thick, bend) {
  const g = new THREE.SphereGeometry(1, 40, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * len, y = p.getY(i) * hgt, z = p.getZ(i) * thick;
    z *= 1 - 0.75 * Math.max(0, -y / hgt);
    y -= bend * (x / len) ** 2;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// Flesh shading per fruit, in the piece's own coordinates (p) so the pattern rides along with the wobble.
function fruitMaterial(type) {
  const c = FRUIT_COLORS[type];
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: c.roughness, sheen: 0.35, sheenColor: c.color2, clearcoat: 0.4, clearcoatRoughness: 0.25 });
  const p = positionLocal;
  const n = (s, o = 0) => mx_noise_float(p.mul(s).add(o));
  const c1 = col(c.color), c2 = col(c.color2), c3 = col(c.color3);
  if (type === 'kiwi') {
    // Green flesh, pale core along one face, a band of black seeds next to it.
    const flesh = mix(c1, col('#b6e05e'), n(14).mul(0.5).add(0.5).mul(0.6));
    const core = smoothstep(0.025, 0.045, p.y.add(n(10, 3).mul(0.008)));
    const seedBand = smoothstep(0.0, 0.012, p.y).mul(smoothstep(0.034, 0.022, p.y));
    const seeds = smoothstep(0.45, 0.6, n(vec3(70, 30, 70))).mul(seedBand);
    m.colorNode = mix(mix(flesh, c2, core), c3, seeds);
  } else if (type === 'pineapple') {
    // Fibrous: streaks along the chunk's long axis, deeper gold on the outer face.
    const fibre = n(vec3(6, 70, 6)).mul(0.5).add(0.5);
    m.colorNode = mix(mix(c1, c2, fibre.mul(0.7)), c3, smoothstep(-0.02, -0.06, p.x).mul(0.7));
  } else if (type === 'mango') {
    m.colorNode = mix(c3, mix(c1, c2, n(12).mul(0.5).add(0.5)), smoothstep(-0.07, 0.05, p.y));
  } else if (type === 'peach') {
    // Pale flesh blushing to pink, deep red where it sat against the stone.
    const blush = smoothstep(-0.06, 0.06, p.x.add(n(9).mul(0.02)));
    m.colorNode = mix(mix(col('#ffc9a6'), c2, blush), c3, smoothstep(0.035, 0.06, p.y).mul(0.6));
  } else if (type === 'pearl') {
    // Tapioca: near-black brown, a little lighter where it's thinner.
    m.colorNode = mix(c3, c2, n(20).mul(0.5).add(0.5).mul(0.35));
  } else if (type === 'mandarin') {
    const y = p.y.div(0.05);
    const pulp = n(vec3(40, 6, 40)).mul(0.5).add(0.5);
    m.colorNode = mix(c2, mix(c1, c3, pulp.mul(0.5)), smoothstep(-1.2, 0.4, y));
  } else {
    m.colorNode = c1;
  }
  m.emissiveNode = col(c.sss).mul(fresnel(1.5).oneMinus().mul(0.16));
  m.normalNode = normalMap(texture(painted('fruit', { strokes: 220, angle: 0, jitter: 1.4, width: [4, 14], length: [20, 90], strength: 2.5, seed: 11 })), vec2(0.5));
  return m;
}

// Returns { mesh, radius } in scene units.
function fruitMesh(type, r, mats) {
  const mat = (mats[type] ??= fruitMaterial(type));
  const g = new THREE.Group();
  let radius;
  if (type === 'cherry') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), mat);
    s.scale.set(1, 0.92, 1);
    g.add(s);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0.03, 0.2, 0), new THREE.Vector3(0.1, 0.28, 0.01));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.007, 6), (mats.stem ??= new THREE.MeshStandardNodeMaterial({ color: FRUIT_COLORS.cherry.color2, roughness: 0.5 }))));
    g.rotation.set(R(r, -0.4, 0.4), R(r, 0, 6.3), R(r, -0.4, 0.4));
    return { mesh: g, radius: 0.1 };
  }
  if (type === 'mandarin') {
    g.add(new THREE.Mesh(crescent(0.15, 0.06, 0.055, 0.06), mat));
    radius = 0.1;
  } else if (type === 'pearl') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 16), mat);
    s.scale.set(1, 0.94, 1);
    g.add(s);
    radius = 0.066;
  } else if (type === 'shiratama') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 24), mat);
    s.scale.set(1, 0.72, 1);
    g.add(s);
    radius = 0.085;
  } else if (type === 'peach') {
    const w = R(r, 0.15, 0.2), h = R(r, 0.09, 0.12), d = R(r, 0.1, 0.13);
    g.add(new THREE.Mesh(chunk(r, w, h, d, { taper: 0.45 }), mat));
    radius = Math.max(w, h, d) * 0.45;
  } else if (type === 'pineapple') {
    const w = R(r, 0.12, 0.16), h = R(r, 0.09, 0.12), d = R(r, 0.11, 0.14);
    g.add(new THREE.Mesh(chunk(r, w, h, d, { taper: 0.35, lumps: 0.004 }), mat));
    radius = Math.max(w, h, d) * 0.45;
  } else if (type === 'mango') {
    const s = R(r, 0.11, 0.15);
    g.add(new THREE.Mesh(chunk(r, s, s * R(r, 0.85, 1.1), s * R(r, 0.85, 1.1)), mat));
    radius = s * 0.5;
  } else if (type === 'kiwi') {
    const w = R(r, 0.13, 0.17), h = R(r, 0.08, 0.1), d = R(r, 0.11, 0.14);
    g.add(new THREE.Mesh(chunk(r, w, h, d, { taper: 0.25 }), mat));
    radius = Math.max(w, h, d) * 0.45;
  }
  g.rotation.set(R(r, 0, 6.3), R(r, 0, 6.3), R(r, 0, 6.3));
  return { mesh: g, radius };
}

// Pile the pieces into the jelly: biggest first, overlaps allowed a little (soft fruit squashes together).
function placeFruits(c, counts, seed, mats) {
  const r = rng(seed);
  const pieces = [];
  for (const [type, n] of Object.entries(counts)) for (let i = 0; i < n; i++) pieces.push({ type, ...fruitMesh(type, r, mats) });
  pieces.sort((a, b) => b.radius - a.radius);
  const placed = [];
  for (const piece of pieces) {
    const fr = piece.radius;
    for (let tries = 0; tries < 600; tries++) {
      const yMin = c.yC + fr * 0.6;
      const yMax = piece.type === 'cherry' ? c.yJ + 0.02 : c.yJ - fr * 0.3;
      // Cherries float at the top; tapioca pearls sink and pile at the bottom.
      const y = piece.type === 'cherry' ? yMax - r() * 0.06 : piece.type === 'pearl' ? yMin + r() ** 2 * 0.17 : yMin + r() * (yMax - yMin);
      const a = r() * Math.PI * 2;
      // Pearls crowd against the wall (that's what shows through a milky drink); everything else spreads out.
      const spread = piece.type === 'pearl' ? 0.94 + 0.06 * r() : Math.sqrt(r());
      const d = spread * Math.max(0, c.rIn(y) - fr * 0.85 - 0.01);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (placed.every((p) => Math.hypot(p.x - x, p.y - y, p.z - z) > (p.fr + fr) * 0.72)) {
        placed.push({ ...piece, x, y, z, fr });
        break;
      }
    }
  }
  return placed;
}

// Everything that sits in the cup group and changes with the theme.
export function buildCup(theme) {
  const c = cupDims(theme.cup, theme.jelly.fill, theme.cream.height);
  const group = new THREE.Group();
  const body = createJelly(c);
  const field = jellyField(body);

  const glassNormals = painted('glass', { strokes: 160, angle: Math.PI / 2, jitter: 0.25, width: [6, 20], length: [80, 260], strength: 4, seed: 3 });

  const cup = new THREE.Mesh(new THREE.LatheGeometry(cupProfile(c), 96), glassMaterial(c, glassNormals));
  cup.renderOrder = 3;
  group.add(cup);

  // Jelly: transmission, so it refracts the fruit and cream behind it.
  const jellyMat = new THREE.MeshPhysicalNodeMaterial({
    color: theme.jelly.color ?? '#fff0ec',
    transmission: theme.jelly.transmission ?? 1,
    roughness: 0.14,
    ior: 1.355,
    thickness: 0.3,
    attenuationColor: theme.jelly.attenuation,
    attenuationDistance: theme.jelly.distance ?? 0.6,
    sheen: 0.21,
    sheenColor: '#ffffff',
  });
  jellyMat.positionNode = warpNode(c, body, field, 1);
  if (theme.jelly.clearBottom) {
    // Milky above, clearer where the pearls have settled, so they show through the wall.
    const milky = smoothstep(c.yC + 0.12, c.yC + 0.3, positionLocal.y);
    jellyMat.transmissionNode = mix(float(theme.jelly.clearBottom), float(theme.jelly.transmission), milky);
    jellyMat.colorNode = mix(vec3(1, 0.97, 0.93), col(theme.jelly.color), milky);
  }
  jellyMat.emissiveNode = col(theme.jelly.glow).mul(fresnel(1).oneMinus().mul(0.32));
  jellyMat.normalNode = normalMap(texture(glassNormals, uv().mul(vec2(2, 1))), vec2(0.25));
  const jelly = new THREE.Mesh(new THREE.LatheGeometry(fillProfile(c, c.yC - 0.004, c.yJ, 0.012), 96), jellyMat);
  jelly.renderOrder = 2;
  group.add(jelly);

  // Cream: opaque, wavy top, soft glow from inside.
  const creamGeo = new THREE.LatheGeometry(fillProfile(c, c.BASE + 0.001, c.yC, 0.008), 96);
  {
    const p = creamGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = Math.min(1, Math.max(0, (y - c.BASE) / (c.yC - c.BASE))) ** 3;
      const w = 0.016 * Math.sin(a * 3 + 0.7) + 0.009 * Math.sin(a * 7 + 2.1);
      p.setY(i, y + w * k);
    }
    creamGeo.computeVertexNormals();
  }
  const creamMat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.4, sheen: 0.51, sheenColor: '#ffffff' });
  const grain = mx_fractal_noise_float(positionLocal.mul(14 * 1.35), 3).mul(0.39);
  creamMat.colorNode = mix(col(theme.cream.shade), col(theme.cream.color), smoothstep(c.BASE, c.yC, positionLocal.y).add(grain.mul(0.4)).clamp(0, 1));
  creamMat.emissiveNode = col(theme.cream.glow).mul(fresnel(1.2).mul(0.64 * 0.4));
  creamMat.positionNode = warpNode(c, body, field, 0.6);
  group.add(new THREE.Mesh(creamGeo, creamMat));

  const mats = {};
  const fruits = placeFruits(c, theme.fruits, theme.label.length * 7, mats).map((f) => {
    f.mesh.position.set(f.x, f.y, f.z);
    f.mesh.userData.home = { x: f.x, y: f.y, z: f.z, q: f.mesh.quaternion.clone() };
    group.add(f.mesh);
    return f.mesh;
  });

  if (theme.straw) {
    // A fat bubble-tea straw, leaning against the rim; it follows the jelly where it crosses the surface.
    const len = c.H * 1.3;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, len, 24, 1, true), new THREE.MeshPhysicalNodeMaterial({ color: theme.straw, roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide }));
    straw.geometry.translate(0, len / 2, 0);
    straw.position.set(-c.Rb * 0.35, c.BASE + 0.02, c.Rb * 0.1);
    straw.rotation.z = -0.24;
    straw.rotation.x = 0.06;
    straw.userData.home = { x: straw.position.x, y: straw.position.y, z: straw.position.z, q: straw.quaternion.clone() };
    straw.userData.reach = c.yJ - straw.position.y;
    group.add(straw);
    fruits.push(straw);
  }

  // Invisible grab target for dragging the cup.
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(c.Rt + 0.03, c.Rb, c.H + 0.05, 24), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.position.y = (c.H + 0.05) / 2;
  group.add(hit);

  return { group, fruits, hit, dims: c, body, field };
}

const _u = [0, 0, 0], _w = [0, 0, 0], _axis = new THREE.Vector3(), _q = new THREE.Quaternion();

// Step the jelly with the cup's motion, upload its field, and carry each piece of fruit along: it moves with the
// jelly at its centre and turns with the jelly's local rotation there, so every piece wobbles on its own.
export function updateJelly(cup, dt, s) {
  cup.body.step(dt, s.cup);
  cup.field.upload();
  for (const f of cup.fruits) {
    const h = f.userData.home;
    const reach = f.userData.reach;
    if (reach) {
      // The straw: its foot stays put, the jelly at the surface tips it over.
      cup.body.sample(h.x, h.y + reach, h.z, _u);
      _w[0] = _u[2] / reach;
      _w[1] = 0;
      _w[2] = -_u[0] / reach;
      _u[0] = _u[1] = _u[2] = 0;
    } else {
      cup.body.sample(h.x, h.y, h.z, _u);
      cup.body.spin(h.x, h.y, h.z, _w);
    }
    f.position.set(h.x + _u[0], h.y + _u[1], h.z + _u[2]);
    const angle = Math.hypot(_w[0], _w[1], _w[2]);
    if (angle > 1e-6) f.quaternion.copy(_q.setFromAxisAngle(_axis.set(_w[0], _w[1], _w[2]).divideScalar(angle), angle)).multiply(h.q);
    else f.quaternion.copy(h.q);
  }
}

// ---- Table and backdrop ---------------------------------------------------------------------------------
// One painted gradient behind everything, laid out in painting coordinates so it frames the picture like the
// original; the table only adds a faint world-space mottling so orbiting still reads as moving over a surface.

const GLOWS = 4;
export const tableU = {
  base: col('#000000'),
  glows: Array.from({ length: GLOWS }, () => ({ at: uniform(new THREE.Vector2()), radius: uniform(1), color: col('#000000'), strength: uniform(0) })),
  noise: uniform(0.03),
  shadow: col('#000000'),
  shadowOpacity: uniform(0.5),
};

export function setPalette(palette) {
  const b = palette.backdrop;
  tableU.base.value.set(b.base);
  tableU.glows.forEach((u, i) => {
    const g = b.glows[i];
    u.at.value.set(...(g?.at ?? [0, 0]));
    u.radius.value = g?.radius ?? 1;
    u.color.value.set(g?.color ?? b.base);
    u.strength.value = g?.strength ?? 0;
  });
  tableU.noise.value = b.noise;
  tableU.shadow.value.set(palette.shadow.color);
  tableU.shadowOpacity.value = palette.shadow.opacity;
}

// Colours are display-space picks; divide out the exposure so they land on screen as picked.
export const backdropNode = Fn(() => {
  const aspect = screenSize.x.div(screenSize.y);
  const side = min(aspect, 1).mul(postU.frameSize);
  const f = screenUV.sub(0.5).mul(vec2(aspect, 1)).div(side).add(0.5);
  let c = tableU.base;
  for (const g of tableU.glows) {
    const t = float(1).sub(length(f.sub(g.at)).div(g.radius)).clamp(0, 1);
    c = mix(c, g.color, smoothstep(0, 1, t).mul(g.strength));
  }
  return c.div(EXPOSURE);
});

export function buildTable() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial();
  const mottle = mx_fractal_noise_float(vec3(positionWorld.xz.mul(0.8), 3), 3).mul(tableU.noise);
  mat.colorNode = backdropNode().mul(mottle.add(1));
  const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat);
  table.rotation.x = -Math.PI / 2;
  group.add(table);

  // Long soft shadow thrown away from the key light, darkest at the foot of the cup.
  const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const sp = uv().sub(0.5).mul(2);
  const wobbleEdge = mx_noise_float(vec3(sp.mul(2.5), 5)).mul(0.12);
  const body = smoothstep(1, 0.15, length(sp).add(wobbleEdge));
  const foot = smoothstep(0.55, 0.0, length(sp.sub(vec2(-0.62, 0)).mul(vec2(1.6, 1.1))));
  shadowMat.colorNode = tableU.shadow.div(EXPOSURE);
  shadowMat.opacityNode = max(body.mul(tableU.shadowOpacity), foot.mul(tableU.shadowOpacity).mul(1.2)).clamp(0, 0.85);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  const shadowArm = new THREE.Group(); // rotates about the cup so the shadow points away from the light
  shadowArm.add(shadow);
  group.add(shadowArm);

  return {
    group,
    setShadowVisible(v) {
      shadowArm.visible = v;
    },
    // Anchor at the object, aim away from the light; length/width from the palette.
    placeShadow(palette, x, z, awayAngle) {
      shadow.scale.set(palette.shadow.length, palette.shadow.width, 1);
      shadow.position.x = palette.shadow.length * 0.5 - 0.3;
      shadowArm.position.set(x, 0, z);
      shadowArm.rotation.y = awayAngle;
    },
  };
}
