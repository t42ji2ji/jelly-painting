// Preset models for the model mode, all procedural (no asset files): pudding, doughnut, macaron, teapot.

import * as THREE from 'three/webgpu';
import { mix, smoothstep, positionLocal, mx_noise_float, vec3, uniform } from 'three/tsl';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

const col = (hex) => uniform(new THREE.Color(hex));

function pudding() {
  const H = 0.42;
  const pts = [new THREE.Vector2(0.0001, 0)];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(new THREE.Vector2(0.36 - 0.12 * t + 0.02 * Math.sin(t * Math.PI), t * H));
  }
  for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector2(0.24 * (1 - i / 10) + 0.0001, H + 0.015 * Math.sin((i / 10) * Math.PI)));
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

function doughnut() {
  const g = new THREE.Group();
  const ring = new THREE.TorusGeometry(0.3, 0.14, 40, 80);
  ring.rotateX(-Math.PI / 2);
  // One mesh: icing wherever the surface is above a wavy drip line, dough below.
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.45, sheen: 0.4, sheenColor: '#fff0e0', clearcoat: 0.3 });
  const p = positionLocal;
  const drip = mx_noise_float(vec3(p.x.mul(9), 0, p.z.mul(9))).mul(0.035);
  const icing = smoothstep(-0.01, 0.005, p.y.add(drip).sub(0.01));
  m.colorNode = mix(mix(col('#d9944f'), col('#f0c27f'), smoothstep(-0.14, 0.0, p.y)), col('#f59ac0'), icing);
  const dough = new THREE.Mesh(ring, m);
  dough.position.y = 0.14;
  g.add(dough);
  // Sprinkles on the icing.
  const colors = ['#ffffff', '#ffd23f', '#7fd1ff', '#9be37a', '#ff6f91'];
  const sprinkle = new THREE.CapsuleGeometry(0.008, 0.03, 2, 6);
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, t = r() * Math.PI * 0.8 - Math.PI * 0.4;
    const R = 0.3 + Math.sin(t) * 0.14, y = 0.14 + Math.cos(t) * 0.14 + 0.004;
    const s = new THREE.Mesh(sprinkle, new THREE.MeshStandardNodeMaterial({ color: colors[i % colors.length], roughness: 0.4 }));
    s.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
    s.rotation.set(Math.PI / 2, r() * Math.PI, r() * Math.PI);
    g.add(s);
  }
  return g;
}

function macaron() {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.6, sheen: 0.5, sheenColor: '#ffffff' });
  shell.colorNode = mix(col('#c3a6e6'), col('#dcc8f2'), mx_noise_float(positionLocal.mul(14)).mul(0.5).add(0.5).mul(0.6));
  const dome = new THREE.SphereGeometry(0.3, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  const top = new THREE.Mesh(dome, shell);
  top.scale.y = 0.42;
  top.position.y = 0.2;
  const bottom = new THREE.Mesh(dome, shell);
  bottom.scale.y = -0.3;
  bottom.position.y = 0.1;
  // The ruffled "foot" where each shell meets the filling.
  const foot = new THREE.TorusGeometry(0.29, 0.022, 8, 64);
  foot.rotateX(Math.PI / 2);
  const fp = foot.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const a = Math.atan2(fp.getZ(i), fp.getX(i));
    fp.setY(i, fp.getY(i) + Math.sin(a * 37) * 0.006);
  }
  foot.computeVertexNormals();
  const f1 = new THREE.Mesh(foot, shell);
  f1.position.y = 0.2;
  const f2 = new THREE.Mesh(foot, shell);
  f2.position.y = 0.1;
  const filling = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 48), new THREE.MeshPhysicalNodeMaterial({ color: '#fff3dc', roughness: 0.5, sheen: 0.6, sheenColor: '#ffffff' }));
  filling.position.y = 0.15;
  g.add(bottom, f2, filling, f1, top);
  return g;
}

function teapot() {
  const geo = new TeapotGeometry(0.2, 12);
  const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  // Glazed porcelain with a blue band round the belly.
  m.colorNode = mix(col('#f6f1e8'), col('#6f8fd6'), smoothstep(0.02, 0.0, positionLocal.y.abs().sub(0.035)).mul(0.85));
  return new THREE.Mesh(geo, m);
}

export const PRESETS = {
  pudding: { label: '布丁', build: pudding },
  doughnut: { label: '甜甜圈', build: doughnut },
  macaron: { label: '馬卡龍', build: macaron },
  teapot: { label: '茶壺', build: teapot },
};
