import { CELL_AH, K0, arrhenius } from './core';
/** Wang-type Ah-throughput SEI law: Qloss% = B·exp((−31700+370.3·C)/(R·T))·Ah^0.55. */
export function cycleLossPct(cycles: number, tempC: number, cRate: number, dod: number) {
  const Ah = cycles * dod * CELL_AH, Tk = tempC + K0, C = Math.min(cRate, 4);
  const cold = 1 + Math.max(0, 15 - tempC) * 0.03 * Math.max(1, C); // lithium-plating penalty when cold
  return 6000 * Math.exp((-31700 + 370.3 * C) / (8.314 * Tk)) * Math.pow(Ah, 0.55) * cold;
}
/** Calendar ageing ~ sqrt(time), Arrhenius in T, stronger at high SOC. */
export function calendarLossPct(years: number, tempC: number, socAvg: number) {
  return 2.2 * Math.sqrt(Math.max(years, 0)) * arrhenius(35000, tempC + K0) * (0.6 + 0.8 * socAvg / 100);
}
export interface DegIn { tempC: number; cRate: number; dod: number; socAvg: number; cyclesPerDay: number }
export function totalLoss(cycles: number, d: DegIn) {
  const cyc = cycleLossPct(cycles, d.tempC, d.cRate, d.dod);
  const cal = calendarLossPct(cycles / Math.max(d.cyclesPerDay, 0.05) / 365, d.tempC, d.socAvg);
  return { cyc, cal, total: Math.min(70, cyc + cal) };
}
export function cyclesToEol(d: DegIn, eol = 20) {
  let lo = 0, hi = 30000;
  if (totalLoss(hi, d).total < eol) return hi;
  for (let n = 0; n < 30; n++) { const m = (lo + hi) / 2; if (totalLoss(m, d).total < eol) lo = m; else hi = m; }
  return hi;
}
