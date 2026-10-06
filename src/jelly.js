// Jelly soft body: a lattice of nodes filling the cup, each holding a displacement from rest. Pure numbers, no
// three.js. Nodes against the glass and on the bottom are glued (always 0); the rest move under linear elasticity
//   ü = μ∇²u + (λ+μ)∇(∇·u) − damping·u̇ − (inertia·a_cup + drag·v_cup)
// (the volume term per lattice cell, as the gradient of its energy, so it stays stable in any cup)
// so the middle and top of the jelly lag and jiggle while the edges stay put, and squeezing one side lifts it.
// The scene uploads `field` to a 3D texture for the jelly's vertices; fruit read sample() and spin() at their centre.

export const JELLY = {
  cells: 8, // lattice intervals across the cup
  layers: 6, // intervals from the bottom to the jelly surface
  stiffness: 3.1, // μ: shear wave speed², sets how fast it jiggles
  bulk: 6, // λ: resistance to squeezing; what makes the far side rise
  damping: 7, // 1/s; a flick keeps it jiggling for about a second
  inertia: 0.38, // how hard the cup's acceleration throws the jelly
  drag: 0.4, // and its velocity: the jelly also trails a moving cup like syrup
  maxDisplacement: 0.14,
  substeps: 8,
};

export function createJelly(c, p = JELLY) {
  const nx = p.cells + 1, ny = p.layers + 1, nz = nx;
  const R = Math.max(c.rIn(c.BASE), c.rIn(c.yJ));
  const min = [-R, c.BASE, -R];
  const size = [2 * R, c.yJ - c.BASE, 2 * R];
  const h = [size[0] / p.cells, size[1] / p.layers, size[2] / p.cells];
  const n = nx * ny * nz;
  const idx = (i, j, k) => (k * ny + j) * nx + i;

  const u = new Float32Array(n * 3);
  const v = new Float32Array(n * 3);
  const acc = new Float32Array(n * 3);
  const free = [];
  for (let k = 0; k < nz; k++)
    for (let j = 1; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const x = min[0] + i * h[0], y = min[1] + j * h[1], z = min[2] + k * h[2];
        if (Math.hypot(x, z) < c.rIn(y)) free.push(idx(i, j, k));
      }

  // Above the surface the jelly is free: a missing upper neighbour reads as the node itself (no pull).
  const at = (i, j, k, a) => u[idx(i, Math.min(j, ny - 1), k) * 3 + a];

  // Freedom per node, for the volume term below.
  const isFree = new Uint8Array(n);
  for (const id of free) isFree[id] = 1;

  function forces(fx, fy, fz) {
    const mu = p.stiffness, lm = p.bulk + p.stiffness;
    const [hx, hy, hz] = h;
    for (const id of free) {
      const i = id % nx, j = Math.floor(id / nx) % ny, k = Math.floor(id / (nx * ny));
      const top = j === ny - 1;
      const o = id * 3;
      for (let a = 0; a < 3; a++) {
        const c0 = u[o + a];
        const lap =
          (at(i + 1, j, k, a) - 2 * c0 + at(i - 1, j, k, a)) / (hx * hx) +
          (top ? (at(i, j - 1, k, a) - c0) / (hy * hy) : (at(i, j + 1, k, a) - 2 * c0 + at(i, j - 1, k, a)) / (hy * hy)) +
          (at(i, j, k + 1, a) - 2 * c0 + at(i, j, k - 1, a)) / (hz * hz);
        acc[o + a] = (a === 0 ? fx : a === 1 ? fy : fz) + mu * lap - p.damping * v[o + a];
      }
    }
    // Volume: each lattice cell resists a change of its volume (∇·u), pushing its corners back. Written as the
    // gradient of that energy so it can only ever take energy out of the jelly, whatever the cup's shape.
    const gx = 1 / (4 * hx), gy = 1 / (4 * hy), gz = 1 / (4 * hz);
    for (let k = 0; k < nz - 1; k++)
      for (let j = 0; j < ny - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          let div = 0;
          for (let c8 = 0; c8 < 8; c8++) {
            const di = c8 & 1, dj = (c8 >> 1) & 1, dk = c8 >> 2;
            const o = idx(i + di, j + dj, k + dk) * 3;
            div += u[o] * (di ? gx : -gx) + u[o + 1] * (dj ? gy : -gy) + u[o + 2] * (dk ? gz : -gz);
          }
          if (div === 0) continue;
          const f = -lm * div;
          for (let c8 = 0; c8 < 8; c8++) {
            const di = c8 & 1, dj = (c8 >> 1) & 1, dk = c8 >> 2;
            const id = idx(i + di, j + dj, k + dk);
            if (!isFree[id]) continue;
            acc[id * 3] += f * (di ? gx : -gx);
            acc[id * 3 + 1] += f * (dj ? gy : -gy);
            acc[id * 3 + 2] += f * (dk ? gz : -gz);
          }
        }
  }

  function sub(dt, fx, fz) {
    forces(fx, 0, fz);
    const m = p.maxDisplacement;
    for (const id of free) {
      const o = id * 3;
      for (let a = 0; a < 3; a++) {
        v[o + a] += acc[o + a] * dt;
        u[o + a] += v[o + a] * dt;
      }
      // Soft limit: past a few centimetres it pushes back harder.
      const l = Math.hypot(u[o], u[o + 1], u[o + 2]);
      if (l > m) {
        const s = (m * Math.tanh(l / m)) / l;
        u[o] *= s;
        u[o + 1] *= s;
        u[o + 2] *= s;
      }
    }
  }

  // Trilinear, the same as the GPU's filtered lookup.
  function sample(x, y, z, out = [0, 0, 0]) {
    const g = [(x - min[0]) / h[0], (y - min[1]) / h[1], (z - min[2]) / h[2]];
    const lim = [nx - 1, ny - 1, nz - 1];
    const i0 = [], t = [];
    for (let a = 0; a < 3; a++) {
      const q = Math.min(Math.max(g[a], 0), lim[a]);
      i0[a] = Math.min(Math.floor(q), lim[a] - 1);
      t[a] = q - i0[a];
    }
    out[0] = out[1] = out[2] = 0;
    for (let c8 = 0; c8 < 8; c8++) {
      const di = c8 & 1, dj = (c8 >> 1) & 1, dk = c8 >> 2;
      const w = (di ? t[0] : 1 - t[0]) * (dj ? t[1] : 1 - t[1]) * (dk ? t[2] : 1 - t[2]);
      const o = idx(i0[0] + di, i0[1] + dj, i0[2] + dk) * 3;
      out[0] += u[o] * w;
      out[1] += u[o + 1] * w;
      out[2] += u[o + 2] * w;
    }
    return out;
  }

  // Local rotation of the jelly at a point, ½∇×u, as a small-angle rotation vector.
  const a = [0, 0, 0], b = [0, 0, 0];
  function spin(x, y, z, out = [0, 0, 0]) {
    const e = Math.min(...h) * 0.5;
    const d = (fn) => (fn(a, 1), fn(b, -1));
    d((o, s) => sample(x, y + s * e, z, o));
    const duz_dy = (a[2] - b[2]) / (2 * e), dux_dy = (a[0] - b[0]) / (2 * e);
    d((o, s) => sample(x, y, z + s * e, o));
    const duy_dz = (a[1] - b[1]) / (2 * e), dux_dz = (a[0] - b[0]) / (2 * e);
    d((o, s) => sample(x + s * e, y, z, o));
    const duy_dx = (a[1] - b[1]) / (2 * e), duz_dx = (a[2] - b[2]) / (2 * e);
    out[0] = 0.5 * (duz_dy - duy_dz);
    out[1] = 0.5 * (dux_dz - duz_dx);
    out[2] = 0.5 * (duy_dx - dux_dy);
    return out;
  }

  return {
    grid: { n: [nx, ny, nz], min, size },
    field: u,
    // cup: the cup's state from sim.js; the jelly is pushed opposite its acceleration and velocity.
    step(dt, cup) {
      dt = Math.min(dt, 1 / 20);
      const fx = -(cup.ax * p.inertia + cup.vx * p.drag);
      const fz = -(cup.az * p.inertia + cup.vz * p.drag);
      // Explicit steps are only stable below about h / wave speed: a shallow cup (tight layers) or a slow frame takes more.
      const stableDt = (0.4 * Math.min(...h)) / Math.sqrt(p.bulk + 2 * p.stiffness);
      const n = Math.max(p.substeps, Math.ceil(dt / stableDt));
      for (let s = 0; s < n; s++) sub(dt / n, fx, fz);
    },
    sample,
    spin,
    reset() {
      u.fill(0);
      v.fill(0);
    },
  };
}
