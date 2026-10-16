// Reduced-order, physics-inspired battery thermal model (SIMULATED — not measured data).
export const ROWS = 4, COLS = 6, N = ROWS * COLS;
export const CELL_AH = 50;       // Ah per cell
export const CELL_CTH = 900;     // J/K per cell (0.9 kg * ~1000 J/kgK)
export const K0 = 273.15;
export const MODULE_KWH = (N * CELL_AH * 3.65) / 1000;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _r = mulberry32(42);
/** Fixed cell-to-cell resistance spread (manufacturing variation, deterministic). */
export const RSCALE = Array.from({ length: N }, () => 0.94 + 0.12 * _r());

export function neighbors(i: number): number[] {
  const r = Math.floor(i / COLS), c = i % COLS, o: number[] = [];
  if (r > 0) o.push(i - COLS);
  if (r < ROWS - 1) o.push(i + COLS);
  if (c > 0) o.push(i - 1);
  if (c < COLS - 1) o.push(i + 1);
  return o;
}
export const ambientExposure = (i: number) => 0.08 + 0.1 * (4 - neighbors(i).length); // W/K, edge cells lose more

export type CoolMode = 'air' | 'liquid' | 'immersion';
export const COOL: Record<CoolMode, { label: string; hMax: number; lane: number; pump: number }> = {
  air: { label: 'Forced air', hMax: 0.7, lane: 12, pump: 180 },
  liquid: { label: 'Liquid cold plate', hMax: 3.2, lane: 45, pump: 260 },
  immersion: { label: 'Dielectric immersion', hMax: 5.2, lane: 70, pump: 420 },
};
export const PASSIVE_H = 0.12;
/** Cell-to-coolant conductance (W/K) — h ~ flow^0.8 (turbulent convection scaling). */
export const coolingConductance = (m: CoolMode, flow: number) =>
  COOL[m].hMax * (0.12 + 0.88 * Math.pow(clamp(flow, 0, 100) / 100, 0.8));
/** Pump/fan power ~ flow^3 (affinity laws). */
export const pumpPower = (m: CoolMode, flow: number) => (flow <= 0 ? 0 : COOL[m].pump * Math.pow(flow / 100, 3) + 8);
/** Cell DC resistance (ohm): Arrhenius in T, grows with ageing. */
export const cellR = (Tk: number, soh: number, scale = 1) =>
  0.0012 * scale * Math.exp(2400 * (1 / Tk - 1 / 298.15)) * (1 + 1.2 * (1 - soh));
export const arrhenius = (Ea: number, Tk: number, Tref = 298.15) => Math.exp((Ea / 8.314) * (1 / Tref - 1 / Tk));
/** BMS charge acceptance derating vs cell temperature (°C). */
export function chargeDerate(T: number) {
  if (T < 10) return clamp(0.15 + 0.85 * (Math.max(T, 0) / 10), 0.15, 1);
  if (T > 45) return clamp(1 - (T - 45) / 15, 0, 1);
  return 1;
}

export interface PackParams {
  ambient: number; cRate: number; charging: boolean; soh: number; mode: CoolMode; flow: number;
  coolant: number; gLat: number; defectCell: number; defect: number; coolingFail: boolean;
}
export interface PackResult { T: number[]; Q: number[]; Tc: number[]; hc: number; heat: number; pump: number }

/** Steady-state 2-D cell grid: Gauss-Seidel on node energy balances with coolant-lane warming. */
export function solvePack(p: PackParams): PackResult {
  const amps = p.cRate * CELL_AH;
  const hc = p.coolingFail ? PASSIVE_H : coolingConductance(p.mode, p.flow);
  const lane = Math.max(1, COOL[p.mode].lane * Math.max(p.flow / 100, 0.05) * (p.coolingFail ? 0.05 : 1));
  const T = new Array(N).fill(p.ambient), Q = new Array(N).fill(0), Tc = new Array(N).fill(p.coolant);
  const nb = Array.from({ length: N }, (_, i) => neighbors(i));
  for (let s = 0; s < 400; s++) {
    for (let r = 0; r < ROWS; r++) {
      let acc = 0;
      for (let c = 0; c < COLS; c++) { const i = r * COLS + c; Tc[i] = p.coolant + acc / lane; acc += hc * (T[i] - Tc[i]); }
    }
    let md = 0;
    for (let i = 0; i < N; i++) {
      const Tk = T[i] + K0;
      const q = amps * amps * cellR(Tk, p.soh, RSCALE[i]) + (p.charging ? -1 : 1) * amps * Tk * 0.5e-4 +
        (i === p.defectCell ? (p.defect / 100) * 60 : 0);
      Q[i] = Math.max(0, q);
      const ha = ambientExposure(i);
      let gs = 0, gt = 0;
      for (const j of nb[i]) { gs += p.gLat; gt += p.gLat * T[j]; }
      const Tn = (Q[i] + gt + hc * Tc[i] + ha * p.ambient) / (gs + hc + ha);
      md = Math.max(md, Math.abs(Tn - T[i]));
      T[i] += 0.9 * (Tn - T[i]);
    }
    if (md < 1e-4) break;
  }
  return { T, Q, Tc, hc, heat: Q.reduce((a, b) => a + b, 0), pump: p.coolingFail ? 0 : pumpPower(p.mode, p.flow) };
}
