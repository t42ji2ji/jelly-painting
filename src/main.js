// Cup page: the dessert cup on the shared painted stage.

import { createStage } from './stage.js';
import { wobbleU, buildCup, updateFruits } from './scene.js';

let cup = null;

const stage = await createStage({
  onTheme(name, stage) {
    if (cup) {
      stage.subject.remove(cup.group);
      cup.group.traverse((o) => o.geometry?.dispose());
    }
    cup = buildCup(stage.theme);
    stage.subject.add(cup.group);
    stage.hit = cup.hit;
    stage.frame(cup.dims.H, cup.dims.Rt * 2, cup.dims.H * 0.45);
  },
});

stage.run((dt, s) => {
  wobbleU.slosh.value.set(s.slosh.x, s.slosh.z);
  wobbleU.wave.value = s.wave.y;
  updateFruits(cup, s);
});
