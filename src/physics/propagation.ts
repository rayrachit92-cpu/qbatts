import { CELL_CTH, N, neighbors, smooth, reactionEnergyRef } from './propagation_deps';
export interface PropInput {
  trigger: number; ambient: number; coolant: number; hc: number; gLat: number; barrier: number;
  latentJ: number; soc: number; duration?: number; T0?: number; Ttrip?: number;
}
export interface PropFrame { t: number; T: number[]; st: number[] }
export interface PropResult {
  frames: PropFrame[]; trip: number[]; g: number; tFirst: number; tLast: number; count: number; counts: { t: number; n: number }[];
}
/** Series conductance of lateral composite path and aerogel barrier (k=0.02 W/mK, A=1.5e-3 m²). */
export function gEff(gLat: number, barrierMm: number) {
  const Rins = barrierMm > 0 ? (barrierMm * 1e-3) / (0.02 * 0.0015) : 0;
  return 1 / (1 / Math.max(gLat, 1e-3) + Rins);
}
const MULT = 3; // hot-gas / radiation enhancement when a neighbour is venting
export function simulatePropagation(i: PropInput): PropResult {
  const nb = Array.from({ length: N }, (_, k) => neighbors(k));
  const g = gEff(i.gLat, i.barrier), dur = i.duration ?? 600, Ttrip = i.Ttrip ?? 100, burnT = 30;
  const Eb = reactionEnergyRef(i.soc);
  const T = new Array(N).fill(i.T0 ?? i.ambient + 8), st = new Array(N).fill(0), burn = new Array(N).fill(0);
  const trip = new Array(N).fill(NaN);
  st[i.trigger] = 1; burn[i.trigger] = burnT; trip[i.trigger] = 0;
  const gmax = g * (1 + MULT) * 4, dt = 0.5, sub = Math.max(1, Math.ceil((dt * gmax) / (0.4 * CELL_CTH))), h = dt / sub;
  const sigma = 6, bumpK = i.latentJ / (sigma * Math.sqrt(2 * Math.PI));
  const frames: PropFrame[] = [], counts: { t: number; n: number }[] = [];
  let t = 0, nextF = 0;
  while (t <= dur + 1e-9) {
    if (t >= nextF - 1e-9) {
      frames.push({ t, T: [...T], st: [...st] });
      counts.push({ t, n: st.filter(s => s > 0).length }); nextF += 2;
    }
    for (let s = 0; s < sub; s++) {
      const q = new Array(N).fill(0);
      for (let k = 0; k < N; k++) {
        q[k] -= i.hc * (T[k] - i.coolant) + 0.1 * (T[k] - i.ambient);
        if (st[k] === 1) {
          // 50 % stays in the venting cell; 50 % reaches neighbours as hot gas / ejecta (attenuated by the barrier)
          q[k] += (0.5 * Eb) / burnT;
          const att = Math.exp(-0.9 * i.barrier);
          for (const j of nb[k]) q[j] += (0.5 * Eb * att) / burnT / nb[k].length;
        }
      }
      for (let a = 0; a < N; a++) for (const b of nb[a]) if (b > a) {
        const mult = 1 + MULT * smooth((Math.max(T[a], T[b]) - 200) / 200);
        const f = g * mult * (T[a] - T[b]); q[a] -= f; q[b] += f;
      }
      for (let k = 0; k < N; k++) {
        const z = (T[k] - 50) / sigma, cap = CELL_CTH + bumpK * Math.exp(-0.5 * z * z);
        T[k] = Math.min(900, T[k] + (q[k] * h) / cap);
      }
      for (let k = 0; k < N; k++) {
        if (st[k] === 1) { burn[k] -= h; if (burn[k] <= 0) st[k] = 2; }
        else if (st[k] === 0 && T[k] > Ttrip) { st[k] = 1; burn[k] = burnT; trip[k] = t + (s + 1) * h; }
      }
    }
    t += dt;
  }
  const nbT = nb[i.trigger].map(j => trip[j]).filter(x => !isNaN(x));
  const all = trip.filter(x => !isNaN(x));
  return {
    frames, trip, g, count: all.length, counts,
    tFirst: nbT.length ? Math.min(...nbT) : NaN, tLast: all.length > 1 ? Math.max(...all) : NaN,
  };
}
