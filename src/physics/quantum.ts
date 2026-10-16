import { mulberry32 } from './core';
/** Eigen-decomposition of a real symmetric 2×2 (Hermitian) operator [[a,b],[b,c]]. */
export function eig2(a: number, b: number, c: number) {
  const tr = a + c, det = a * c - b * b, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let vx: number, vy: number;
  if (Math.abs(b) > 1e-12) { vx = l1 - c; vy = b; } else if (a >= c) { vx = 1; vy = 0; } else { vx = 0; vy = 1; }
  const n = Math.hypot(vx, vy) || 1; vx /= n; vy /= n;
  return { l1, l2, v1: [vx, vy], v2: [-vy, vx] };
}
export const NQ = 4;
export interface Qubo { h: number[]; J: number[][] }
export const bits = (x: number) => Array.from({ length: NQ }, (_, q) => (x >> q) & 1);
export function energyOf(x: number, H: Qubo) {
  const b = bits(x); let e = 0;
  for (let i = 0; i < NQ; i++) { e += H.h[i] * b[i]; for (let j = i + 1; j < NQ; j++) e += H.J[i][j] * b[i] * b[j]; }
  return e;
}
export const allEnergies = (H: Qubo) => Array.from({ length: 1 << NQ }, (_, x) => energyOf(x, H));
/** Real-amplitude statevector sim of an RY + CNOT-ring ansatz. theta[layer][qubit]. */
export function circuitProbs(theta: number[][]): number[] {
  const D = 1 << NQ; let a = new Array(D).fill(0); a[0] = 1;
  for (const layer of theta) {
    for (let q = 0; q < NQ; q++) {
      const cs = Math.cos(layer[q] / 2), sn = Math.sin(layer[q] / 2), m = 1 << q, b = a.slice();
      for (let i = 0; i < D; i++) if (!(i & m)) { const x0 = a[i], x1 = a[i | m]; b[i] = cs * x0 - sn * x1; b[i | m] = sn * x0 + cs * x1; }
      a = b;
    }
    for (let q = 0; q < NQ - 1; q++) {
      const cm = 1 << q, tm = 1 << (q + 1), b = a.slice();
      for (let i = 0; i < D; i++) if ((i & cm) && !(i & tm)) { b[i] = a[i | tm]; b[i | tm] = a[i]; }
      a = b;
    }
  }
  return a.map(v => v * v);
}
export const expectedEnergy = (theta: number[][], E: number[]) => circuitProbs(theta).reduce((s, p, i) => s + p * E[i], 0);
export function gaussian(r: () => number) { return Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r()); }
export function runVQE(H: Qubo, layers: number, lr: number, iters: number, noise: number, seed: number, init?: number[][]) {
  const rng = mulberry32(seed), E = allEnergies(H);
  const th = init ? init.slice(0, layers).map(r => [...r]) : Array.from({ length: layers }, () => Array.from({ length: NQ }, () => rng() * Math.PI));
  while (th.length < layers) th.push(Array.from({ length: NQ }, () => rng() * Math.PI));
  const hist: number[] = [expectedEnergy(th, E)];
  for (let it = 0; it < iters; it++) {
    const g = th.map(() => new Array(NQ).fill(0));
    for (let l = 0; l < layers; l++) for (let q = 0; q < NQ; q++) {
      const o = th[l][q]; th[l][q] = o + Math.PI / 2; const ep = expectedEnergy(th, E) + noise * gaussian(rng);
      th[l][q] = o - Math.PI / 2; const em = expectedEnergy(th, E) + noise * gaussian(rng);
      th[l][q] = o; g[l][q] = (ep - em) / 2;
    }
    for (let l = 0; l < layers; l++) for (let q = 0; q < NQ; q++) th[l][q] -= lr * g[l][q];
    hist.push(expectedEnergy(th, E));
  }
  return { theta: th, hist, probs: circuitProbs(th) };
}
export function runAnneal(H: Qubo, iters: number, seed: number) {
  const rng = mulberry32(seed + 99); let x = Math.floor(rng() * 16), e = energyOf(x, H), best = e; const hist = [best];
  for (let it = 0; it < iters; it++) {
    const Tt = 1.5 * Math.pow(0.02 / 1.5, it / Math.max(1, iters)), y = x ^ (1 << Math.floor(rng() * NQ)), ey = energyOf(y, H);
    if (ey < e || rng() < Math.exp(-(ey - e) / Tt)) { x = y; e = ey; }
    best = Math.min(best, e); hist.push(best);
  }
  return { hist, x };
}
export function dftMag(sig: number[]) {
  const n = sig.length, out: number[] = [];
  for (let k = 0; k < n / 2; k++) { let re = 0, im = 0; for (let t = 0; t < n; t++) { const w = (2 * Math.PI * k * t) / n; re += sig[t] * Math.cos(w); im -= sig[t] * Math.sin(w); } out.push(Math.hypot(re, im) / n); }
  return out;
}
