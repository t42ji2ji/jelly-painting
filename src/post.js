// Painterly post-processing in TSL:
//   1. structure tensor of the rendered colour -> stroke direction field (along edges, across gradients)
//   2. line-integral smear of the colour along that field, with bristle ribs and a fixed per-pixel scatter
//   3. fixed dither grain, then a deckled paper frame around the painting

import * as THREE from 'three/webgpu';
import {
  pass, rtt, Fn, If, vec2, vec3, vec4, float, uniform, screenUV, screenSize, screenCoordinate,
  mix, smoothstep, fract, dot, sqrt, max, min, abs, length, mx_noise_float, mx_fractal_noise_float, select, renderOutput, time, sin,
} from 'three/tsl';

export const postU = {
  spacing: uniform(2.5), // px between Sobel taps
  strokeLength: uniform(10), // px
  bristleScale: uniform(3.4),
  ribContrast: uniform(0.11),
  speckle: uniform(7), // px of fixed scatter at the stroke start
  grain: uniform(0.105),
  grainSize: uniform(1), // px per grain cell
  grainColor: uniform(0), // how much of the grain differs per channel
  paper: uniform(new THREE.Color('#f7f5f0').convertLinearToSRGB()), // display-space, the frame is composited after tone mapping
  frameSize: uniform(0.62), // painting side as a fraction of the shorter screen side
  strength: uniform(0.74),
  reveal: uniform(1), // 0 → 1: brush strokes lay the painting over the loading study
  excite: uniform(0), // 0 → 1 while the subject is being shaken: stars flare, extra glints appear
};

const STEPS = 8;

const ign = (p) => fract(fract(dot(p, vec2(0.06711056, 0.00583715))).mul(52.9829189));

export function createPost(renderer, scene, camera) {
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const texel = vec2(1).div(screenSize);

  // 1. Structure tensor at quarter resolution (the bilinear upsample smooths the field for free).
  const tensor = rtt(
    Fn(() => {
      const s = texel.mul(postU.spacing);
      const c = (i, j) => color.sample(screenUV.add(vec2(i, j).mul(s))).rgb;
      const gx = c(1, -1).add(c(1, 0).mul(2)).add(c(1, 1)).sub(c(-1, -1).add(c(-1, 0).mul(2)).add(c(-1, 1)));
      const gy = c(-1, 1).add(c(0, 1).mul(2)).add(c(1, 1)).sub(c(-1, -1).add(c(0, -1).mul(2)).add(c(1, -1)));
      return vec4(dot(gx, gx), dot(gx, gy), dot(gy, gy), 1);
    })(),
    null,
    null,
    { resolutionScale: 0.25 },
  );

  // Blur the tensor once so strokes sweep in long arcs instead of following every pixel edge.
  const tensorBlur = rtt(
    Fn(() => {
      const s = texel.mul(10);
      let acc = vec4(0);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) acc = acc.add(tensor.sample(screenUV.add(vec2(i, j).mul(s))));
      // w: the slow wander angle for flat areas, computed here at quarter resolution instead of per stroke step.
      return vec4(acc.xyz.div(25), mx_noise_float(vec3(screenUV.mul(3), 0)).mul(0.5));
    })(),
    null,
    null,
    { resolutionScale: 0.25 },
  );

  // Bristle ribs, a fixed screen-space noise: rendered once (and again on resize), then just looked up.
  const bristles = rtt(
    Fn(() => vec4(mx_noise_float(vec3(screenUV.mul(screenSize).div(postU.bristleScale), 7)), 0, 0, 1))(),
    null,
    null,
    { autoUpdate: false },
  );

  // Direction along the edge at uv; flat areas fall back to a gently wandering horizontal.
  const flowAt = (p) => {
    const t = tensorBlur.sample(p);
    const E = t.x, F = t.y, G = t.z;
    const disc = sqrt(E.sub(G).mul(E.sub(G)).add(F.mul(F).mul(4)));
    const l1 = E.add(G).add(disc).mul(0.5);
    const tang = vec2(E.sub(l1), F);
    const tl = length(tang);
    const wander = t.w;
    const fallback = vec2(wander.cos(), wander.sin());
    const k = smoothstep(0.0005, 0.01, disc).mul(smoothstep(0.0, 0.0001, tl));
    return mix(fallback, tang.div(max(tl, 1e-6)), k).normalize();
  };

  const paint = Fn(() => {
    const fc = screenCoordinate.xy;
    const n1 = ign(fc);
    const n2 = ign(fc.add(vec2(17, 59)));
    const n3 = ign(fc.add(vec2(43, 23)));

    // The painting's outline, first: the strokes are skipped outside it.
    const aspect = screenSize.x.div(screenSize.y);
    const q = screenUV.sub(0.5).mul(vec2(aspect, 1));
    const half = vec2(min(aspect, 1).mul(postU.frameSize).mul(0.5));
    const rad = half.x.mul(0.09);
    const dq = abs(q).sub(half).add(rad);
    const sd = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(rad);
    // A gentle hand-cut wobble, then the edge dissolves into grain over a few pixels instead of a hard line.
    const deckle = mx_fractal_noise_float(vec3(q.mul(5), 11), 2).mul(half.x.mul(0.012));
    const d = sd.add(deckle);

    const base = color.sample(screenUV).rgb;
    // 2. Strokes only inside the painting: outside the frame it's bare paper, so skip the smear there.
    const smeared = base.toVar();
    If(d.lessThan(float(1).div(screenSize.y).mul(16)), () => {
      // Fixed scatter: every pixel starts its stroke a little off, dissolving edges into speckle.
      const start = screenUV.add(vec2(n1, n2).sub(0.5).mul(postU.speckle).mul(texel)).toVar();
      // Stroke length varies per patch so the canvas doesn't read as one uniform blur.
      const len = postU.strokeLength.mul(mx_noise_float(vec3(screenUV.mul(screenSize).div(70), 3)).mul(0.5).add(0.85));
      const stepUv = texel.mul(len.div(STEPS));

      const acc = vec3(0).toVar();
      const wsum = float(0).toVar();
      const rib = float(0).toVar();
      const dir0 = flowAt(start).toVar();

      for (const sign of [1, -1]) {
        const p = start.toVar();
        const d = dir0.mul(sign).toVar();
        for (let i = 0; i < STEPS; i++) {
          const w = 1 - i / STEPS;
          acc.addAssign(color.sample(p).rgb.mul(w));
          rib.addAssign(bristles.sample(p).x.mul(w));
          wsum.addAssign(w);
          const nd = flowAt(p);
          d.assign(select(dot(nd, d).lessThan(0), nd.negate(), nd));
          p.addAssign(d.mul(stepUv));
        }
      }

      smeared.assign(acc.div(wsum).mul(rib.div(wsum).mul(postU.ribContrast).mul(2).add(1)));
    });
    // Tone map here so grain and paper live in display space.
    let col = renderOutput(vec4(mix(base, smeared, postU.strength), 1)).rgb;

    // Fixed dither: tied to the pixel, not to time, so it reads as paper tooth. A little of it per channel.
    const gc = fc.div(postU.grainSize).floor();
    const g1 = ign(gc), g2 = ign(gc.add(vec2(17, 59))), g3 = ign(gc.add(vec2(43, 23)));
    col = col.add(g3.sub(0.5).mul(postU.grain)).add(vec3(g1, g2, g3).sub(0.5).mul(postU.grain.mul(postU.grainColor)));

    // 3. Deckled frame.
    const px = float(1).div(screenSize.y);
    const edgeW = px.mul(5);
    // White-noise hash here: the interleaved-gradient pattern shows up as a regular halftone along the edge.
    const n4 = fract(sin(dot(fc, vec2(12.9898, 78.233))).mul(43758.5453));
    const thin = smoothstep(edgeW.mul(-5), 0, d).mul(0.25);
    const mask = smoothstep(edgeW, edgeW.negate(), d.add(n4.sub(0.5).mul(edgeW).mul(2.4))).mul(float(1).sub(thin));

    // A few crayon four-point stars on the background, same shape as the cursor; kept clear of the subject.
    const fq = q.div(half.x.mul(2)); // painting units, side = 1, centred
    const cells = float(5);
    const cell = fq.add(0.5).mul(cells).floor();
    const cr = fract(sin(dot(cell, vec2(41.3, 289.1))).mul(43758.5453));
    const cr2 = fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453));
    const cr3 = fract(sin(dot(cell, vec2(269.5, 183.3))).mul(43758.5453));
    const center = cell.add(vec2(cr2, cr3).mul(0.5).add(0.25)).div(cells).sub(0.5);
    const size = cr3.mul(0.018).add(0.02);
    // Capped motion: at most ~0.5 Hz and ±25 % in size even when shaken hard, so it never reads as flicker.
    const twinkle = sin(time.mul(float(1.3).add(postU.excite.mul(1.8))).add(cr.mul(40))).mul(float(0.1).add(postU.excite.mul(0.15))).add(1).add(postU.excite.mul(0.2));
    const o = fq.sub(center).div(size.mul(twinkle));
    const f = sqrt(abs(o.x).div(0.92)).add(sqrt(abs(o.y).div(0.92)));
    const ragged = float(1).sub(n4.sub(0.5).mul(0.3));
    const placed = cr.greaterThan(0.72).and(length(center).greaterThan(0.36));
    const star = select(placed, float(1), float(0)).mul(f.lessThan(ragged).select(n2.greaterThan(0.12).select(1, 0.5), 0));
    col = mix(col, vec3(1, 0.96, 0.87), star.mul(0.92));

    // A handful of small glints that come out while it's shaken (≤ ~5), breathing slowly rather than flickering.
    const gCells = float(8);
    const gCell = fq.add(0.5).mul(gCells).floor();
    const gr = fract(sin(dot(gCell, vec2(12.9898, 78.233))).mul(43758.5453));
    const gr2 = fract(sin(dot(gCell, vec2(39.35, 11.13))).mul(43758.5453));
    const gCenter = gCell.add(vec2(gr2, gr).mul(0.6).add(0.2)).div(gCells).sub(0.5);
    const gBeat = sin(time.mul(3).add(gr.mul(60))).mul(0.2).add(0.8);
    const gSize = gr2.mul(0.006).add(0.007).mul(gBeat);
    const go = fq.sub(gCenter).div(max(gSize, 1e-4));
    const gf = sqrt(abs(go.x).div(0.92)).add(sqrt(abs(go.y).div(0.92)));
    const gOn = gr.lessThan(postU.excite.mul(0.1)).and(length(gCenter).greaterThan(0.3));
    const glint = select(gOn, float(1), float(0)).mul(gf.lessThan(ragged).select(1, 0));
    col = mix(col, vec3(1, 0.97, 0.9), glint.mul(0.9));

    const paper = vec3(postU.paper).add(n3.sub(0.5).mul(0.02));

    // Reveal: horizontal bands of paint sweeping across, each band with its own start and ragged bristle tip.
    // Once the sweep is done (reveal = 1) every band is fully painted, so this is skipped.
    const alpha = float(1).toVar();
    If(postU.reveal.lessThan(1), () => {
      const sp = screenUV.mul(screenSize).div(screenSize.y);
      const band = sp.y.mul(14).add(mx_noise_float(vec3(sp.mul(vec2(2, 0.5)), 21)).mul(0.6)).floor();
      const bandRand = ign(vec2(band, 3).mul(7.31));
      const dirFlip = bandRand.greaterThan(0.5);
      const along = select(dirFlip, sp.x.div(aspect), float(1).sub(sp.x.div(aspect)));
      const tip = mx_noise_float(vec3(sp.x.mul(3), sp.y.mul(90), 23)).mul(0.06);
      const front = postU.reveal.mul(1.9).sub(bandRand.mul(0.8));
      alpha.assign(smoothstep(front, front.sub(0.04), along.add(tip)));
    });
    return vec4(mix(paper, col, mask).mul(alpha), alpha);
  });

  const pipeline = new THREE.RenderPipeline(renderer, paint());
  pipeline.outputColorTransform = false;
  return { pipeline, scenePass, bristles };
}
