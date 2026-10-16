import { create } from 'zustand';
import type { CoolMode } from './physics/core';
import type { Comp } from './physics/materials';

export type PageId = 'overview' | 'battery3d' | 'runaway' | 'distribution' | 'charging' | 'extreme' | 'degradation' | 'hotspot' | 'propagation' | 'cooling' | 'materials' | 'quantum';
export interface Inputs {
  ambient: number; loadC: number; chargeC: number; activity: 'drive' | 'charge' | 'rest';
  soc: number; flow: number; mode: CoolMode; coolant: number; coolingFail: boolean;
  cycles: number; cyclesPerDay: number; defect: number; defectCell: number; selected: number;
  composite: Comp; barrier: number; warn: number; crit: number; grad: number;
}
export const DEFAULTS: Inputs = {
  ambient: 25, loadC: 2, chargeC: 2, activity: 'drive', soc: 70, flow: 40, mode: 'liquid', coolant: 25, coolingFail: false,
  cycles: 150, cyclesPerDay: 1, defect: 0, defectCell: 9, selected: 9,
  composite: { graphite: 20, pcm: 10, thick: 2 }, barrier: 0, warn: 45, crit: 60, grad: 6,
};
export const PRESETS: { id: string; label: string; patch: Partial<Inputs>; note: string }[] = [
  { id: 'urban', label: 'Urban commute', note: 'Mild ambient, moderate load', patch: { ambient: 22, loadC: 1, chargeC: 1, activity: 'drive', flow: 35, defect: 0, coolingFail: false, mode: 'liquid', coolant: 22 } },
  { id: 'highway', label: 'Highway sprint', note: 'Sustained 3C discharge', patch: { ambient: 32, loadC: 3, activity: 'drive', flow: 50, defect: 0, coolingFail: false, mode: 'liquid', coolant: 25 } },
  { id: 'fast', label: 'Fast charge · heatwave', note: '3.5C DC charge at 42 °C', patch: { ambient: 42, chargeC: 3.5, activity: 'charge', flow: 70, defect: 0, coolingFail: false, mode: 'liquid', coolant: 30 } },
  { id: 'arctic', label: 'Arctic start', note: '−25 °C ambient, low flow', patch: { ambient: -25, loadC: 1, activity: 'drive', flow: 20, coolant: 0, defect: 0, coolingFail: false, mode: 'liquid' } },
  { id: 'fault', label: 'Cooling loss + cell short', note: 'Internal short, pump failed', patch: { ambient: 35, loadC: 1.5, activity: 'drive', defect: 55, coolingFail: true, soc: 95 } },
  { id: 'aged', label: 'Aged pack (1800 cycles)', note: 'Higher resistance, more heat', patch: { cycles: 1800, loadC: 2, ambient: 30, defect: 0, coolingFail: false } },
];
interface Store extends Inputs { page: PageId; preset: string; set: (p: Partial<Inputs>) => void; go: (p: PageId) => void; reset: () => void; applyPreset: (id: string) => void }
export const useStore = create<Store>((set) => ({
  ...DEFAULTS, page: 'overview', preset: 'default',
  set: (p) => set({ ...p, preset: 'custom' }),
  go: (page) => set({ page }),
  reset: () => set({ ...DEFAULTS, preset: 'default' }),
  applyPreset: (id) => set((s) => { const pr = PRESETS.find(x => x.id === id); return pr ? { ...DEFAULTS, ...pr.patch, composite: s.composite, page: s.page, preset: id } : s; }),
}));
