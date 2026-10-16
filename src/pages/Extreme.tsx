import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore, PRESETS } from '../store';
import { derive, usePack } from '../derive';
import { Btn, Card, Chips, Insights, Metric, PageHead, Seg, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { K0, arrhenius, cellR, chargeDerate, clamp } from '../physics/core';

export const capacityFactor = (T: number) => 0.55 + 0.45 / (1 + Math.exp(-(T + 5) / 9)) - 0.003 * Math.max(0, T - 45);
export const powerFactor = (T: number) => clamp(Math.pow(cellR(298.15, 1) / cellR(T + K0, 1), 0.8), 0.05, 1) * clamp(1 - Math.max(0, T - 50) / 25, 0, 1);
const SCEN = [
  { id: 'arctic', label: 'Arctic −30 °C', amb: -30, coolant: 0 }, { id: 'cold', label: 'Cold −10 °C', amb: -10, coolant: 10 },
  { id: 'temp', label: 'Temperate 25 °C', amb: 25, coolant: 25 }, { id: 'hot', label: 'Hot 40 °C', amb: 40, coolant: 28 },
  { id: 'desert', label: 'Desert 52 °C', amb: 52, coolant: 32 },
];
export default function Extreme() {
  const s = useStore(), P = usePack();
  const [metric, setMetric] = useState<'cap' | 'T'>('cap');
  const sweep = useMemo(() => Array.from({ length: 21 }, (_, k) => {
    const amb = -40 + k * 5, d = derive({ ...s, ambient: amb });
    return { amb, cap: capacityFactor(d.avgT) * 100, pow: powerFactor(d.avgT) * 100, avg: d.avgT, max: d.maxT, age: arrhenius(40000, d.avgT + K0), chg: chargeDerate(d.avgT) * 100 };
  }), [s.loadC, s.chargeC, s.activity, s.flow, s.mode, s.coolant, s.coolingFail, s.cycles, s.defect, s.defectCell, s.composite]); // eslint-disable-line
  const comp = useMemo(() => SCEN.map(c => { const d = derive({ ...s, ambient: c.amb, coolant: c.coolant }); return { ...c, avg: d.avgT, max: d.maxT, cap: capacityFactor(d.avgT) * 100, pow: powerFactor(d.avgT) * 100, age: arrhenius(40000, d.avgT + K0), chg: chargeDerate(d.avgT) * 100, pump: d.pump }; }),
    [s.loadC, s.chargeC, s.activity, s.flow, s.mode, s.coolingFail, s.cycles, s.defect, s.defectCell, s.composite]); // eslint-disable-line
  const cap = capacityFactor(P.avgT) * 100, pw = powerFactor(P.avgT) * 100, age = arrhenius(40000, P.avgT + K0), chg = chargeDerate(P.avgT) * 100;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (P.minT < 5) ins.push({ tone: P.minT < -10 ? 'bad' : 'warn', text: `Coldest cell ${fmt(P.minT)} °C: only ${fmt(cap, 0)} % capacity and ${fmt(pw, 0)} % power available. Enable pack pre-heating (raise coolant temperature) before driving or charging.` });
  if (P.maxT > 45) ins.push({ tone: P.maxT > 55 ? 'bad' : 'warn', text: `Hottest cell ${fmt(P.maxT)} °C: ageing runs ${fmt(age, 1)}× faster than at 25 °C; raise flow or lower coolant inlet.` });
  if (chg < 60) ins.push({ tone: 'warn', text: `Charge acceptance is derated to ${fmt(chg, 0)} % at this pack temperature.` });
  if (!ins.length) ins.push({ tone: 'ok', text: 'Pack is inside its comfort window (10–45 °C) — full capacity, power and charge acceptance.' });
  return (
    <>
      <PageHead kicker="Environmental stress" title="Extreme Temperature" desc="Pick an environment and compare capacity, power, ageing and charge acceptance. The curves sweep ambient from −40 to +60 °C using your live load, charge and cooling settings; the table compares fixed environmental scenarios side-by-side."
        meta={[['Capacity model', 'Logistic cold fade'], ['Power model', 'R(T) Arrhenius^0.8'], ['Ageing', 'Arrhenius Ea = 40 kJ/mol']]} />
      <div className="topbar"><span className="lbl">Environment</span><Chips items={SCEN.map(c => ({ id: c.id, label: c.label }))} onPick={id => { const c = SCEN.find(x => x.id === id)!; s.set({ ambient: c.amb, coolant: c.coolant }); }} />
        <span className="lbl" style={{ marginLeft: 12 }}>Full scenarios</span><Chips items={PRESETS.slice(0, 4).map(p => ({ id: p.id, label: p.label }))} active={s.preset} onPick={s.applyPreset} /></div>
      <div className="grid g5">
        <Metric label="Usable capacity" value={fmt(cap, 0)} unit="%" tone={cap < 70 ? 'bad' : cap < 90 ? 'warn' : 'ok'} /><Metric label="Peak power" value={fmt(pw, 0)} unit="%" tone={pw < 50 ? 'bad' : pw < 80 ? 'warn' : 'ok'} />
        <Metric label="Charge acceptance" value={fmt(chg, 0)} unit="%" tone={chg < 50 ? 'bad' : chg < 90 ? 'warn' : 'ok'} /><Metric label="Ageing rate" value={fmt(age, 2)} unit="×" tone={age > 2 ? 'bad' : age > 1.3 ? 'warn' : 'ok'} sub="vs 25 °C" />
        <Metric label="Hottest / coldest" value={`${fmt(P.maxT, 0)} / ${fmt(P.minT, 0)}`} unit="°C" tone={tone(P.maxT, 45, 60)} />
      </div>
      <div className="grid g13">
        <Card title="Environment controls"><Controls keys={['ambient', 'loadC', 'coolant', 'flow', 'activity']} /></Card>
        <Card title="Ambient sweep" right={<Seg options={[{ id: 'cap', label: 'Capability' }, { id: 'T', label: 'Cell temps' }]} value={metric} onChange={setMetric} />} sub="Dashed line = current ambient setting">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={sweep}><CartesianGrid stroke={GRID} /><XAxis dataKey="amb" {...AX} unit="°" /><YAxis {...AX} domain={metric === 'cap' ? [0, 105] : ['auto', 'auto']} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1)} /><Legend />
              <ReferenceLine x={Math.round(s.ambient / 5) * 5} stroke="#fff" strokeDasharray="3 3" />
              {metric === 'cap' ? <><Line dataKey="cap" name="Capacity %" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line dataKey="pow" name="Power %" stroke="#a78bfa" dot={false} isAnimationActive={false} /><Line dataKey="chg" name="Charge accept. %" stroke="#3ddc97" dot={false} isAnimationActive={false} /></>
                : <><Line dataKey="max" name="Hottest °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /><Line dataKey="avg" name="Average °C" stroke="#35d6ff" dot={false} isAnimationActive={false} /><ReferenceLine y={s.warn} stroke="#ffb43a" strokeDasharray="4 3" /><ReferenceLine y={s.crit} stroke="#ff5468" strokeDasharray="4 3" /></>}
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Scenario comparison" sub="Same load and cooling settings, different environments (click Apply to load one)">
          <table><thead><tr><th>Scenario</th><th>Avg °C</th><th>Max °C</th><th>Cap %</th><th>Power %</th><th>Age ×</th><th /></tr></thead>
            <tbody>{comp.map(c => <tr key={c.id} className={Math.abs(c.amb - s.ambient) < 3 ? 'hl' : ''}><td>{c.label}</td><td>{fmt(c.avg)}</td><td>{fmt(c.max)}</td><td>{fmt(c.cap, 0)}</td><td>{fmt(c.pow, 0)}</td><td>{fmt(c.age, 2)}</td><td><Btn onClick={() => s.set({ ambient: c.amb, coolant: c.coolant })}>Apply</Btn></td></tr>)}</tbody></table>
        </Card>
        <Card title="Recommendations"><Insights items={ins} /></Card>
      </div>
    </>
  );
}
