import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Card, Insights, Metric, PageHead, Slider, Toggle, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { cyclesToEol, totalLoss } from '../physics/degradation';

export default function Degradation() {
  const s = useStore(), P = usePack();
  const [dod, setDod] = useState(80), [useLive, setUseLive] = useState(true), [manualT, setManualT] = useState(30), [socAvg, setSocAvg] = useState(55), [maxC, setMaxC] = useState(3000), [eol, setEol] = useState(80);
  const T = useLive ? P.opTemp : manualT, cRate = (s.loadC + s.chargeC) / 2;
  const d = { tempC: T, cRate, dod: dod / 100, socAvg, cyclesPerDay: s.cyclesPerDay };
  const now = totalLoss(s.cycles, d), eolCycles = useMemo(() => cyclesToEol(d, 100 - eol), [T, cRate, dod, socAvg, s.cyclesPerDay, eol]); // eslint-disable-line
  const curves = useMemo(() => Array.from({ length: 41 }, (_, k) => {
    const n = (maxC / 40) * k, row: Record<string, number> = { n, live: 100 - totalLoss(n, d).total, cyc: totalLoss(n, d).cyc, cal: totalLoss(n, d).cal };
    for (const t of [15, 25, 35, 45]) row['t' + t] = 100 - totalLoss(n, { ...d, tempC: t }).total;
    return row;
  }), [T, cRate, dod, socAvg, s.cyclesPerDay, maxC]); // eslint-disable-line
  const years = eolCycles / Math.max(s.cyclesPerDay, 0.05) / 365;
  const cool = totalLoss(s.cycles, { ...d, tempC: Math.max(15, T - 10) }).total, hot = totalLoss(s.cycles, { ...d, tempC: T + 10 }).total;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [
    { tone: 'info', text: `Capacity loss splits into ${fmt(now.cyc, 1)} % cycling (SEI growth ∝ Ah^0.55) and ${fmt(now.cal, 1)} % calendar ageing (∝ √t).` },
    { tone: T > 35 ? 'warn' : 'ok', text: `Running 10 °C cooler (${fmt(Math.max(15, T - 10), 0)} °C) would save ${fmt(now.total - cool, 1)} % capacity today; 10 °C hotter costs ${fmt(hot - now.total, 1)} % more.` },
  ];
  if (cRate > 2) ins.push({ tone: 'warn', text: `Average ${fmt(cRate, 1)} C stress is high — halving it lowers the activation energy penalty and slows SEI growth.` });
  if (dod > 90) ins.push({ tone: 'warn', text: 'Deep cycles (>90 % DoD) increase throughput per cycle; limit to 70–80 % for longer life.' });
  if (T < 15) ins.push({ tone: 'warn', text: 'Cold operation adds lithium-plating loss — pre-heat before fast charging.' });
  return (
    <>
      <PageHead kicker="Lifetime prediction" title="Degradation & Capacity Loss" desc="Wang-type Ah-throughput SEI law plus Arrhenius calendar ageing. By default it uses the live pack operating temperature from the thermal model, so cooling and load changes made on other pages shorten or extend lifetime here."
        meta={[['Cycling', 'B·exp(−Ea/RT)·Ah^0.55'], ['Calendar', '√t · Arrhenius · SOC'], ['Temperature', `${fmt(T, 1)} °C (${useLive ? 'live pack' : 'manual'})`]]} />
      <div className="grid g4">
        <Metric label="State of health" value={fmt(100 - now.total)} unit="%" tone={now.total > 20 ? 'bad' : now.total > 12 ? 'warn' : 'ok'} sub={`${s.cycles} cycles`} />
        <Metric label="Capacity lost" value={fmt(now.total)} unit="%" tone="info" sub={`cycle ${fmt(now.cyc, 1)} · cal ${fmt(now.cal, 1)}`} />
        <Metric label={`Cycles to ${eol} % SOH`} value={eolCycles >= 30000 ? '>30000' : fmt(eolCycles, 0)} tone="info" />
        <Metric label="Calendar life" value={eolCycles >= 30000 ? '>80' : fmt(years, 1)} unit="yr" tone={years < 6 ? 'warn' : 'ok'} sub={`at ${fmt(s.cyclesPerDay, 1)} cycles/day`} />
      </div>
      <div className="grid g13">
        <Card title="Degradation controls">
          <Controls keys={['cycles', 'cyclesPerDay', 'loadC', 'chargeC']} reset={false} />
          <Slider label="Depth of discharge" value={dod} min={10} max={100} unit=" %" onChange={setDod} />
          <Slider label="Average SOC" value={socAvg} min={10} max={100} unit=" %" onChange={setSocAvg} hint="Calendar ageing is faster at high SOC." />
          <Toggle label="Use live pack temperature" checked={useLive} onChange={setUseLive} />
          {!useLive && <Slider label="Manual temperature" value={manualT} min={-10} max={60} unit=" °C" onChange={setManualT} />}
          <Slider label="Projection horizon" value={maxC} min={500} max={6000} step={100} unit=" cycles" onChange={setMaxC} />
          <Slider label="End-of-life SOH" value={eol} min={60} max={90} unit=" %" onChange={setEol} />
          <button className="btn reset" onClick={() => { s.set({ cycles: 150, cyclesPerDay: 1, loadC: 2, chargeC: 2 }); setDod(80); setSocAvg(55); setUseLive(true); setMaxC(3000); setEol(80); }}>RESET DEGRADATION DEFAULTS</button>
        </Card>
        <div>
          <Card title="Capacity projection" sub="SOH vs cycles at different constant temperatures; white = live scenario">
            <ResponsiveContainer width="100%" height={270}>
              <ComposedChart data={curves}><CartesianGrid stroke={GRID} /><XAxis dataKey="n" {...AX} tickFormatter={(v: number) => v.toFixed(0)} /><YAxis {...AX} domain={[60, 100]} unit="%" /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1) + ' %'} labelFormatter={(v: any) => `${Number(v).toFixed(0)} cycles`} /><Legend />
                <ReferenceLine y={eol} stroke="#ff5468" strokeDasharray="4 3" /><ReferenceLine x={s.cycles} stroke="#fff" strokeDasharray="3 3" />
                <Line dataKey="t15" name="15 °C" stroke="#3ddc97" dot={false} isAnimationActive={false} /><Line dataKey="t25" name="25 °C" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line dataKey="t35" name="35 °C" stroke="#ffb43a" dot={false} isAnimationActive={false} /><Line dataKey="t45" name="45 °C" stroke="#ff5468" dot={false} isAnimationActive={false} />
                <Line dataKey="live" name="Live" stroke="#fff" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                {eolCycles < maxC && <ReferenceDot x={eolCycles} y={eol} r={5} fill="#fff" />}</ComposedChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid g2" style={{ marginTop: 12, marginBottom: 0 }}>
            <Card title="Loss breakdown (live)"><ResponsiveContainer width="100%" height={170}><ComposedChart data={curves}><CartesianGrid stroke={GRID} /><XAxis dataKey="n" {...AX} tickFormatter={(v: number) => v.toFixed(0)} /><YAxis {...AX} unit="%" /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1) + ' %'} /><Legend /><Area dataKey="cyc" name="Cycling" stackId="a" stroke="#35d6ff" fill="rgba(53,214,255,.25)" isAnimationActive={false} /><Area dataKey="cal" name="Calendar" stackId="a" stroke="#a78bfa" fill="rgba(167,139,250,.25)" isAnimationActive={false} /></ComposedChart></ResponsiveContainer></Card>
            <Card title="Recommendations"><Insights items={ins} /></Card>
          </div>
        </div>
      </div>
    </>
  );
}
