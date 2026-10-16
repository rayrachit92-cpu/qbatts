import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../store';
import { derive, quickRisk } from '../derive';
import { solvePack } from '../physics/core';
import { simulateCharge } from '../physics/charging';
import { cycleLossPct, totalLoss } from '../physics/degradation';
import { simulatePropagation } from '../physics/propagation';
import { compositeProps } from '../physics/materials';
import { eig2, circuitProbs } from '../physics/quantum';
import { simulateRunaway, criticalHc } from '../physics/runaway';

describe('thermal physics', () => {
  it('more load → hotter; more cooling → cooler', () => {
    const a = derive({ ...DEFAULTS, loadC: 1 }), b = derive({ ...DEFAULTS, loadC: 3 }), c = derive({ ...DEFAULTS, loadC: 3, flow: 90 });
    expect(b.maxT).toBeGreaterThan(a.maxT); expect(c.maxT).toBeLessThan(b.maxT);
  });
  it('energy balance closes at steady state', () => {
    const P = derive(DEFAULTS), removed = P.grid.T.reduce((x, t, i) => x + P.hc * (t - P.grid.Tc[i]), 0);
    expect(removed).toBeLessThan(P.heat); expect(removed).toBeGreaterThan(0.6 * P.heat); // remainder leaves via ambient exposure
  });
  it('defect heats its own cell most', () => { const P = derive({ ...DEFAULTS, defect: 60 }); expect(P.hot).toBe(DEFAULTS.defectCell); });
  it('ageing: hotter and faster is worse; monotonic in cycles', () => {
    expect(cycleLossPct(1000, 45, 1, 0.8)).toBeGreaterThan(cycleLossPct(1000, 25, 1, 0.8));
    const d = { tempC: 30, cRate: 1, dod: 0.8, socAvg: 55, cyclesPerDay: 1 };
    expect(totalLoss(2000, d).total).toBeGreaterThan(totalLoss(500, d).total);
  });
  it('charging: higher C is faster but hotter', () => {
    const base = { T0: 25, ambient: 25, coolant: 25, hc: 1.6, soh: 1, soc0: 10, protocol: 'cccv' as const, derating: true };
    const a = simulateCharge({ ...base, cRate: 1 }), b = simulateCharge({ ...base, cRate: 3 });
    expect(b.t80).toBeLessThan(a.t80); expect(b.Tpeak).toBeGreaterThan(a.Tpeak);
  });
  it('runaway only with fault + weak cooling; critical conductance is consistent', () => {
    expect(quickRisk(DEFAULTS, derive(DEFAULTS)).res.runaway).toBe(false);
    const s = { ...DEFAULTS, defect: 55, coolingFail: true, soc: 95 }, P = derive(s);
    expect(quickRisk(s, P).res.runaway).toBe(true);
    const good = derive({ ...s, coolingFail: false, flow: 80 }); expect(quickRisk({ ...s, coolingFail: false, flow: 80 }, good).res.runaway).toBe(false);
    const inp = { T0: 40, ambient: 25, coolant: 25, hc: 0.12, ha: 0.1, soc: 95, shortW: 33, extW: 0 };
    const hc = criticalHc(inp); expect(hc).toBeGreaterThan(0.12);
    expect(simulateRunaway({ ...inp, hc: hc * 1.1, baseW: 0.12 * 15 + 0.1 * 15 }).runaway).toBe(false);
  });
  it('propagation: barrier contains, SOC matters', () => {
    const cp = compositeProps(DEFAULTS.composite), b = { trigger: 9, ambient: 25, coolant: 25, hc: 1.6, gLat: cp.gLat, latentJ: cp.latentJ, soc: 70 };
    expect(simulatePropagation({ ...b, barrier: 0 }).count).toBeGreaterThan(5);
    expect(simulatePropagation({ ...b, barrier: 1 }).count).toBe(1);
    expect(simulatePropagation({ ...b, barrier: 0, soc: 30 }).count).toBe(1);
  });
  it('materials: graphite raises conductivity', () => { expect(compositeProps({ graphite: 30, pcm: 10, thick: 2 }).k).toBeGreaterThan(compositeProps({ graphite: 5, pcm: 10, thick: 2 }).k); });
  it('quantum: eigen decomposition & circuit normalisation', () => {
    const e = eig2(4, 1, 2); expect(e.l1 + e.l2).toBeCloseTo(6); expect(e.l1 * e.l2).toBeCloseTo(7);
    expect(circuitProbs([[0.3, 1.2, 2, 0.7], [1, 2, 0.4, 3]]).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('solvePack is finite for extremes', () => {
    for (const ambient of [-40, 60]) for (const cRate of [0, 4]) expect(solvePack({ ...derive(DEFAULTS).params, ambient, cRate }).T.every(Number.isFinite)).toBe(true);
  });
});
