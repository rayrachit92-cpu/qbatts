import { useStore, DEFAULTS, Inputs } from '../store';
import { COOL, CoolMode, COLS, ROWS, N } from '../physics/core';
import { Slider, Toggle, Seg, Btn } from './ui';

export type CtlKey = 'ambient' | 'loadC' | 'chargeC' | 'activity' | 'flow' | 'mode' | 'coolant' | 'coolingFail' | 'soc' | 'defect' | 'defectCell' | 'cycles' | 'cyclesPerDay' | 'barrier';
/** Shared-state control block: every page renders the subset it needs; all edits propagate app-wide. */
export function Controls({ keys, reset = true }: { keys: CtlKey[]; reset?: boolean }) {
  const s = useStore();
  const set = s.set;
  const el: Record<CtlKey, JSX.Element> = {
    ambient: <Slider key="a" label="Ambient temperature" value={s.ambient} min={-40} max={60} unit=" °C" onChange={v => set({ ambient: v })} hint="Boundary temperature for every thermal model in the app." />,
    loadC: <Slider key="l" label="Discharge load" value={s.loadC} min={0} max={4} step={0.1} digits={1} unit=" C" onChange={v => set({ loadC: v })} hint="Joule heat ∝ I²R(T). 1C = 50 A per cell." />,
    chargeC: <Slider key="c" label="Charging rate" value={s.chargeC} min={0.2} max={4} step={0.1} digits={1} unit=" C" onChange={v => set({ chargeC: v })} hint="Used when activity = Charge." />,
    activity: <div key="ac"><div className="hint" style={{ marginBottom: 2 }}>Pack activity</div><Seg options={[{ id: 'drive', label: 'Drive' }, { id: 'charge', label: 'Charge' }, { id: 'rest', label: 'Rest' }]} value={s.activity} onChange={v => set({ activity: v })} /></div>,
    flow: <Slider key="f" label="Coolant / air flow" value={s.flow} min={0} max={100} unit=" %" onChange={v => set({ flow: v })} hint="Conductance ∝ flow^0.8, pump power ∝ flow³." />,
    mode: <div key="m"><div className="hint" style={{ marginBottom: 2 }}>Cooling architecture</div><Seg<CoolMode> options={(Object.keys(COOL) as CoolMode[]).map(k => ({ id: k, label: k === 'air' ? 'Air' : k === 'liquid' ? 'Liquid' : 'Immersion' }))} value={s.mode} onChange={v => set({ mode: v })} /></div>,
    coolant: <Slider key="cl" label="Coolant inlet temperature" value={s.coolant} min={-10} max={50} unit=" °C" onChange={v => set({ coolant: v })} hint="Chiller / heater set-point at the pack inlet." />,
    coolingFail: <Toggle key="cf" label="Cooling failure (passive only)" checked={s.coolingFail} onChange={v => set({ coolingFail: v })} />,
    soc: <Slider key="s" label="State of charge" value={s.soc} min={0} max={100} unit=" %" onChange={v => set({ soc: v })} hint="Stored energy sets the thermal-runaway energy budget." />,
    defect: <Slider key="d" label="Internal-short severity" value={s.defect} min={0} max={100} unit=" %" onChange={v => set({ defect: v })} hint="0–100 % → 0–60 W of parasitic heat in the fault cell." />,
    defectCell: <Slider key="dc" label="Fault cell index" value={s.defectCell + 1} min={1} max={N} onChange={v => set({ defectCell: Math.min(N - 1, Math.max(0, Math.round(v) - 1)) })} hint={`Row ${Math.floor(s.defectCell / COLS) + 1} / col ${(s.defectCell % COLS) + 1} of ${ROWS}×${COLS}`} />,
    cycles: <Slider key="cy" label="Pack age" value={s.cycles} min={0} max={3000} step={10} unit=" cycles" onChange={v => set({ cycles: v })} hint="Raises resistance (more heat) and lowers SOH." />,
    cyclesPerDay: <Slider key="cd" label="Usage intensity" value={s.cyclesPerDay} min={0.2} max={3} step={0.1} digits={1} unit=" cyc/day" onChange={v => set({ cyclesPerDay: v })} hint="Sets calendar time per cycle." />,
    barrier: <Slider key="b" label="Aerogel barrier thickness" value={s.barrier} min={0} max={3} step={0.1} digits={1} unit=" mm" onChange={v => set({ barrier: v })} hint="Series thermal resistance + vent-gas shield between cells." />,
  };
  const only = keys.filter(k => k !== 'defect' || true);
  return <>{only.map(k => el[k])}{reset && <Btn reset onClick={() => { const patch: Partial<Inputs> = {}; keys.forEach(k => { (patch as any)[k] = DEFAULTS[k as keyof Inputs]; }); set(patch); }}>Reset these to defaults</Btn>}</>;
}
