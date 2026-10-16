import { CoolMode, PackParams, solvePack, pumpPower, arrhenius, K0 } from './core';
export interface CoolEval { mode: CoolMode; flow: number; Tmax: number; Tavg: number; dT: number; pump: number; removed: number; cop: number; ageX: number; J: number }
export interface Weights { thermal: number; uniform: number; energy: number } // 0..100 each
export function evalCooling(base: PackParams, mode: CoolMode, flow: number, w: Weights): CoolEval {
  const r = solvePack({ ...base, mode, flow, coolingFail: false });
  const Tmax = Math.max(...r.T), Tmin = Math.min(...r.T), Tavg = r.T.reduce((a, b) => a + b, 0) / r.T.length;
  const pump = pumpPower(mode, flow);
  const removed = r.T.reduce((a, t, i) => a + r.hc * (t - r.Tc[i]), 0);
  const J = (w.thermal / 50) * Math.pow(Math.max(0, Tmax - 32) / 10, 2) + (w.uniform / 50) * Math.pow((Tmax - Tmin) / 5, 2) + (w.energy / 50) * (pump / 200);
  return { mode, flow, Tmax, Tavg, dT: Tmax - Tmin, pump, removed, cop: removed / (pump + 1), ageX: arrhenius(40000, Tavg + K0), J };
}
export function sweepFlow(base: PackParams, mode: CoolMode, w: Weights) {
  const rows: CoolEval[] = [];
  for (let f = 0; f <= 100; f += 4) rows.push(evalCooling(base, mode, f, w));
  const best = rows.reduce((a, b) => (b.J < a.J ? b : a));
  return { rows, best };
}
