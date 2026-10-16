import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { quickRisk, usePack } from '../derive';
import { Card, Metric, PageHead, Seg, Toggle, Insights, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { K0, N, RSCALE, cellR, mulberry32, COLS } from '../physics/core';
import { cssColor, tempU } from '../colors';

export default function Overview() {
  const s = useStore(), P = usePack();
  const { res, risk } = useMemo(() => quickRisk(s, P), [s.ambient, s.loadC, s.chargeC, s.activity, s.flow, s.mode, s.coolant, s.coolingFail, s.cycles, s.defect, s.defectCell, s.soc, s.composite]); // eslint-disable-line
  const [view, setView] = useState<'T' | 'Q' | 'R'>('T');
  const [sorted, setSorted] = useState(false);
  const ref = useRef(P); ref.current = P;
  const [hist, setHist] = useState(() => Array.from({ length: 40 }, (_, k) => ({ t: k - 40, avg: P.avgT, max: P.maxT, pw: P.heat })));
  useEffect(() => {
    const rng = mulberry32(7); let t = 0;
    const id = setInterval(() => {
      t++; const p = ref.current, n = () => rng() - 0.5;
      setHist(h => [...h.slice(-59), { t, avg: +(p.avgT + 0.2 * n() + 0.12 * Math.sin(t / 6)).toFixed(2), max: +(p.maxT + 0.3 * n()).toFixed(2), pw: +(p.heat * (1 + 0.04 * n())).toFixed(1) }]);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const rows = P.grid.T.map((T, i) => {
    const R = cellR(T + K0, P.soh, RSCALE[i]) * 1000;
    return { i, name: `R${Math.floor(i / COLS) + 1}C${(i % COLS) + 1}`, T, Q: P.grid.Q[i], R, v: view === 'T' ? T : view === 'Q' ? P.grid.Q[i] : R };
  });
  const data = sorted ? [...rows].sort((a, b) => b.v - a.v) : rows;
  const margin = s.warn - P.maxT;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (risk >= 60) ins.push({ tone: 'bad', text: `Thermal-runaway model predicts cell ${s.defectCell + 1} enters runaway in ${fmt(res.tRun / 60)} min. Restore cooling / de-energise the pack.` });
  if (margin < 0) ins.push({ tone: margin < s.warn - s.crit ? 'bad' : 'warn', text: `Hottest cell is ${fmt(-margin)} °C above the ${s.warn} °C warning threshold — reduce load or raise flow.` });
  else ins.push({ tone: 'ok', text: `${fmt(margin)} °C thermal margin to the warning threshold.` });
  if (P.dT > 5) ins.push({ tone: 'warn', text: `Cell-to-cell spread is ${fmt(P.dT)} °C — non-uniform ageing expected (see Temperature Distribution).` });
  if (P.soh < 0.85) ins.push({ tone: 'warn', text: `State of health ${fmt(P.soh * 100)} %: resistance is ${fmt((1 + 1.2 * (1 - P.soh)) * 100 - 100, 0)} % above fresh and adds Joule heat.` });
  if (s.ambient < 5) ins.push({ tone: 'info', text: 'Cold ambient: charge acceptance is derated and lithium-plating risk rises (see Fast Charging).' });
  return (
    <>
      <PageHead kicker="Thermal intelligence" title="EV Battery Thermal Overview" desc="Live pack KPIs from a 4×6 cell thermal network. Every slider on every page writes to one shared state, so changing load, charge rate, ambient or cooling here changes the heatmap, runaway risk, ageing and 3D model elsewhere."
        meta={[['Pack', '24 × 50 Ah cells'], ['Model', 'Steady-state RC grid + Arrhenius kinetics'], ['Telemetry', 'Model + seeded sensor noise']]} />
      <div className="grid g4">
        <Metric label="Pack average" value={fmt(P.avgT)} unit="°C" tone={tone(P.avgT, s.warn - 8, s.warn)} sub={`min ${fmt(P.minT)} °C`} />
        <Metric label="Hottest cell" value={fmt(P.maxT)} unit="°C" tone={tone(P.maxT, s.warn, s.crit)} sub={`cell #${P.hot + 1} · margin ${fmt(margin)} °C`} />
        <Metric label="Cell spread ΔT" value={fmt(P.dT)} unit="K" tone={tone(P.dT, 4, 8)} sub="max − min" />
        <Metric label="Runaway risk" value={risk} unit="/100" tone={tone(risk, 30, 60)} sub={res.runaway ? `runaway in ${fmt(res.tRun / 60)} min` : `peak ${fmt(res.Tpeak)} °C`} />
      </div>
      <div className="grid g4">
        <Metric label="State of health" value={fmt(P.soh * 100)} unit="%" tone={P.soh < 0.8 ? 'bad' : P.soh < 0.88 ? 'warn' : 'ok'} sub={`${s.cycles} cycles`} />
        <Metric label="Heat dissipation" value={fmt(P.heat, 0)} unit="W" tone="info" sub={`${fmt(P.heat / N, 1)} W / cell`} />
        <Metric label="Cooling power" value={fmt(P.pump, 0)} unit="W" tone="info" sub={s.coolingFail ? 'FAILED' : `h = ${fmt(P.hc, 2)} W/K per cell`} />
        <Metric label="Operating mode" value={s.activity.toUpperCase()} tone="info" sub={`${fmt(P.cRate, 1)} C · SOC ${s.soc} %`} />
      </div>
      <div className="grid g13">
        <Card title="Inputs (shared state)" sub="Drives every page">
          <Controls keys={['ambient', 'activity', 'loadC', 'chargeC', 'flow', 'mode', 'coolingFail', 'cycles']} />
        </Card>
        <div>
          <Card title="Live telemetry" sub="Rolling 60 s window — model output with seeded sensor noise (simulated stream)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={hist}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} /><YAxis {...AX} domain={['auto', 'auto']} unit="°" /><Tooltip {...TT} />
                <ReferenceLine y={s.warn} stroke="#ffb43a" strokeDasharray="4 3" /><ReferenceLine y={s.crit} stroke="#ff5468" strokeDasharray="4 3" />
                <Line dataKey="avg" name="Pack avg °C" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line dataKey="max" name="Hottest °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /></LineChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Per-cell profile" sub="Click a bar to select that cell everywhere" right={<span className="row"><Seg options={[{ id: 'T', label: 'Temp' }, { id: 'Q', label: 'Heat W' }, { id: 'R', label: 'Resist. mΩ' }]} value={view} onChange={setView} /><Toggle label="Sort" checked={sorted} onChange={setSorted} /></span>}>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...AX} interval={0} angle={-60} textAnchor="end" height={44} /><YAxis {...AX} domain={view === 'T' ? ['auto', 'auto'] : [0, 'auto']} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(2)} />
                {view === 'T' && <ReferenceLine y={s.warn} stroke="#ffb43a" strokeDasharray="4 3" />}
                <Bar dataKey="v" name={view === 'T' ? '°C' : view === 'Q' ? 'W' : 'mΩ'} onClick={(d: any) => useStore.getState().set({ selected: d.i })}>
                  {data.map(d => <Cell key={d.i} fill={view === 'T' ? cssColor(tempU(d.T)) : '#35d6ff'} stroke={d.i === s.selected ? '#fff' : 'none'} />)}</Bar></BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
      <Card title="AI insight" sub="Rule-based, computed from the live model state"><Insights items={ins} /></Card>
      <div className="note"><b>Simulated data.</b> All numbers are produced by a reduced-order thermal model (I²R + entropic heating, Arrhenius resistance, 2-D conduction, lane-wise coolant warming). They are physics-inspired illustrations, not measurements of a real pack.</div>
    </>
  );
}
