import { useMemo } from 'react';
import { useStore, Inputs } from './store';
import { solvePack, PackParams, PackResult, K0, N, ambientExposure } from './physics/core';
import { compositeProps } from './physics/materials';
import { totalLoss } from './physics/degradation';
import { RunawayInput, simulateRunaway, riskScore } from './physics/runaway';

export const cRateOf = (s: Inputs) => (s.activity === 'charge' ? s.chargeC : s.activity === 'drive' ? s.loadC : 0.02);
export function paramsOf(s: Inputs, soh: number): PackParams {
  return {
    ambient: s.ambient, cRate: cRateOf(s), charging: s.activity === 'charge', soh, mode: s.mode, flow: s.flow, coolant: s.coolant,
    gLat: compositeProps(s.composite).gLat, defectCell: s.defectCell, defect: s.defect, coolingFail: s.coolingFail,
  };
}
export interface Derived {
  grid: PackResult; params: PackParams; soh: number; fadePct: number; avgT: number; maxT: number; minT: number; dT: number;
  hot: number; cold: number; cRate: number; heat: number; pump: number; hc: number; opTemp: number;
}
export function derive(s: Inputs): Derived {
  const g1 = solvePack(paramsOf(s, 1));
  const avg1 = g1.T.reduce((a, b) => a + b, 0) / N;
  const fade = totalLoss(s.cycles, { tempC: avg1, cRate: (s.loadC + s.chargeC) / 2, dod: 0.8, socAvg: 55, cyclesPerDay: s.cyclesPerDay }).total;
  const soh = 1 - fade / 100;
  const params = paramsOf(s, soh), grid = solvePack(params);
  const avgT = grid.T.reduce((a, b) => a + b, 0) / N, maxT = Math.max(...grid.T), minT = Math.min(...grid.T);
  return { grid, params, soh, fadePct: fade, avgT, maxT, minT, dT: maxT - minT, hot: grid.T.indexOf(maxT), cold: grid.T.indexOf(minT), cRate: params.cRate, heat: grid.heat, pump: grid.pump, hc: grid.hc, opTemp: avg1 };
}
export function usePack(): Derived {
  const s = useStore();
  return useMemo(() => derive(s), [s.ambient, s.loadC, s.chargeC, s.activity, s.flow, s.mode, s.coolant, s.coolingFail, s.cycles, s.cyclesPerDay, s.defect, s.defectCell, s.composite]); // eslint-disable-line
}
/** Runaway-model input for the fault cell: starts at healthy steady state, adds short + external heat. */
export function runawayInput(s: Inputs, P: Derived, extW = 0): RunawayInput {
  const healthy = solvePack({ ...P.params, defect: 0 });
  const i = s.defectCell;
  return {
    T0: healthy.T[i], ambient: s.ambient, coolant: healthy.Tc[i], hc: P.hc, ha: ambientExposure(i), soc: s.soc,
    shortW: (s.defect / 100) * 60, extW,
  };
}
export function quickRisk(s: Inputs, P: Derived, extW = 0) {
  const res = simulateRunaway(runawayInput(s, P, extW));
  return { res, risk: riskScore(res) };
}
export const toK = (c: number) => c + K0;
