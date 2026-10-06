// Cup motion + jelly wobble. Pure numbers, no three.js: step() advances the state, the scene reads it.

const TAU = Math.PI * 2;

export const SIM = {
  followFrequency: 7, // Hz, cup chasing the drag target
  maxOffset: 0.34, // how far the cup may slide from home
  maxSpeed: 12,
  maxAccel: 300,
  returnDamping: 0.55,
  jellyFrequency: 0.9,
  jellyDamping: 1.3,
  viscosity: 0.12, // jelly sags against the cup's velocity, like syrup dragged along
  maxDisplacement: 0.075,
  waveFrequency: 2.2,
  waveDamping: 1.2,
  fruitLag: 0.3,
  tiltFrequency: 3,
  tiltDamping: 0.35,
  tiltMax: (3 * Math.PI) / 180,
  shakeFrequency: 3.2,
  shakeAmplitude: 0.12,
  shakeDuration: 1.2,
  substeps: 8,
};

export function createSim(p = SIM) {
  const s = {
    t: 0,
    target: { x: 0, z: 0 },
    cup: { x: 0, z: 0, vx: 0, vz: 0, ax: 0, az: 0 },
    slosh: { x: 0, z: 0, vx: 0, vz: 0 }, // lateral shear of the jelly top
    lag: { x: 0, z: 0 }, // fruits trail the jelly
    wave: { y: 0, v: 0 }, // radial surface mode
    tilt: { x: 0, z: 0, vx: 0, vz: 0 }, // cup lean, radians
    shakeStart: -1,
  };

  const clampLen = (x, z, max) => {
    const l = Math.hypot(x, z);
    return l > max ? [(x / l) * max, (z / l) * max] : [x, z];
  };

  function sub(dt) {
    s.t += dt;
    const c = s.cup;
    let tx = s.target.x;
    let tz = s.target.z;
    if (s.shakeStart >= 0) {
      const k = (s.t - s.shakeStart) / p.shakeDuration;
      if (k >= 1) s.shakeStart = -1;
      else tx += p.shakeAmplitude * Math.sin(TAU * p.shakeFrequency * (s.t - s.shakeStart)) * Math.sin(Math.PI * k);
    }
    [tx, tz] = clampLen(tx, tz, p.maxOffset);

    const w = TAU * p.followFrequency;
    let ax = w * w * (tx - c.x) - 2 * p.returnDamping * w * c.vx;
    let az = w * w * (tz - c.z) - 2 * p.returnDamping * w * c.vz;
    [ax, az] = clampLen(ax, az, p.maxAccel);
    c.vx += ax * dt;
    c.vz += az * dt;
    [c.vx, c.vz] = clampLen(c.vx, c.vz, p.maxSpeed);
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.ax = ax;
    c.az = az;

    // Thick jelly: its top drags behind the cup's velocity and creeps back, overdamped (no ringing).
    const j = s.slosh;
    const wj = TAU * p.jellyFrequency;
    j.vx += (wj * wj * (-c.vx * p.viscosity - j.x) - 2 * p.jellyDamping * wj * j.vx) * dt;
    j.vz += (wj * wj * (-c.vz * p.viscosity - j.z) - 2 * p.jellyDamping * wj * j.vz) * dt;
    j.x += j.vx * dt;
    j.z += j.vz * dt;
    // Soft limit: the jelly can only lean so far before it pushes back.
    const m = p.maxDisplacement;
    const l = Math.hypot(j.x, j.z);
    if (l > m) {
      const k = (m * Math.tanh(l / m)) / l;
      j.x *= k;
      j.z *= k;
    }

    const a = Math.min(1, dt / p.fruitLag);
    s.lag.x += (j.x - s.lag.x) * a;
    s.lag.z += (j.z - s.lag.z) * a;

    // The surface ripples when the jelly swings fast.
    const ww = TAU * p.waveFrequency;
    const drive = Math.hypot(j.vx, j.vz) * 14;
    s.wave.v += (-ww * ww * s.wave.y - 2 * p.waveDamping * ww * s.wave.v + drive) * dt;
    s.wave.y += s.wave.v * dt;

    // Cup leans into its acceleration.
    const tw = TAU * p.tiltFrequency;
    const gx = Math.max(-p.tiltMax, Math.min(p.tiltMax, -az * 0.0015));
    const gz = Math.max(-p.tiltMax, Math.min(p.tiltMax, ax * 0.0015));
    s.tilt.vx += (tw * tw * (gx - s.tilt.x) - 2 * p.tiltDamping * tw * s.tilt.vx) * dt;
    s.tilt.vz += (tw * tw * (gz - s.tilt.z) - 2 * p.tiltDamping * tw * s.tilt.vz) * dt;
    s.tilt.x += s.tilt.vx * dt;
    s.tilt.z += s.tilt.vz * dt;
  }

  return {
    state: s,
    step(dt) {
      dt = Math.min(dt, 1 / 20);
      const h = dt / p.substeps;
      for (let i = 0; i < p.substeps; i++) sub(h);
    },
    setTarget(x, z) {
      s.target.x = x;
      s.target.z = z;
    },
    shake() {
      s.shakeStart = s.t;
    },
  };
}
