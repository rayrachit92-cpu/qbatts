import { N, clamp } from './core';
import { simulatePropagation } from './propagation';
import { solvePack, PackParams } from './core';
export interface Comp { graphite: number; pcm: number; thick: number } // vol% graphite, vol% PCM, mm
const KM = 0.25, KG = 120, PC = 0.08, TEXP = 1.8, RHO = { m: 1.1, g: 2.2, p: 0.8 }, USD = { m: 8, g: 25, p: 12 };
const A_FACE = 0.02, A_CONTACT = 0.0015, LATENT_JG = 200;
export function compositeProps(c: Comp) {
  let pg = c.graphite / 100, pp = c.pcm / 100;
  if (pg + pp > 0.85) { const s = 0.85 / (pg + pp); pg *= s; pp *= s; }
  const pm = 1 - pg - pp;
  const kPerc = pg > PC ? KM + (KG - KM) * Math.pow((pg - PC) / (1 - PC), TEXP) : KM * (1 + 2 * pg);
  const k = clamp(kPerc * (1 - 0.5 * pp), 0.1, 20);
  const V = A_FACE * c.thick * 1e-3 * 1e6; // cm³ per cell
  const rho = pm * RHO.m + pg * RHO.g + pp * RHO.p;
  const massG = V * rho;
  const costUSD = (V * pm * RHO.m * USD.m + V * pg * RHO.g * USD.g + V * pp * RHO.p * USD.p) / 1000;
  const latentJ = V * pp * RHO.p * LATENT_JG;
  const gComp = (k * A_CONTACT) / (c.thick * 1e-3);
  return { k, rho, massG, costUSD, latentJ, bufferK: latentJ / 900, gComp, gLat: 0.1 + gComp, pm, pg, pp };
}
export interface Cand { c: Comp; k: number; massG: number; costUSD: number; Tmax: number; dT: number; tProp: number; score: number }
export function optimizeComposite(base: PackParams, w: { thermal: number; uniform: number; prop: number; mass: number; cost: number },
  ctx: { trigger: number; hc: number; coolant: number; ambient: number; soc: number }) {
  const out: Cand[] = [];
  for (const graphite of [0, 5, 10, 15, 20, 25, 30, 40])
    for (const pcm of [0, 10, 20, 30, 45])
      for (const thick of [1, 2, 3, 4, 6]) {
        const c = { graphite, pcm, thick }, p = compositeProps(c);
        const pk = solvePack({ ...base, gLat: p.gLat });
        const pr = simulatePropagation({ trigger: ctx.trigger, ambient: ctx.ambient, coolant: ctx.coolant, hc: ctx.hc, gLat: p.gLat, barrier: 0, latentJ: p.latentJ, soc: ctx.soc, duration: 300 });
        out.push({ c, k: p.k, massG: p.massG, costUSD: p.costUSD, Tmax: Math.max(...pk.T), dT: Math.max(...pk.T) - Math.min(...pk.T), tProp: isNaN(pr.tFirst) ? 300 : pr.tFirst, score: 0 });
      }
  const rng = (f: (x: Cand) => number) => { const v = out.map(f), lo = Math.min(...v), hi = Math.max(...v); return (x: Cand) => (hi - lo < 1e-9 ? 0 : (f(x) - lo) / (hi - lo)); };
  const nT = rng(x => x.Tmax), nD = rng(x => x.dT), nP = rng(x => x.tProp), nM = rng(x => x.massG), nC = rng(x => x.costUSD);
  for (const x of out) x.score = w.thermal * nT(x) + w.uniform * nD(x) + w.prop * (1 - nP(x)) + w.mass * nM(x) + w.cost * nC(x);
  const best = out.reduce((a, b) => (b.score < a.score ? b : a));
  return { cands: out, best, count: out.length, cells: N };
}
