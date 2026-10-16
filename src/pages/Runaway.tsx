import { useDeferredValue, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { runawayInput, usePack } from '../derive';
import { Card, Chips, Insights, Metric, PageHead, Seg, Slider, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { RX, criticalHc, freshReactionPower, riskScore, simulateRunaway, reactionEnergy } from '../physics/runaway';

const RUN_PRESETS = [
  { id: 'nom', label: 'Nominal', patch: { defect: 0, coolingFail: false, soc: 70 }, ext: 0 },
  { id: 'nail', label: 'Nail penetration', patch: { defect: 90, coolingFail: false, soc: 90 }, ext: 0 },
  { id: 'cool', label: 'Cooling loss + 2C', patch: { defect: 30, coolingFail: true, soc: 85, loadC: 2 }, ext: 0 },
  { id: 'over', label: 'Overcharge', patch: { defect: 20, coolingFail: true, soc: 100 }, ext: 40 },
  { id: 'fire', label: 'Neighbour fire', patch: { defect: 0, coolingFail: false, soc: 100 }, ext: 80 },
];
export default function Runaway() {
  const s = useStore(), P = usePack();
  const [ext, setExt] = useState(0), [tab, setTab] = useState<'T' | 'rate' | 'rx'>('T');
  const inp = useDeferredValue(useMemo(() => runawayInput(s, P, ext), [s.defect, s.defectCell, s.soc, s.ambient, s.flow, s.mode, s.coolant, s.coolingFail, s.loadC, s.chargeC, s.activity, s.cycles, ext])); // eslint-disable-line
  const res = useMemo(() => simulateRunaway(inp), [inp]);
  const hcCrit = useMemo(() => criticalHc(inp), [inp]);
  const risk = riskScore(res);
  const data = res.pts.map(p => ({ t: +(p.t / 60).toFixed(2), T: p.T, rate: Math.max(p.dTdt, 1e-4), sei: p.c[0], anode: p.c[1], cath: p.c[2], elec: p.c[3] }));
  const sem = useMemo(() => Array.from({ length: 56 }, (_, k) => {
    const T = 30 + k * 4;
    return { T, gen: Math.max(1e-2, inp.shortW + inp.extW + inp.hc * (inp.T0 - inp.coolant) + inp.ha * (inp.T0 - inp.ambient) + freshReactionPower(T, s.soc)), loss: Math.max(1e-2, inp.hc * (T - inp.coolant) + inp.ha * (T - inp.ambient)) };
  }), [inp, s.soc]);
  const marginHc = hcCrit === Infinity ? -1 : inp.hc / hcCrit;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  if (res.runaway) ins.push({ tone: 'bad', text: `Runaway in ${fmt(res.tRun / 60)} min; peak ≈ ${fmt(res.Tpeak, 0)} °C (adiabatic ΔT ${fmt(res.adiabatic, 0)} K). Isolate the pack and alert occupants.` });
  else ins.push({ tone: 'ok', text: `No runaway within 2 h; peak cell temperature ${fmt(res.Tpeak)} °C.` });
  if (hcCrit === Infinity) ins.push({ tone: 'bad', text: 'Even 8 W/K cell cooling cannot hold this heat load — the cell must be de-energised.' });
  else if (hcCrit > 0.05) ins.push({ tone: marginHc < 1 ? 'bad' : marginHc < 1.5 ? 'warn' : 'ok', text: `Semenov-type threshold: needs ≥ ${fmt(hcCrit, 2)} W/K cell→coolant conductance; currently ${fmt(inp.hc, 2)} W/K (${marginHc < 1 ? 'below' : fmt(marginHc, 1) + '× above'} the limit).` });
  if (s.soc > 80) ins.push({ tone: 'warn', text: `Cutting SOC from ${s.soc} % to 80 % lowers stored reaction energy by ${fmt((1 - reactionEnergy(80) / reactionEnergy(s.soc)) * 100, 0)} %.` });
  if (s.coolingFail) ins.push({ tone: 'warn', text: 'Cooling is failed: heat can only leave through passive 0.12 W/K — restore flow first.' });
  if (!isNaN(res.Tonset)) ins.push({ tone: 'warn', text: `SEI decomposition (self-heating onset) begins at ≈ ${fmt(res.Tonset, 0)} °C after ${fmt(res.tOnset / 60)} min — this is the earliest actionable warning.` });
  return (
    <>
      <PageHead kicker="Safety analysis" title="Thermal Runaway Risk" desc="Four Arrhenius sub-reactions (SEI, anode, cathode, electrolyte) feed a lumped energy balance for the fault cell. Short-circuit heat, external heat and the cooling conductance from the shared state decide whether heat generation ever exceeds heat removal."
        meta={[['Model', 'Lumped 4-reaction Arrhenius'], ['Reaction energy', `${fmt(res.Etot / 1000, 0)} kJ @ SOC ${s.soc} %`], ['Fault cell', `#${s.defectCell + 1}`]]} />
      <div className="topbar"><span className="lbl">Abuse scenarios</span><Chips items={RUN_PRESETS.map(p => ({ id: p.id, label: p.label }))} onPick={id => { const p = RUN_PRESETS.find(x => x.id === id)!; s.set(p.patch); setExt(p.ext); }} /></div>
      <div className="grid g13">
        <Card title="Abuse inputs">
          <Controls keys={['soc', 'defect', 'defectCell', 'ambient', 'flow', 'coolingFail']} reset={false} />
          <Slider label="External heat flux" value={ext} min={0} max={100} unit=" W" onChange={setExt} hint="Fire / neighbouring-cell heating." />
          <button className="btn reset" onClick={() => { s.set({ soc: 70, defect: 0, defectCell: 9, ambient: 25, flow: 40, coolingFail: false }); setExt(0); }}>RESET TO DASHBOARD DEFAULTS</button>
        </Card>
        <div>
          <div className="grid g4" style={{ marginBottom: 12 }}>
            <Metric label="Risk score" value={risk} unit="/100" tone={tone(risk, 30, 60)} sub={res.runaway ? 'RUNAWAY' : 'contained'} />
            <Metric label="Time to runaway" value={res.runaway ? fmt(res.tRun / 60) : '—'} unit={res.runaway ? 'min' : ''} tone={res.runaway ? 'bad' : 'ok'} sub="dT/dt > 1 K/s" />
            <Metric label="Peak temperature" value={fmt(res.Tpeak, 0)} unit="°C" tone={res.Tpeak > 150 ? 'bad' : res.Tpeak > 80 ? 'warn' : 'ok'} />
            <Metric label="Min. safe cooling" value={hcCrit === Infinity ? '>8' : fmt(hcCrit, 2)} unit="W/K" tone={marginHc < 1 ? 'bad' : marginHc < 1.5 ? 'warn' : 'ok'} sub={`actual ${fmt(inp.hc, 2)} W/K`} />
          </div>
          <Card title="Cell response" right={<Seg options={[{ id: 'T', label: 'Temperature' }, { id: 'rate', label: 'dT/dt' }, { id: 'rx', label: 'Reactions' }]} value={tab} onChange={setTab} />}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} unit=" min" />
                <YAxis {...AX} scale={tab === 'rate' ? 'log' : 'linear'} domain={tab === 'rate' ? [1e-4, 'auto'] : tab === 'rx' ? [0, 1] : ['auto', 'auto']} allowDataOverflow />
                <Tooltip {...TT} />
                {tab === 'T' && <><Line dataKey="T" name="Cell °C" stroke="#ff8a3a" dot={false} isAnimationActive={false} /><ReferenceLine y={100} stroke="#ffb43a" strokeDasharray="4 3" label={{ value: 'SEI onset ~100 °C', fill: '#ffb43a', fontSize: 10 }} /></>}
                {tab === 'rate' && <><Line dataKey="rate" name="dT/dt K/s" stroke="#ff5468" dot={false} isAnimationActive={false} /><ReferenceLine y={1} stroke="#ffb43a" strokeDasharray="4 3" /></>}
                {tab === 'rx' && <><Legend /><Line dataKey="sei" name="SEI" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line dataKey="anode" name="Anode" stroke="#3ddc97" dot={false} isAnimationActive={false} /><Line dataKey="cath" name="Cathode" stroke="#ffb43a" dot={false} isAnimationActive={false} /><Line dataKey="elec" name="Electrolyte" stroke="#a78bfa" dot={false} isAnimationActive={false} /></>}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Semenov diagram" sub="Heat generation (fresh-material kinetics + faults) vs heat removal, log scale. If generation stays above removal, runaway is unavoidable.">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={sem}><CartesianGrid stroke={GRID} /><XAxis dataKey="T" {...AX} unit="°" /><YAxis {...AX} scale="log" domain={[0.1, 1e6]} allowDataOverflow tickFormatter={v => (v >= 1000 ? `${v / 1000}k` : v)} /><Tooltip {...TT} formatter={(v: any) => `${Number(v).toFixed(1)} W`} /><Legend />
              <Line dataKey="gen" name="Generation W" stroke="#ff5468" dot={false} isAnimationActive={false} /><Line dataKey="loss" name="Removal W" stroke="#35d6ff" dot={false} isAnimationActive={false} /></LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Safety insights"><Insights items={ins} /></Card>
      </div>
      <Card title="Reaction stages" sub="Time at which 50 % of each reactant is consumed">
        <table><thead><tr><th>Stage</th><th>Ea (kJ/mol)</th><th>Energy share</th><th>Energy (kJ)</th><th>50 % consumed</th></tr></thead>
          <tbody>{RX.map((r, k) => <tr key={r.name}><td>{r.name}</td><td>{fmt(r.Ea / 1000, 0)}</td><td>{fmt(r.f * 100, 0)} %</td><td>{fmt(r.f * res.Etot / 1000, 0)}</td><td>{isNaN(res.stageT[k]) ? 'not reached' : `${fmt(res.stageT[k] / 60)} min`}</td></tr>)}</tbody></table>
      </Card>
    </>
  );
}
