import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Btn, Card, Insights, Metric, PageHead, Seg, Slider, fmt, AX, GRID, TT } from '../components/ui';
import { Controls } from '../components/Controls';
import { simulatePropagation } from '../physics/propagation';
import { compositeProps } from '../physics/materials';
import { COLS, N, ROWS, neighbors } from '../physics/core';
import { colorAt } from '../colors';

const CW = 760, CH = 460;
interface Pt { x: number; y: number; vx: number; vy: number; life: number; max: number; hot: number }
export default function Propagation() {
  const s = useStore(), P = usePack();
  const [ttrip, setTtrip] = useState(100), [speed, setSpeed] = useState<'1' | '2' | '4' | '8'>('4'), [playing, setPlaying] = useState(true);
  const cp = compositeProps(s.composite);
  const sim = useMemo(() => simulatePropagation({ trigger: s.defectCell, ambient: s.ambient, coolant: P.grid.Tc[s.defectCell], hc: P.hc, gLat: cp.gLat, barrier: s.barrier, latentJ: cp.latentJ, soc: s.soc, Ttrip: ttrip, duration: 300, T0: P.avgT }),
    [s.defectCell, s.ambient, P.hc, P.avgT, cp.gLat, cp.latentJ, s.barrier, s.soc, ttrip]); // eslint-disable-line
  const [tNow, setTNow] = useState(0), idx = useRef(0), parts = useRef<Pt[]>([]), cv = useRef<HTMLCanvasElement>(null), playRef = useRef(playing), spd = useRef(4);
  playRef.current = playing; spd.current = +speed;
  useEffect(() => { idx.current = 0; parts.current = []; setTNow(0); }, [sim]);
  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const cw = CW / COLS, ch = CH / ROWS;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (playRef.current) idx.current = Math.min(sim.frames.length - 1, idx.current + (dt * spd.current) / 2);
      const f = sim.frames[Math.floor(idx.current)] ?? sim.frames[0];
      const ctx = cv.current?.getContext?.('2d');
      if (ctx && f) {
        // spawn particles: radial from venting cells + directed along strong conduction edges
        for (let i = 0; i < N; i++) {
          const cx = (i % COLS) * cw + cw / 2, cy = Math.floor(i / COLS) * ch + ch / 2;
          if (f.st[i] === 1 && parts.current.length < 700) for (let k = 0; k < 3; k++) { const a = Math.random() * 6.283, v = 50 + Math.random() * 110; parts.current.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.6 + Math.random() * 0.9, hot: 1 }); }
          for (const j of neighbors(i)) if (f.T[i] - f.T[j] > 60 && Math.random() < Math.min(0.5, (f.T[i] - f.T[j]) / 900) && parts.current.length < 700) {
            const tx = (j % COLS) * cw + cw / 2, ty = Math.floor(j / COLS) * ch + ch / 2, d = Math.hypot(tx - cx, ty - cy);
            parts.current.push({ x: cx, y: cy, vx: ((tx - cx) / d) * 130, vy: ((ty - cy) / d) * 130, life: 0, max: d / 130, hot: 0.6 });
          }
        }
        ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, CW, CH);
        for (let i = 0; i < N; i++) {
          const x = (i % COLS) * cw, y = Math.floor(i / COLS) * ch, [r, g, b] = colorAt((f.T[i] - 20) / 380);
          ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath(); ctx.roundRect?.(x + 6, y + 6, cw - 12, ch - 12, 10); if (!ctx.roundRect) ctx.rect(x + 6, y + 6, cw - 12, ch - 12); ctx.fill();
          ctx.strokeStyle = f.st[i] === 1 ? '#fff' : f.st[i] === 2 ? '#52647b' : 'rgba(255,255,255,.12)'; ctx.lineWidth = f.st[i] === 1 ? 3 : 1.5; ctx.stroke();
          ctx.fillStyle = '#05080e'; ctx.font = '600 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${f.T[i].toFixed(0)}°`, x + cw / 2, y + ch / 2 + 5); ctx.font = '10px monospace'; ctx.fillText(`#${i + 1}${i === s.defectCell ? ' ⚡' : ''}`, x + cw / 2, y + 22);
        }
        for (const p of parts.current) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; const a = Math.max(0, 1 - p.life / p.max); const [r, g, b] = colorAt(0.55 + 0.45 * p.hot * a); ctx.fillStyle = `rgba(${r},${g},${b},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 + 2 * a, 0, 6.283); ctx.fill(); }
        parts.current = parts.current.filter(p => p.life < p.max);
      }
      acc += dt; if (acc > 0.12) { acc = 0; setTNow(f ? f.t : 0); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, s.defectCell]);
  const fNow = sim.frames[Math.min(sim.frames.length - 1, Math.floor(tNow / 2))];
  const burning = fNow ? fNow.st.filter(x => x === 1).length : 0, involved = fNow ? fNow.st.filter(x => x > 0).length : 0;
  const stopped = sim.count <= 1;
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [];
  ins.push(stopped ? { tone: 'ok', text: `Propagation is contained: only cell #${s.defectCell + 1} fails (effective cell-to-cell conductance ${fmt(sim.g, 3)} W/K).` } : { tone: 'bad', text: `Runaway propagates to ${sim.count}/${N} cells; first neighbour trips after ${fmt(sim.tFirst)} s. Evacuation window is only ${fmt(sim.tFirst)}–${fmt(sim.tLast)} s.` });
  if (!stopped && s.barrier < 0.5) ins.push({ tone: 'warn', text: 'Add a 0.3–1 mm aerogel barrier: it adds series thermal resistance and shields neighbours from vent gas.' });
  if (!stopped && s.soc > 60) ins.push({ tone: 'warn', text: `Lowering SOC to ≤ 40 % cuts the energy released (${fmt(sim.frames.length ? 650 * (0.25 + 0.75 * s.soc / 100) : 0, 0)} kJ at ${s.soc} %) and often stops propagation.` });
  ins.push({ tone: 'info', text: `PCM interlayer latent buffer: ${fmt(cp.latentJ / 1000, 2)} kJ/cell (≈ ${fmt(cp.bufferK, 1)} K) — useful for slow heating, small versus a ${fmt(0.65 * (0.25 + 0.75 * s.soc / 100) * 1000, 0)} kJ venting event.` });
  return (
    <>
      <PageHead kicker="Cascade failure" title="Thermal Propagation" desc="Click a cell to trigger runaway. Particles flow from venting cells (radial) and along conduction paths (directed); cell colour is its simulated temperature. Barrier, composite, SOC and cooling come from the shared state."
        meta={[['Trigger', `cell #${s.defectCell + 1}`], ['Trip temperature', `${ttrip} °C`], ['Cell coupling', `${fmt(sim.g, 3)} W/K`]]} />
      <div className="grid g4">
        <Metric label="Cells involved" value={`${involved}/${N}`} tone={involved > 3 ? 'bad' : involved > 1 ? 'warn' : 'ok'} sub={`${burning} venting now`} />
        <Metric label="First neighbour trips" value={isNaN(sim.tFirst) ? '—' : fmt(sim.tFirst, 0)} unit={isNaN(sim.tFirst) ? '' : 's'} tone={isNaN(sim.tFirst) ? 'ok' : 'bad'} />
        <Metric label="Total at 300 s" value={sim.count} unit="cells" tone={sim.count > 3 ? 'bad' : sim.count > 1 ? 'warn' : 'ok'} />
        <Metric label="Sim time" value={fmt(tNow, 0)} unit="s" tone="info" sub={`${speed}× speed`} />
      </div>
      <div className="grid g21">
        <div className="vp"><canvas ref={cv} width={CW} height={CH} aria-label="Heat spread animation" style={{ cursor: 'pointer' }} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); const c = Math.floor(((e.clientX - r.left) / r.width) * COLS), rr = Math.floor(((e.clientY - r.top) / r.height) * ROWS); s.set({ defectCell: Math.min(N - 1, rr * COLS + c), selected: Math.min(N - 1, rr * COLS + c) }); }} /><div className="ov">Click a cell to set the trigger</div></div>
        <div>
          <Card title="Playback"><div className="row"><Btn pri onClick={() => setPlaying(p => !p)}>{playing ? 'Pause' : 'Play'}</Btn><Btn onClick={() => { idx.current = 0; parts.current = []; setTNow(0); setPlaying(true); }}>Restart</Btn></div>
            <Seg options={[{ id: '1', label: '1×' }, { id: '2', label: '2×' }, { id: '4', label: '4×' }, { id: '8', label: '8×' }]} value={speed} onChange={setSpeed} /></Card>
          <Card title="Propagation controls"><Controls keys={['barrier', 'soc', 'flow', 'coolingFail']} reset={false} />
            <Slider label="Cell trip temperature" value={ttrip} min={80} max={180} unit=" °C" onChange={setTtrip} hint="Self-sustaining exotherm threshold (model parameter)." />
            <Slider label="Interlayer graphite" value={s.composite.graphite} min={0} max={40} unit=" %" onChange={v => s.set({ composite: { ...s.composite, graphite: v } })} />
            <Slider label="Interlayer PCM" value={s.composite.pcm} min={0} max={60} unit=" %" onChange={v => s.set({ composite: { ...s.composite, pcm: v } })} />
            <button className="btn reset" onClick={() => { s.set({ barrier: 0, soc: 70, flow: 40, coolingFail: false, defectCell: 9, composite: { graphite: 20, pcm: 10, thick: 2 } }); setTtrip(100); }}>RESET PROPAGATION DEFAULTS</button></Card>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Cells in runaway vs time" sub="Cumulative cells that have tripped"><ResponsiveContainer width="100%" height={210}><LineChart data={sim.counts}><CartesianGrid stroke={GRID} /><XAxis dataKey="t" {...AX} unit=" s" /><YAxis {...AX} domain={[0, N]} allowDecimals={false} /><Tooltip {...TT} /><Legend /><ReferenceLine x={Math.round(tNow / 2) * 2} stroke="#fff" strokeDasharray="3 3" /><Line dataKey="n" name="Cells tripped" stroke="#ff5468" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></Card>
        <Card title="Analysis"><Insights items={ins} />
          <table style={{ marginTop: 8 }}><thead><tr><th>Cell</th><th>Trip time</th></tr></thead><tbody>{sim.trip.map((t, i) => [t, i] as const).filter(([t]) => !isNaN(t)).sort((a, b) => a[0] - b[0]).slice(0, 6).map(([t, i]) => <tr key={i}><td>#{i + 1}</td><td>{fmt(t, 1)} s</td></tr>)}</tbody></table></Card>
      </div>
    </>
  );
}
