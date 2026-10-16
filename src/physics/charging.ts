import { CELL_AH, CELL_CTH, K0, MODULE_KWH, N, cellR, chargeDerate } from './core';
export interface ChargeInput {
  T0: number; ambient: number; coolant: number; hc: number; soh: number; cRate: number;
  soc0: number; protocol: 'cccv' | 'stepped'; derating: boolean;
}
export interface ChargePt { t: number; T: number; soc: number; c: number; plate: number }
export interface ChargeResult {
  pts: ChargePt[]; t80: number; tEnd: number; Tpeak: number; plateRisk: number; heatKWh: number; derated: number;
}
export function simulateCharge(i: ChargeInput): ChargeResult {
  let T = i.T0, soc = i.soc0, t = 0, heat = 0, plateMax = 0, Tpeak = T, t80 = soc >= 80 ? 0 : NaN, derT = 0, nextS = 0;
  const dt = 2, pts: ChargePt[] = [];
  while (t < 10800 && soc < 99.5) {
    const d = i.derating ? chargeDerate(T) : 1;
    const step = i.protocol === 'stepped' ? (soc < 50 ? 1 : soc < 65 ? 0.75 : 0.55) : 1;
    let C = i.cRate * step;
    if (soc > 80) C *= Math.pow((100 - soc) / 20, 1.1);
    C = d > 0 ? Math.max(C, 0.05) * d : 0;
    if (d < 0.999) derT += dt;
    const amps = C * CELL_AH, Tk = T + K0;
    const q = Math.max(0, amps * amps * cellR(Tk, i.soh) - 0.5e-4 * amps * Tk);
    const loss = i.hc * (T - i.coolant) + 0.12 * (T - i.ambient);
    T += ((q - loss) * dt) / CELL_CTH;
    soc = Math.min(100, soc + (C * dt / 3600) * 100 * 0.995);
    heat += q * dt * N / 3.6e6;
    const p = C * Math.exp(-T / 12) * Math.pow(soc / 100, 2);
    plateMax = Math.max(plateMax, p); Tpeak = Math.max(Tpeak, T); t += dt;
    if (isNaN(t80) && soc >= 80) t80 = t;
    if (t >= nextS) { pts.push({ t: t / 60, T, soc, c: C, plate: 1 - Math.exp(-p / 0.8) }); nextS += 30; }
  }
  return { pts, t80: t80 / 60, tEnd: t / 60, Tpeak, plateRisk: 1 - Math.exp(-plateMax / 0.8), heatKWh: heat, derated: derT / Math.max(t, 1) };
}
export function sweepRates(base: Omit<ChargeInput, 'cRate'>) {
  const rows = [];
  for (let c = 0.5; c <= 4.001; c += 0.25) {
    const r = simulateCharge({ ...base, cRate: c });
    rows.push({ c, t80: isFinite(r.t80) ? r.t80 : 180, Tpeak: r.Tpeak, plate: r.plateRisk });
  }
  const ok = rows.filter(r => r.Tpeak <= 45 && r.plate <= 0.3 && r.t80 < 180);
  const best = ok.length ? ok.reduce((a, b) => (b.t80 < a.t80 ? b : a)) : rows[0];
  return { rows, best, limited: ok.length === 0 };
}
export const MODULE_ENERGY_KWH = MODULE_KWH;
