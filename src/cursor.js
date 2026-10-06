// Cursor: a solid four-point star in dry crayon, installed as the native cursor image so the system draws it at the
// exact pointer position (an element chasing the pointer always trails a frame or two behind).
// Three sizes: resting, over something grabbable, pressed.

import { crayonCanvas, starShape } from './crayon.js';

const star = (px) => crayonCanvas(px, starShape).toDataURL();

// One plain image per state, hotspot at its exact centre. (A 1x/2x image-set looked sharper, but Chrome then reads
// the hotspot in the 2x image's pixels, so the click point sat ~9 px up-left of the star's centre.)
function rule(size) {
  const h = size / 2;
  return `cursor: url(${star(size)}) ${h} ${h}, auto;`;
}

const style = document.createElement('style');
const rest = rule(32), big = rule(40), small = rule(28);
style.textContent = `
html, html * { ${rest} }
html.grab, html.grab *, button:hover, label:hover, .swatch:hover { ${big} }
html.press, html.press * { ${small} }
`;
document.head.append(style);

const root = document.documentElement;
addEventListener('pointerdown', () => root.classList.add('press'));
addEventListener('pointerup', () => root.classList.remove('press'));
addEventListener('pointercancel', () => root.classList.remove('press'));

export const cursor = {
  hover(on) {
    root.classList.toggle('grab', on);
  },
};
