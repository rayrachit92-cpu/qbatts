import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Btn, Card, Insights, Metric, PageHead, Seg, Slider, Toggle, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { simulateCharge, sweepRates, MODULE_ENERGY_KWH } from '../physics/charging';

export default function Charging() {
  const s = useStore(), P = usePack();
  const [protocol, setProtocol] = useState<'cccv' | 'stepped'>('cccv'), [derating, setDerating] = useState(true), [soc0, setSoc0] = useState(10);
  const base = useMemo(() => ({ T0: Math.max(s.ambient, s.coolant) * 0.5 + Math.min(s.ambient, s.coolant) * 0.5, ambient: s.ambient, coolant: s.coolant, hc: P.hc, soh: P.soh, soc0, protocol, derating }), [s.ambient, s.coolant, P.hc, P.soh, soc0, protocol, derating]);
  const r = useMemo(() => simulateCharge({ ...base, cRate: s.chargeC }), [base, s.chargeC]);
  const sw = useMemo(() => sweepRates(base), [base]);
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (r.Tpeak > 45) ins.push({ tone: r.Tpeak > 55 ? 'bad' : 'warn', text: `Peak cell temperature ${fmt(r.Tpeak)} °C exceeds the 45 °C comfort limit; BMS derates for ${fmt(r.derated * 100, 0)} % of the session.` });
  if (r.plateRisk > 0.3) ins.push({ tone: r.plateRisk > 0.6 ? 'bad' : 'warn', text: `Lithium-plating risk ${fmt(r.plateRisk * 100, 0)} % (cold + high rate + high SOC). Pre-heat the pack or lower the rate.` });
  ins.push({ tone: sw.limited ? 'bad' : 'info', text: sw.limited ? 'No tested rate satisfies both the 45 °C and plating limits — improve cooling or warm the pack first.' : `Fastest rate within 45 °C and plating ≤ 30 %: ${fmt(sw.best.c, 2)} C (80 % in ${fmt(sw.best.t80)} min).` });
  if (s.chargeC > sw.best.c + 0.3 && !sw.limited) ins.push({ tone: 'warn', text: `Current ${fmt(s.chargeC, 1)} C is above the thermally safe optimum; selecting ${fmt(sw.best.c, 2)} C costs ${fmt(Math.max(0, sw.best.t80 - r.t80), 1)} more minutes to 80 %.` });
  if (derating === false && r.Tpeak > 60) ins.push({ tone: 'bad', text: 'BMS derating is OFF: cells exceed 60 °C — unsafe.' });
  return (
    <>
      <PageHead kicker="Charging thermal behaviour" title="Fast Charging" desc="CC-CV or stepped charging integrated in time with I²R(T) heating, coolant removal and temperature derating. The charging-rate, cooling and ambient controls are shared with the rest of the dashboard."
        meta={[['Protocol', protocol === 'cccv' ? 'CC-CV' : 'Stepped taper'], ['Module energy', `${fmt(MODULE_ENERGY_KWH, 2)} kWh`], ['Cell coupling h', `${fmt(P.hc, 2)} W/K`]]} />
      <div className="grid g5">
        <Metric label="Time to 80 %" value={fmt(r.t80)} unit="min" tone="info" /><Metric label="Total time" value={fmt(r.tEnd)} unit="min" tone="info" />
        <Metric label="Peak temperature" value={fmt(r.Tpeak)} unit="°C" tone={tone(r.Tpeak, 45, 55)} /><Metric label="Plating risk" value={fmt(r.plateRisk * 100, 0)} unit="%" tone={tone(r.plateRisk * 100, 30, 60)} />
        <Metric label="Heat released" value={fmt(r.heatKWh, 2)} unit="kWh" tone="info" sub={`${fmt((r.heatKWh / (MODULE_ENERGY_KWH * (100 - soc0) / 100)) * 100, 1)} % of energy`} />
      </div>
      <div className="grid g13">
        <Card title="Charging controls">
          <Controls keys={['chargeC', 'ambient', 'flow', 'mode', 'coolant']} reset={false} />
          <Slider label="Starting SOC" value={soc0} min={0} max={70} unit=" %" onChange={setSoc0} />
          <div className="hint">Protocol</div><Seg options={[{ id: 'cccv', label: 'CC-CV' }, { id: 'stepped', label: 'Stepped' }]} value={protocol} onChange={setProtocol} />
          <Toggle label="BMS temperature derating" checked={derating} onChange={setDerating} />
          <Btn pri onClick={() => s.set({ activity: 'charge' })}>Show charging in pack models</Btn>
          <button className="btn reset" onClick={() => { s.set({ chargeC: 2, ambient: 25, flow: 40, mode: 'liquid', coolant: 25 }); setSoc0(10); setProtocol('cccv'); setDerating(true); }}>RESET CHARGING DEFAULTS</button>
        </Card>
        <div>
          <Card title="Thermal and SOC curves">
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={r.pts}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} tickFormatter={(v: number) => v.toFixed(0)} unit=" min" /><YAxis yAxisId="T" {...AX} domain={['auto', 'auto']} unit="°" /><YAxis yAxisId="S" orientation="right" {...AX} domain={[0, 100]} unit="%" /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1)} labelFormatter={(v: any) => `${Number(v).toFixed(1)} min`} /><Legend />
                <ReferenceLine yAxisId="T" y={45} stroke="#ffb43a" strokeDasharray="4 3" />
                <Area yAxisId="S" dataKey="soc" name="SOC %" stroke="#3ddc97" fill="rgba(61,220,151,.12)" isAnimationActive={false} />
                <Line yAxisId="T" dataKey="T" name="Cell °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /></ComposedChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Current and plating risk">
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={r.pts.map(p => ({ ...p, plate: +(p.plate * 100).toFixed(1) }))}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} tickFormatter={(v: number) => v.toFixed(0)} /><YAxis yAxisId="c" {...AX} unit="C" /><YAxis yAxisId="p" orientation="right" {...AX} unit="%" domain={[0, 100]} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(2)} /><Legend />
                <Line yAxisId="c" dataKey="c" name="C-rate" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line yAxisId="p" dataKey="plate" name="Plating risk %" stroke="#a78bfa" dot={false} isAnimationActive={false} /></ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Rate sweep" sub="Time to 80 % and peak temperature for every charging rate under the current cooling & ambient">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={sw.rows}><CartesianGrid stroke={GRID} /><XAxis dataKey="c" {...AX} unit="C" /><YAxis yAxisId="t" {...AX} unit=" min" /><YAxis yAxisId="T" orientation="right" {...AX} domain={['auto', 'auto']} unit="°" /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1)} /><Legend />
              <ReferenceLine yAxisId="t" x={s.chargeC} stroke="#fff" strokeDasharray="3 3" />
              <Line yAxisId="t" dataKey="t80" name="Time to 80 %" stroke="#35d6ff" isAnimationActive={false} /><Line yAxisId="T" dataKey="Tpeak" name="Peak °C" stroke="#ff8a3a" isAnimationActive={false} />
              {!sw.limited && <ReferenceDot yAxisId="t" x={sw.best.c} y={sw.best.t80} r={6} fill="#3ddc97" stroke="#fff" />}</ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Recommendations"><Insights items={ins} /></Card>
      </div>
    </>
  );
}
