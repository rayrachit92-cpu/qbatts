import { useDeferredValue, useMemo, useState } from 'react';
import { CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { useStore, DEFAULTS } from '../store';
import { usePack } from '../derive';
import { Btn, Card, Insights, Metric, PageHead, Slider, AX, GRID, TT, fmt } from '../components/ui';
import { Controls } from '../components/Controls';
import { compositeProps, optimizeComposite } from '../physics/materials';
import { simulatePropagation } from '../physics/propagation';

export default function Materials() {
  const s = useStore(), P = usePack();
  const [w, setW] = useState({ thermal: 30, uniform: 40, prop: 60, mass: 30, cost: 20 });
  const cp = compositeProps(s.composite);
  const ctx = useMemo(() => ({ trigger: s.defectCell, hc: P.hc, coolant: s.coolant, ambient: s.ambient, soc: s.soc }), [s.defectCell, P.hc, s.coolant, s.ambient, s.soc]);
  const wd = useDeferredValue(w);
  const opt = useMemo(() => optimizeComposite(P.params, { thermal: wd.thermal / 50, uniform: wd.uniform / 50, prop: wd.prop / 50, mass: wd.mass / 50, cost: wd.cost / 50 }, ctx), [P.params, wd, ctx]);
  const prop = useMemo(() => simulatePropagation({ ...ctx, trigger: s.defectCell, coolant: P.grid.Tc[s.defectCell], gLat: cp.gLat, barrier: s.barrier, latentJ: cp.latentJ, duration: 300, T0: P.avgT }), [ctx, cp.gLat, cp.latentJ, s.barrier, s.defectCell, P.avgT, P.grid.Tc]); // eslint-disable-line
  const pts = opt.cands.map(c => ({ x: +c.massG.toFixed(1), y: +c.dT.toFixed(2), z: c.tProp, k: c.k, g: c.c.graphite, p: c.c.pcm, t: c.c.thick }));
  const b = opt.best, set = (patch: Partial<typeof s.composite>) => s.set({ composite: { ...s.composite, ...patch } });
  const same = b.c.graphite === s.composite.graphite && b.c.pcm === s.composite.pcm && b.c.thick === s.composite.thick;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [
    { tone: 'info', text: `Effective conductivity ${fmt(cp.k, 2)} W/mK (graphite percolates above ~8 vol %); interlayer conductance ${fmt(cp.gLat, 2)} W/K per cell pair feeds the temperature-distribution model.` },
    { tone: prop.count > 1 ? 'warn' : 'ok', text: prop.count > 1 ? `With this interlayer a single failure propagates to ${prop.count} cells — consider an aerogel barrier or lower conductivity.` : 'This interlayer contains a single-cell failure in the propagation model.' },
    { tone: same ? 'ok' : 'info', text: same ? 'Current design equals the optimum for these weights.' : `Optimum for these weights: graphite ${b.c.graphite} %, PCM ${b.c.pcm} %, ${b.c.thick} mm (hottest ${fmt(b.Tmax)} °C, ΔT ${fmt(b.dT)} K, ${fmt(b.massG, 0)} g/cell).` },
  ];
  if (cp.pg + cp.pp >= 0.85) ins.push({ tone: 'warn', text: 'Filler fractions are capped at 85 vol % — the matrix can no longer bind the composite.' });
  return (
    <>
      <PageHead kicker="Advanced materials" title="Composite Thermal Interlayers" desc="Tune a graphite/PCM/polymer interlayer between cells. Percolation-theory conductivity and latent-heat buffering feed the shared pack model; the optimizer scans 200 candidate recipes and ranks them by your weighted objective."
        meta={[['k_eff', 'percolation, φc = 8 %'], ['PCM', '200 J/g @ 50 °C'], ['Candidates', `${opt.count} evaluated`]]} />
      <div className="grid g5">
        <Metric label="Conductivity" value={fmt(cp.k, 2)} unit="W/mK" tone="info" /><Metric label="Mass" value={fmt(cp.massG, 0)} unit="g/cell" tone="info" sub={`ρ ${fmt(cp.rho, 2)} g/cc`} />
        <Metric label="Cost" value={fmt(cp.costUSD, 2)} unit="$/cell" tone="info" /><Metric label="PCM buffer" value={fmt(cp.latentJ / 1000, 2)} unit="kJ" tone="info" sub={`≈ ${fmt(cp.bufferK, 1)} K per cell`} />
        <Metric label="Failure spread" value={prop.count} unit="cells" tone={prop.count > 3 ? 'bad' : prop.count > 1 ? 'warn' : 'ok'} sub="propagation sim" />
      </div>
      <div className="grid g13">
        <Card title="Material properties">
          <Slider label="Graphite filler" value={s.composite.graphite} min={0} max={40} unit=" vol %" onChange={v => set({ graphite: v })} hint="Raises k via percolation; adds mass and cost." />
          <Slider label="PCM fraction" value={s.composite.pcm} min={0} max={60} unit=" vol %" onChange={v => set({ pcm: v })} hint="Latent heat 200 J/g; lowers k slightly." />
          <Slider label="Interlayer thickness" value={s.composite.thick} min={1} max={6} step={0.5} digits={1} unit=" mm" onChange={v => set({ thick: v })} />
          <Controls keys={['barrier']} reset={false} />
          <div className="hint" style={{ margin: '6px 0' }}>Optimizer weights</div>
          <Slider label="Peak temperature" value={w.thermal} min={0} max={100} unit=" %" onChange={v => setW({ ...w, thermal: v })} />
          <Slider label="Uniformity ΔT" value={w.uniform} min={0} max={100} unit=" %" onChange={v => setW({ ...w, uniform: v })} />
          <Slider label="Propagation delay" value={w.prop} min={0} max={100} unit=" %" onChange={v => setW({ ...w, prop: v })} />
          <Slider label="Mass" value={w.mass} min={0} max={100} unit=" %" onChange={v => setW({ ...w, mass: v })} />
          <Slider label="Cost" value={w.cost} min={0} max={100} unit=" %" onChange={v => setW({ ...w, cost: v })} />
          <Btn pri onClick={() => set(b.c)}>Apply optimum recipe</Btn>
          <button className="btn reset" onClick={() => { s.set({ composite: DEFAULTS.composite, barrier: 0 }); setW({ thermal: 30, uniform: 40, prop: 60, mass: 30, cost: 20 }); }}>RESET MATERIAL DEFAULTS</button>
        </Card>
        <div>
          <Card title="Design space" sub="Each dot is a recipe: mass vs temperature spread (dot size = propagation delay). Lower-left is better.">
            <ResponsiveContainer width="100%" height={290}>
              <ScatterChart><CartesianGrid stroke={GRID} /><XAxis type="number" dataKey="x" name="Mass" unit=" g" {...AX} /><YAxis type="number" dataKey="y" name="ΔT" unit=" K" {...AX} /><ZAxis type="number" dataKey="z" range={[20, 120]} name="Delay (s)" /><Tooltip {...TT} cursor={{ strokeDasharray: '3 3' }} formatter={(v: any, n: any) => [Number(v).toFixed(1), n]} /><Legend />
                <Scatter name="Candidates" data={pts} fill="#35d6ff" fillOpacity={0.45} isAnimationActive={false} />
                <Scatter name="Optimum" data={[{ x: +b.massG.toFixed(1), y: +b.dT.toFixed(2), z: b.tProp }]} fill="#3ddc97" shape="star" isAnimationActive={false} />
                <Scatter name="Current" data={[{ x: +cp.massG.toFixed(1), y: +(P.dT).toFixed(2), z: prop.count > 1 ? 30 : 300 }]} fill="#ffb43a" shape="diamond" isAnimationActive={false} /></ScatterChart>
            </ResponsiveContainer>
          </Card>
          <div className="grid g2" style={{ marginTop: 12, marginBottom: 0 }}>
            <Card title="Optimization result"><table><tbody>
              <tr><td>Recipe</td><td>{b.c.graphite} % C · {b.c.pcm} % PCM · {b.c.thick} mm</td></tr><tr><td>k_eff</td><td>{fmt(b.k, 2)} W/mK</td></tr><tr><td>Hottest / ΔT</td><td>{fmt(b.Tmax)} °C / {fmt(b.dT)} K</td></tr>
              <tr><td>Propagation</td><td>{b.tProp >= 300 ? 'contained' : `first trip ${fmt(b.tProp, 0)} s`}</td></tr><tr><td>Mass / cost</td><td>{fmt(b.massG, 0)} g · ${fmt(b.costUSD, 2)}</td></tr></tbody></table></Card>
            <Card title="Insights"><Insights items={ins} /></Card>
          </div>
        </div>
      </div>
    </>
  );
}
