// Cursor: a solid four-point star in dry crayon, installed as the native cursor image so the system draws it at the
// exact pointer position (an element chasing the pointer always trails a frame or two behind).
// Three sizes: resting, over something grabbable, pressed.

import { crayonCanvas, starShape } from './crayon.js';

const star = (px) => crayonCanvas(px, starShape).toDataURL();

// CSS cursor with a 2x image for sharp edges on retina; the plain url() line is the fallback.
function rule(size) {
  const h = size / 2;
  const a = star(size), b = star(size * 2);
  return `cursor: url(${a}) ${h} ${h}, auto; cursor: -webkit-image-set(url(${a}) 1x, url(${b}) 2x) ${h} ${h}, auto; cursor: image-set(url(${a}) 1x, url(${b}) 2x) ${h} ${h}, auto;`;
}

const style = document.createElement('style');
const rest = rule(36), big = rule(48), small = rule(30);
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
