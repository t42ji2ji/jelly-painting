// Painterly post-processing in TSL:
//   1. structure tensor of the rendered colour -> stroke direction field (along edges, across gradients)
//   2. line-integral smear of the colour along that field, with bristle ribs and a fixed per-pixel scatter
//   3. fixed dither grain, then a deckled paper frame around the painting

import * as THREE from 'three/webgpu';
import {
  pass, rtt, Fn, vec2, vec3, vec4, float, uniform, screenUV, screenSize, screenCoordinate,
  mix, smoothstep, fract, dot, sqrt, max, min, abs, length, mx_noise_float, mx_fractal_noise_float, select, renderOutput,
} from 'three/tsl';

export const postU = {
  spacing: uniform(5), // px between Sobel taps
  strokeLength: uniform(26), // px
  bristleScale: uniform(3.2),
  ribContrast: uniform(0.16),
  speckle: uniform(5), // px of fixed scatter at the stroke start
  grain: uniform(0.05),
  paper: uniform(new THREE.Color('#f7f5f0').convertLinearToSRGB()), // display-space, the frame is composited after tone mapping
  frameSize: uniform(0.82), // painting side as a fraction of the shorter screen side
  strength: uniform(1),
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
      return acc.div(25);
    })(),
    null,
    null,
    { resolutionScale: 0.25 },
  );

  // Direction along the edge at uv; flat areas fall back to a gently wandering horizontal.
  const flowAt = (p) => {
    const t = tensorBlur.sample(p);
    const E = t.x, F = t.y, G = t.z;
    const disc = sqrt(E.sub(G).mul(E.sub(G)).add(F.mul(F).mul(4)));
    const l1 = E.add(G).add(disc).mul(0.5);
    const tang = vec2(E.sub(l1), F);
    const tl = length(tang);
    const wander = mx_noise_float(vec3(p.mul(3), 0)).mul(0.5);
    const fallback = vec2(wander.cos(), wander.sin());
    const k = smoothstep(0.0005, 0.01, disc).mul(smoothstep(0.0, 0.0001, tl));
    return mix(fallback, tang.div(max(tl, 1e-6)), k).normalize();
  };

  const paint = Fn(() => {
    const fc = screenCoordinate.xy;
    const n1 = ign(fc);
    const n2 = ign(fc.add(vec2(17, 59)));
    const n3 = ign(fc.add(vec2(43, 23)));

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
        rib.addAssign(mx_noise_float(vec3(p.mul(screenSize).div(postU.bristleScale), 7)).mul(w));
        wsum.addAssign(w);
        const nd = flowAt(p);
        d.assign(select(dot(nd, d).lessThan(0), nd.negate(), nd));
        p.addAssign(d.mul(stepUv));
      }
    }

    const smeared = acc.div(wsum);
    const ribs = rib.div(wsum).mul(postU.ribContrast).mul(2).add(1);
    const base = color.sample(screenUV).rgb;
    // Tone map here so grain and paper live in display space.
    let col = renderOutput(vec4(mix(base, smeared.mul(ribs), postU.strength), 1)).rgb;

    // Fixed dither: tied to the pixel, not to time, so it reads as paper tooth.
    col = col.add(n3.sub(0.5).mul(postU.grain));

    // 3. Deckled frame.
    const aspect = screenSize.x.div(screenSize.y);
    const q = screenUV.sub(0.5).mul(vec2(aspect, 1));
    const half = vec2(min(aspect, 1).mul(postU.frameSize).mul(0.5));
    const rad = float(0.05);
    const dq = abs(q).sub(half).add(rad);
    const sd = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(rad);
    // Edge wobble plus bristle streaks running out of the painting, perpendicular to the nearest edge.
    const deckle = mx_fractal_noise_float(vec3(q.mul(6), 11), 3).mul(0.012);
    const nearSide = dq.x.greaterThan(dq.y);
    const bristleUv = select(nearSide, vec2(q.x.mul(6), q.y.mul(160)), vec2(q.x.mul(160), q.y.mul(6)));
    const bristle = mx_noise_float(vec3(bristleUv, 13)).mul(0.01);
    const d = sd.add(deckle).add(bristle);
    const px = float(1).div(screenSize.y);
    // Thin paint near the edge lets the paper show through.
    const thin = smoothstep(-0.03, 0, d).mul(mx_noise_float(vec3(q.mul(40), 17)).mul(0.5).add(0.5)).mul(0.6);
    const mask = smoothstep(px.mul(1.5), px.mul(-1.5), d).mul(float(1).sub(thin));

    const paper = vec3(postU.paper).add(n3.sub(0.5).mul(0.02));
    return vec4(mix(paper, col, mask), 1);
  });

  const pipeline = new THREE.RenderPipeline(renderer, paint());
  pipeline.outputColorTransform = false;
  return { pipeline, scenePass };
}
