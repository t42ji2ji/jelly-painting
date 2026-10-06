// Small crayon-textured shapes for the UI (cursor star, add button): solid wax, warming toward a ragged edge.
// shape(u, v) returns a field that is < 1 inside, with u, v in -1..1.

export const starShape = (u, v) => Math.sqrt(Math.abs(u) / 0.94) + Math.sqrt(Math.abs(v) / 0.94);
export const plusShape = (u, v) => {
  const arm = (a, b) => Math.max(Math.abs(a) / 0.2, Math.abs(b) / 0.88);
  return Math.min(arm(u, v), arm(v, u));
};

export function crayonCanvas(px, shape, fill = [255, 243, 214], edge = [240, 214, 166]) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = ((x + 0.5) / px) * 2 - 1, v = ((y + 0.5) / px) * 2 - 1;
      const f = shape(u, v);
      const grain = Math.random();
      if (f >= 1 - (grain - 0.5) * 0.22) continue;
      const t = Math.max(0, Math.min(1, (f - 0.8) / 0.18)); // a thin warmer rim where the wax thins
      const k = (Math.random() - 0.5) * 10;
      const o = (y * px + x) * 4;
      for (let i = 0; i < 3; i++) img.data[o + i] = fill[i] + (edge[i] - fill[i]) * t + k;
      img.data[o + 3] = 255 * (t > 0.6 && grain < 0.2 ? 0.6 : 1);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
