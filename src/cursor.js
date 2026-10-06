// Painted cursor from the original's settings: a 23 px cream disc with a 7 px ink dot, trailing the pointer slightly,
// growing over something grabbable and pressing in while held.

const el = document.createElement('div');
el.className = 'cursor';
el.innerHTML = '<i></i>';
document.body.append(el);

const pos = { x: innerWidth / 2, y: innerHeight / 2 };
const target = { ...pos };
let seen = false;

addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  target.x = e.clientX;
  target.y = e.clientY;
  if (!seen) {
    pos.x = target.x;
    pos.y = target.y;
    seen = true;
  }
  // Over the page's own controls the system pointer takes over.
  el.classList.toggle('away', !e.target.closest('canvas'));
});
document.documentElement.addEventListener('pointerleave', () => el.classList.add('away'));
addEventListener('pointerdown', (e) => e.pointerType === 'mouse' && el.classList.add('pressed'));
addEventListener('pointerup', () => el.classList.remove('pressed'));

let last = performance.now();
(function follow(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const k = 1 - Math.exp(-22 * dt);
  pos.x += (target.x - pos.x) * k;
  pos.y += (target.y - pos.y) * k;
  el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  el.classList.toggle('visible', seen);
  requestAnimationFrame(follow);
})(last);

export const cursor = {
  hover(on) {
    el.classList.toggle('hover', on);
  },
};
