import { CELL_CTH, K0, clamp } from './core';
const RG = 8.314;
/** Arrhenius sub-reactions (Kim/Hatchard-style kinetics, energy shares tuned for a 50 Ah cell). */
export const RX = [
  { name: 'SEI decomposition', A: 1.667e15, Ea: 1.3508e5, f: 0.06 },
  { name: 'Anode–electrolyte', A: 2.5e13, Ea: 1.3e5, f: 0.22 },
  { name: 'Cathode decomposition', A: 6.667e13, Ea: 1.396e5, f: 0.5 },
  { name: 'Electrolyte decomposition', A: 5.14e25, Ea: 2.74e5, f: 0.22 },
];
export const reactionEnergy = (soc: number) => 650e3 * (0.25 + 0.75 * soc / 100); // J, grows with SOC
export interface RunawayInput {
  T0: number; ambient: number; coolant: number; hc: number; ha: number; soc: number;
  shortW: number; extW: number; baseW?: number; horizon?: number;
}
export interface RunawayPt { t: number; T: number; dTdt: number; c: number[] }
export interface RunawayResult {
  pts: RunawayPt[]; runaway: boolean; tRun: number; Tpeak: number; Tonset: number; tOnset: number;
  stageT: number[]; Etot: number; adiabatic: number;
}
export const nominalBase = (i: RunawayInput) => i.hc * (i.T0 - i.coolant) + i.ha * (i.T0 - i.ambient);

export function simulateRunaway(i: RunawayInput): RunawayResult {
  const Etot = reactionEnergy(i.soc), hor = i.horizon ?? 7200;
  const Tc = i.coolant + K0, Ta = i.ambient + K0;
  const base = i.baseW ?? nominalBase(i);
  let T = i.T0 + K0, t = 0, it = 0, nextS = 0, tRun = NaN, tOnset = NaN, Tonset = NaN, Tpeak = T;
  const c = [1, 1, 1, 1], stageT = [NaN, NaN, NaN, NaN], pts: RunawayPt[] = [];
  while (t < hor && it++ < 90000) {
    const k = RX.map((r, j) => { const v = r.A * Math.exp(-r.Ea / (RG * T)); return j === 1 ? v * (1 - c[0]) : v; });
    const Qr = RX.reduce((a, r, j) => a + Etot * r.f * k[j] * c[j], 0);
    const net = base + i.shortW + i.extW - (i.hc * (T - Tc) + i.ha * (T - Ta));
    const dTdt = (net + Qr) / CELL_CTH;
    const dt = clamp(0.5 / Math.max(Math.abs(dTdt), 1e-9), 0.002, 2);
    let H = 0;
    for (let j = 0; j < 4; j++) {
      const nc = c[j] * Math.exp(-k[j] * dt);
      H += Etot * RX[j].f * (c[j] - nc); c[j] = nc;
      if (c[j] < 0.5 && isNaN(stageT[j])) stageT[j] = t;
    }
    T = Math.min(1300, T + (net * dt + H) / CELL_CTH); t += dt;
    if (T > Tpeak) Tpeak = T;
    if (isNaN(tOnset) && c[0] < 0.97) { tOnset = t; Tonset = T - K0; }
    if (isNaN(tRun) && dTdt > 1) tRun = t;
    if (t >= nextS) { pts.push({ t, T: T - K0, dTdt, c: [...c] }); nextS += isNaN(tRun) ? 30 : 1; }
    if (!isNaN(tRun) && (t > tRun + 90 || (dTdt < 0.02 && t > tRun + 15))) break;
    if (isNaN(tRun) && Math.abs(dTdt) < 1e-5 && Qr < 1e-3 && t > 300) break;
  }
  return { pts, runaway: !isNaN(tRun), tRun, Tpeak: Tpeak - K0, Tonset, tOnset, stageT, Etot, adiabatic: Etot / CELL_CTH };
}
/** Minimum cell→coolant conductance (W/K) that avoids runaway for the same heat load (bisection). */
export function criticalHc(inp: RunawayInput): number {
  const baseW = inp.baseW ?? nominalBase(inp);
  const run = (hc: number) => simulateRunaway({ ...inp, hc, baseW, horizon: 7200 }).runaway;
  if (!run(0.05)) return 0.05;
  if (run(8)) return Infinity;
  let lo = 0.05, hi = 8;
  for (let n = 0; n < 11; n++) { const m = (lo + hi) / 2; if (run(m)) lo = m; else hi = m; }
  return hi;
}
export function riskScore(r: RunawayResult) {
  if (r.runaway) return Math.round(60 + 40 * (1 - Math.min(1, r.tRun / 7200)));
  return Math.round(clamp((r.Tpeak - 45) / 75, 0, 1) * 55);
}
/** Heat generation of fresh material at temperature T (°C) — Semenov diagram input (conservative). */
export function freshReactionPower(Tc: number, soc: number) {
  const T = Tc + K0, E = reactionEnergy(soc);
  return RX.reduce((a, r) => a + E * r.f * r.A * Math.exp(-r.Ea / (RG * T)), 0);
}
