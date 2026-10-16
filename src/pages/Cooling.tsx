import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Btn, Card, Insights, Metric, PageHead, Slider, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { COOL, CoolMode } from '../physics/core';
import { evalCooling, sweepFlow, Weights } from '../physics/cooling';

export default function Cooling() {
  const s = useStore(), P = usePack();
  const [w, setW] = useState<Weights>({ thermal: 60, uniform: 40, energy: 50 });
  const base = useMemo(() => ({ ...P.params, coolingFail: false }), [P.params]);
  const cur = useMemo(() => evalCooling(base, s.mode, s.flow, w), [base, s.mode, s.flow, w]);
  const sw = useMemo(() => sweepFlow(base, s.mode, w), [base, s.mode, w]);
  const modes = useMemo(() => (Object.keys(COOL) as CoolMode[]).map(m => { const sp = sweepFlow(base, m, w); return { ...sp.best, mode: m, name: COOL[m].label }; }), [base, w, s.flow]);
  const bestMode = modes.reduce((a, b) => (b.J < a.J ? b : a));
  const saved = cur.pump - sw.best.pump;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (s.coolingFail) ins.push({ tone: 'bad', text: 'Cooling failure is active in shared state — the pack page shows passive behaviour; this page evaluates the architecture as if working.' });
  ins.push({ tone: 'info', text: `Optimum for ${COOL[s.mode].label}: ${fmt(sw.best.flow, 0)} % flow → hottest cell ${fmt(sw.best.Tmax)} °C, ΔT ${fmt(sw.best.dT)} K, ${fmt(sw.best.pump, 0)} W.` });
  if (Math.abs(s.flow - sw.best.flow) > 8) ins.push({ tone: 'warn', text: s.flow > sw.best.flow ? `Flow is ${fmt(s.flow - sw.best.flow, 0)} points above optimum: saves ${fmt(Math.max(0, saved), 0)} W of pump power for ${fmt(sw.best.Tmax - cur.Tmax, 1)} K change in peak temperature.` : `Flow is below optimum — hottest cell is ${fmt(cur.Tmax - sw.best.Tmax, 1)} K hotter than necessary.` });
  if (bestMode.mode !== s.mode) ins.push({ tone: 'info', text: `${COOL[bestMode.mode].label} gives the lowest weighted objective for this load (${fmt(bestMode.J, 2)} vs ${fmt(sw.best.J, 2)}).` });
  if (cur.Tmax > s.warn) ins.push({ tone: 'bad', text: `Hottest cell ${fmt(cur.Tmax)} °C exceeds the ${s.warn} °C warning limit.` });
  return (
    <>
      <PageHead kicker="Thermal management" title="Cooling Optimization" desc="Compare air, liquid and immersion cooling. Hydraulic power grows with flow³ while heat-transfer conductance grows only with flow^0.8, so an optimum exists. Tune the objective weights to see it move, then apply it to the shared pack state."
        meta={[['Objective', 'w₁(T_max−32)² + w₂ΔT² + w₃·P_pump'], ['Heat load', `${fmt(P.heat, 0)} W`], ['Architecture', COOL[s.mode].label]]} />
      <div className="grid g5">
        <Metric label="Hottest cell" value={fmt(cur.Tmax)} unit="°C" tone={tone(cur.Tmax, s.warn - 8, s.warn)} /><Metric label="Spread ΔT" value={fmt(cur.dT)} unit="K" tone={tone(cur.dT, 4, 8)} />
        <Metric label="Pump power" value={fmt(cur.pump, 0)} unit="W" tone="info" /><Metric label="Efficiency" value={fmt(cur.cop, 1)} unit="W/W" tone="info" sub="heat removed / pump power" />
        <Metric label="Ageing penalty" value={fmt(cur.ageX, 2)} unit="×" tone={cur.ageX > 1.8 ? 'bad' : cur.ageX > 1.3 ? 'warn' : 'ok'} sub="vs 25 °C" />
      </div>
      <div className="grid g13">
        <Card title="Cooling controls">
          <Controls keys={['mode', 'flow', 'coolant', 'ambient', 'loadC']} reset={false} />
          <div className="hint" style={{ margin: '6px 0' }}>Objective weights</div>
          <Slider label="Thermal (peak T)" value={w.thermal} min={0} max={100} unit=" %" onChange={v => setW({ ...w, thermal: v })} />
          <Slider label="Uniformity (ΔT)" value={w.uniform} min={0} max={100} unit=" %" onChange={v => setW({ ...w, uniform: v })} />
          <Slider label="Energy (pump power)" value={w.energy} min={0} max={100} unit=" %" onChange={v => setW({ ...w, energy: v })} />
          <Btn pri onClick={() => s.set({ flow: sw.best.flow })}>Apply optimum flow ({fmt(sw.best.flow, 0)} %)</Btn>
          <Btn onClick={() => s.set({ mode: bestMode.mode, flow: bestMode.flow })}>Apply best architecture</Btn>
          <button className="btn reset" onClick={() => { s.set({ mode: 'liquid', flow: 40, coolant: 25, ambient: 25, loadC: 2 }); setW({ thermal: 60, uniform: 40, energy: 50 }); }}>RESET COOLING DEFAULTS</button>
        </Card>
        <div>
          <Card title="Flow sweep" sub={`${COOL[s.mode].label}: temperature and pump power vs flow. Green dot = optimum; dashed = current flow`}>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={sw.rows}><CartesianGrid stroke={GRID} /><XAxis dataKey="flow" {...AX} unit="%" /><YAxis yAxisId="T" {...AX} domain={['auto', 'auto']} unit="°" /><YAxis yAxisId="P" orientation="right" {...AX} unit=" W" /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1)} /><Legend />
                <ReferenceLine yAxisId="T" x={s.flow} stroke="#fff" strokeDasharray="3 3" />
                <Line yAxisId="T" dataKey="Tmax" name="Hottest °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /><Line yAxisId="T" dataKey="dT" name="ΔT K" stroke="#a78bfa" dot={false} isAnimationActive={false} /><Line yAxisId="P" dataKey="pump" name="Pump W" stroke="#35d6ff" dot={false} isAnimationActive={false} />
                <ReferenceDot yAxisId="T" x={sw.best.flow} y={sw.best.Tmax} r={6} fill="#3ddc97" stroke="#fff" /></ComposedChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid g2" style={{ marginTop: 12, marginBottom: 0 }}>
            <Card title="Architecture comparison" sub="Each at its own optimal flow"><ResponsiveContainer width="100%" height={190}><BarChart data={modes}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...AX} /><YAxis {...AX} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(2)} /><Legend /><Bar dataKey="Tmax" name="Hottest °C" fill="#ff8a3a" /><Bar dataKey="pump" name="Pump W" fill="#35d6ff" /><Bar dataKey="J" name="Objective J" fill="#3ddc97" /></BarChart></ResponsiveContainer></Card>
            <Card title="Recommendations"><Insights items={ins} /></Card>
          </div>
        </div>
      </div>
      <Card title="Energy-efficiency table" sub="At optimum flow per architecture">
        <table><thead><tr><th>Architecture</th><th>Flow %</th><th>Hottest °C</th><th>ΔT K</th><th>Pump W</th><th>Heat removed W</th><th>Efficiency W/W</th><th>Objective</th></tr></thead>
          <tbody>{modes.map(m => <tr key={m.mode} className={m.mode === s.mode ? 'hl' : ''}><td>{m.name}{m.mode === bestMode.mode ? ' ★' : ''}</td><td>{fmt(m.flow, 0)}</td><td>{fmt(m.Tmax)}</td><td>{fmt(m.dT)}</td><td>{fmt(m.pump, 0)}</td><td>{fmt(m.removed, 0)}</td><td>{fmt(m.cop, 1)}</td><td>{fmt(m.J, 2)}</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}
