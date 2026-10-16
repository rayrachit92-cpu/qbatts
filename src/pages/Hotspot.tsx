import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useStore } from '../store';
import { solvePack, COLS, N, ROWS, mulberry32, neighbors, CELL_CTH } from '../physics/core';
import { usePack } from '../derive';
import { Card, Insights, Metric, PageHead, Slider, Toggle, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { cssColor, tempU } from '../colors';

export default function Hotspot() {
  const s = useStore(), P = usePack();
  const [noiseOn, setNoiseOn] = useState(false), [sigma, setSigma] = useState(0.6), [seed, setSeed] = useState(1);
  const meas = useMemo(() => { const r = mulberry32(seed * 977); return P.grid.T.map(t => t + (noiseOn ? sigma * (r() + r() + r() - 1.5) * 2 : 0)); }, [P.grid.T, noiseOn, sigma, seed]);
  const nbMean = (i: number) => { const n = neighbors(i); return n.reduce((a, j) => a + meas[j], 0) / n.length; };
  const alerts = useMemo(() => {
    const a: { cell: number; level: 'warn' | 'bad'; text: string; value: number }[] = [];
    meas.forEach((T, i) => {
      if (T >= s.crit) a.push({ cell: i, level: 'bad', text: `Critical: ${fmt(T)} °C ≥ ${s.crit} °C`, value: T });
      else if (T >= s.warn) a.push({ cell: i, level: 'warn', text: `Warning: ${fmt(T)} °C ≥ ${s.warn} °C`, value: T });
      const g = T - nbMean(i); if (g >= s.grad) a.push({ cell: i, level: g >= 2 * s.grad ? 'bad' : 'warn', text: `Local hotspot: ${fmt(g)} K above neighbours (limit ${s.grad} K)`, value: g });
    });
    return a.sort((x, y) => (x.level === y.level ? y.value - x.value : x.level === 'bad' ? -1 : 1));
  }, [meas, s.warn, s.crit, s.grad]); // eslint-disable-line
  const sel = s.selected, healthy = useMemo(() => solvePack({ ...P.params, defect: 0 }), [P.params]);
  const Teq = P.grid.T[sel], T0 = healthy.T[sel];
  const nbs = neighbors(sel), gSum = nbs.length * P.params.gLat, tau = CELL_CTH / (P.hc + 0.1 + gSum * 0.3);
  const eta = (Tth: number) => (Teq <= Tth ? Infinity : T0 >= Tth ? 0 : -tau * Math.log(1 - (Tth - T0) / (Teq - T0)));
  const etaW = eta(s.warn), etaC = eta(s.crit);
  const curve = Array.from({ length: 41 }, (_, k) => { const t = (k / 40) * 20 * 60; return { t: +(t / 60).toFixed(1), T: Teq - (Teq - T0) * Math.exp(-t / tau) }; });
  const bars = meas.map((T, i) => ({ i, name: `#${i + 1}`, T })).sort((a, b) => b.T - a.T);
  const nBad = alerts.filter(a => a.level === 'bad').length, nWarn = alerts.length - nBad;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (!alerts.length) ins.push({ tone: 'ok', text: 'No cell breaches a threshold. Lower the thresholds or inject a fault to test detection.' });
  if (nBad) ins.push({ tone: 'bad', text: `${nBad} critical alert(s). Highest: cell #${alerts[0].cell + 1} — ${alerts[0].text}.` });
  if (s.defect > 0) ins.push({ tone: isFinite(etaC) ? 'warn' : 'info', text: `Fault in cell #${s.defectCell + 1} is ${fmt(P.grid.T[s.defectCell] - healthy.T[s.defectCell])} K hotter than healthy; ${isFinite(eta(s.warn)) ? '' : 'it never reaches the warning level at steady state.'}` });
  if (noiseOn) ins.push({ tone: 'info', text: `Sensor noise σ ≈ ${sigma} K (simulated). Gradient limits below ~${fmt(sigma * 3, 1)} K will false-alarm.` });
  ins.push({ tone: 'info', text: `Selected cell #${sel + 1}: time constant ${fmt(tau / 60)} min; ${isFinite(etaW) ? `reaches ${s.warn} °C in ${fmt(etaW / 60)} min` : `settles at ${fmt(Teq)} °C (below warning)`}.` });
  return (
    <>
      <PageHead kicker="Anomaly detection" title="Hotspot Detection" desc="Absolute, critical and neighbour-gradient thresholds are evaluated on every cell. Inject a short-circuit fault, add simulated sensor noise, and select cells to see their thermal time-constant and time-to-threshold."
        meta={[['Rules', 'T ≥ warn · T ≥ crit · ∇T ≥ limit'], ['Sensors', noiseOn ? `simulated σ=${sigma} K` : 'ideal'], ['Selected', `#${sel + 1}`]]} />
      <div className="grid g4">
        <Metric label="Active alerts" value={alerts.length} tone={nBad ? 'bad' : nWarn ? 'warn' : 'ok'} sub={`${nBad} critical · ${nWarn} warning`} />
        <Metric label="Hottest (measured)" value={fmt(bars[0].T)} unit="°C" tone={tone(bars[0].T, s.warn, s.crit)} sub={`cell ${bars[0].name}`} />
        <Metric label="ETA to warning" value={isFinite(etaW) ? fmt(etaW / 60) : '∞'} unit={isFinite(etaW) ? 'min' : ''} tone={isFinite(etaW) ? 'warn' : 'ok'} sub={`selected cell #${sel + 1}`} />
        <Metric label="ETA to critical" value={isFinite(etaC) ? fmt(etaC / 60) : '∞'} unit={isFinite(etaC) ? 'min' : ''} tone={isFinite(etaC) ? 'bad' : 'ok'} />
      </div>
      <div className="grid g13">
        <div>
          <Card title="Detection settings">
            <Slider label="Warning threshold" value={s.warn} min={25} max={70} unit=" °C" onChange={v => s.set({ warn: v, crit: Math.max(s.crit, v + 1) })} />
            <Slider label="Critical threshold" value={s.crit} min={30} max={90} unit=" °C" onChange={v => s.set({ crit: v, warn: Math.min(s.warn, v - 1) })} />
            <Slider label="Neighbour gradient limit" value={s.grad} min={1} max={20} step={0.5} digits={1} unit=" K" onChange={v => s.set({ grad: v })} />
            <Toggle label="Simulated sensor noise" checked={noiseOn} onChange={setNoiseOn} />
            {noiseOn && <><Slider label="Noise σ" value={sigma} min={0.1} max={3} step={0.1} digits={1} unit=" K" onChange={setSigma} /><button className="btn" onClick={() => setSeed(x => x + 1)}>Resample noise</button></>}
            <button className="btn reset" onClick={() => { s.set({ warn: 45, crit: 60, grad: 6 }); setNoiseOn(false); setSigma(0.6); }}>RESET THRESHOLDS</button>
          </Card>
          <Card title="Fault injection"><Controls keys={['defect', 'defectCell', 'loadC', 'flow']} /></Card>
        </div>
        <div>
          <Card title="Cell map" sub="Click to select · outlined cells have an alert">
            <div className="cellgrid">{meas.map((T, i) => { const al = alerts.find(a => a.cell === i); return (
              <button key={i} className={'cellbtn' + (i === sel ? ' sel' : '')} style={{ background: cssColor(tempU(T)), boxShadow: al ? `0 0 0 2px ${al.level === 'bad' ? '#ff5468' : '#ffb43a'} inset` : undefined }} onClick={() => s.set({ selected: i })} aria-label={`cell ${i + 1}`}>
                {fmt(T)}<small>#{i + 1}{i === s.defectCell && s.defect > 0 ? ' ⚠' : ''}</small></button>); })}</div>
          </Card>
          <div className="grid g2" style={{ marginBottom: 0 }}>
            <Card title="Ranked cell temperatures"><ResponsiveContainer width="100%" height={200}><BarChart data={bars}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...AX} interval={1} /><YAxis {...AX} domain={['auto', 'auto']} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(2)} /><ReferenceLine y={s.warn} stroke="#ffb43a" strokeDasharray="4 3" /><ReferenceLine y={s.crit} stroke="#ff5468" strokeDasharray="4 3" /><Bar dataKey="T" name="°C" onClick={(d: any) => s.set({ selected: d.i })}>{bars.map(b => <Cell key={b.i} fill={cssColor(tempU(b.T))} stroke={b.i === sel ? '#fff' : 'none'} />)}</Bar></BarChart></ResponsiveContainer></Card>
            <Card title={`Cell #${sel + 1} warm-up`} sub="First-order approach to steady state"><ResponsiveContainer width="100%" height={200}><LineChart data={curve}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} unit=" min" /><YAxis {...AX} domain={['auto', 'auto']} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(1)} /><Legend /><ReferenceLine y={s.warn} stroke="#ffb43a" strokeDasharray="4 3" /><ReferenceLine y={s.crit} stroke="#ff5468" strokeDasharray="4 3" /><Line dataKey="T" name="Cell °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></Card>
          </div>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Alert log"><table><thead><tr><th>Cell</th><th>Severity</th><th>Detail</th></tr></thead><tbody>
          {alerts.slice(0, 8).map((a, k) => <tr key={k} className="click" onClick={() => s.set({ selected: a.cell })}><td>#{a.cell + 1}</td><td><span className={'pill ' + a.level}>{a.level === 'bad' ? 'CRITICAL' : 'WARNING'}</span></td><td>{a.text}</td></tr>)}
          {!alerts.length && <tr><td colSpan={3}>All clear</td></tr>}</tbody></table></Card>
        <Card title="Detection insights"><Insights items={ins} /></Card>
      </div>
    </>
  );
}
