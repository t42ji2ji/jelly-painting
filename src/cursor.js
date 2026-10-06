// Cursor: a four-point star in dry crayon, drawn once into a small canvas, pinned exactly to the pointer
// (no smoothing, so it never drifts from where a click lands). Grows over something grabbable, presses in while held.

const SIZE = 48; // css px
const dpr = Math.min(devicePixelRatio || 1, 2);

const el = document.createElement('canvas');
el.className = 'cursor';
el.width = el.height = SIZE * dpr;
el.style.width = el.style.height = `${SIZE}px`;
document.body.append(el);

// Same star as the background sparkles: |x|^0.5 + |y|^0.5 < 1, edges broken up like crayon on rough paper.
{
  const g = el.getContext('2d');
  const n = SIZE * dpr;
  const img = g.createImageData(n, n);
  const fill = [255, 244, 220], ink = [125, 96, 78];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = ((x + 0.5) / n) * 2 - 1, v = ((y + 0.5) / n) * 2 - 1;
      const f = Math.sqrt(Math.abs(u) / 0.92) + Math.sqrt(Math.abs(v) / 0.92);
      const grain = Math.random();
      const edge = 1 - (grain - 0.5) * 0.28; // ragged outline
      const o = (y * n + x) * 4;
      let c = null, a = 0;
      if (f < edge * 0.8) {
        c = fill;
        a = grain < 0.1 ? 0.55 : 1; // a few dry specks inside
      } else if (f < edge) {
        c = ink;
        a = grain < 0.25 ? 0 : 0.85;
      }
      if (!c) continue;
      const k = (Math.random() - 0.5) * 14;
      img.data[o] = c[0] + k;
      img.data[o + 1] = c[1] + k;
      img.data[o + 2] = c[2] + k;
      img.data[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
}

addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  el.classList.add('visible');
  // Over the page's own controls the system pointer takes over.
  el.classList.toggle('away', !e.target.closest('canvas'));
});
document.documentElement.addEventListener('pointerleave', () => el.classList.add('away'));
addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && el.classList.add('pressed'));
addEventListener('pointerup', () => el.classList.remove('pressed'));

export const cursor = {
  hover(on) {
    el.classList.toggle('hover', on);
  },
};
