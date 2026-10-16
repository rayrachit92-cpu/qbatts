import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Btn, Card, Insights, Metric, PageHead, Seg, Slider, AX, GRID, TT, fmt, tone } from '../components/ui';
import { Controls } from '../components/Controls';
import { NQ, Qubo, allEnergies, bits, circuitProbs, dftMag, eig2, expectedEnergy, runAnneal, runVQE } from '../physics/quantum';
import { clamp, mulberry32 } from '../physics/core';

const NAMES = ['Liquid plate', 'PCM layer', 'Aerogel barrier', 'Pre-heater'];
const logistic = (x: number) => 1 / (1 + Math.exp(-x));
export default function Quantum() {
  const s = useStore(), P = usePack();
  const [noise, setNoise] = useState(25), [layers, setLayers] = useState(2), [lr, setLr] = useState(0.25), [iters, setIters] = useState(80), [gnoise, setGnoise] = useState(0.05), [seed, setSeed] = useState(3);
  const [lc, setLc] = useState(50), [lm, setLm] = useState(40), [shown, setShown] = useState(0);
  const [manual, setManual] = useState<number[][] | null>(null);
  // ---- channels from shared pack state
  const th = clamp(((P.maxT - 25) / 35) * 100, 0, 100), ld = clamp((P.cRate / 4) * 100, 0, 100), dg = clamp((1 - P.soh) * 500, 0, 100), cd = clamp(100 * (1 - P.hc / 3.2), 0, 100);
  const s1 = 0.6 * th + 0.4 * ld, s2 = 0.7 * dg + 0.3 * noise, rho = (cd / 100) * 0.8;
  const S11 = s1 * s1, S22 = s2 * s2, S12 = rho * s1 * s2, E = eig2(S11, S12, S22);
  const pFail = logistic((Math.sqrt(E.l1) - 55) / 12) * (0.7 + 0.3 * logistic((s.defect - 20) / 10)), coh = Math.exp(-(noise / 100) * 1.2);
  const pHot = logistic((P.maxT - 55) / 6), pSel = logistic((P.grid.T[s.selected] - 55) / 6);
  const joint = [[0, 0, 'Healthy, Healthy'], [0, 1, 'Healthy, Damaged'], [1, 0, 'Damaged, Healthy'], [1, 1, 'Damaged, Damaged']].map(([a, b, n]) => { const pa = a ? pHot : 1 - pHot, pb = b ? pSel : 1 - pSel; return { n: n as string, amp: Math.sqrt(pa * pb), p: pa * pb }; });
  // ---- QUBO built from live state
  const tS = clamp((P.maxT - 30) / 30, 0, 1.5), prS = clamp(s.defect / 100 + (s.soc - 50) / 200, 0, 1.5), cS = clamp((10 - s.ambient) / 30, 0, 1.5), lcn = lc / 50, lmn = lm / 50;
  const H: Qubo = useMemo(() => ({
    h: [lcn * 0.9 + lmn * 0.7 - (2.2 * tS + 0.4), lcn * 0.5 + lmn * 0.5 - (1.2 * tS + 0.8 * prS), lcn * 0.6 + lmn * 0.3 - (2.4 * prS + 0.3 * tS), lcn * 0.7 + lmn * 0.2 - 2.6 * cS],
    J: [[0, 0.5 * tS + 0.3, -0.2, -0.3], [0, 0, 0.4, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  }), [lcn, lmn, tS, prS, cS]);
  const En = useMemo(() => allEnergies(H), [H]);
  const bestX = En.indexOf(Math.min(...En)), eMin = En[bestX];
  const run = useMemo(() => runVQE(H, layers, lr, iters, gnoise, seed), [H, layers, lr, iters, gnoise, seed]);
  const sa = useMemo(() => runAnneal(H, iters, seed), [H, iters, seed]);
  useEffect(() => { setShown(0); const id = setInterval(() => setShown(x => (x >= iters ? x : x + Math.max(1, Math.ceil(iters / 40)))), 40); return () => clearInterval(id); }, [run, iters]);
  const theta = manual ?? run.theta;
  const probs = useMemo(() => circuitProbs(theta), [theta]);
  const Eexp = expectedEnergy(theta, En), top = probs.indexOf(Math.max(...probs));
  const conv = Array.from({ length: Math.min(shown, iters) + 1 }, (_, k) => ({ it: k, vqe: run.hist[k], sa: sa.hist[k], opt: eMin }));
  const hist = probs.map((p, x) => ({ x: bits(x).join(''), p, e: En[x], best: x === bestX }));
  // ---- signal
  const spec = useMemo(() => { const r = mulberry32(5), n = 128, sig = Array.from({ length: n }, (_, t) => { const env = Math.exp(-(noise / 100) * 2 * (t / n)); return env * (Math.sin(2 * Math.PI * 8 * t / n) + (th / 100) * 0.6 * Math.sin(2 * Math.PI * 16 * t / n) + (dg / 100) * 0.5 * Math.sin(2 * Math.PI * 24 * t / n)) + 0.05 * (r() - 0.5); }); const m = dftMag(sig); return { sig: sig.map((v, t) => ({ t, v })), m: m.slice(0, 40).map((v, k) => ({ k, v })) }; }, [noise, th, dg]);
  const hl = (x: number) => bits(x).map((b, q) => (b ? NAMES[q] : null)).filter(Boolean).join(' + ') || 'none';
  const ins: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] = [
    { tone: pFail > 0.5 ? 'bad' : pFail > 0.25 ? 'warn' : 'ok', text: `Dominant stress mode λ₁ = ${fmt(E.l1, 0)} → failure probability ${fmt(pFail * 100, 0)} %; it is ${fmt(E.v1[0] ** 2 * 100, 0)} % thermal/load and ${fmt(E.v1[1] ** 2 * 100, 0)} % degradation/noise.` },
    { tone: 'info', text: `Optimal retrofit (exhaustive over 16 states): ${hl(bestX)} (E = ${fmt(eMin, 2)}). Circuit's most likely output: ${hl(top)} (${fmt(probs[top] * 100, 0)} %).` },
    { tone: run.hist[run.hist.length - 1] - eMin < 0.1 ? 'ok' : 'warn', text: `After ${iters} parameter-shift steps ⟨E⟩ = ${fmt(run.hist[run.hist.length - 1], 2)} vs optimum ${fmt(eMin, 2)} (gap ${fmt(run.hist[run.hist.length - 1] - eMin, 2)}).` },
  ];
  const setTheta = (l: number, q: number, v: number) => { const t = theta.map(r => [...r]); t[l][q] = v; setManual(t); };
  return (
    <>
      <PageHead kicker="Quantum-inspired diagnostics" title="Quantum AI Lab" desc="Pack telemetry cast as a two-level state vector with a Hermitian stress operator, plus a 4-qubit variational circuit that selects thermal-protection upgrades by minimising a QUBO built from the live operating point. Everything is classical linear algebra run in your browser."
        meta={[['State basis', '|Healthy⟩, |Damaged⟩'], ['Operator', '2×2 Hermitian stress'], ['Circuit', `${NQ} qubits · RY + CNOT ring · ${layers} layer(s)`]]} />
      <div className="grid g4">
        <Metric label="Failure probability" value={fmt(pFail * 100, 0)} unit="%" tone={tone(pFail * 100, 25, 50)} sub="logistic of √λ₁" />
        <Metric label="Coherence / confidence" value={fmt(coh * 100, 0)} unit="%" tone={coh < 0.6 ? 'warn' : 'ok'} sub="1 − decoherence from noise" />
        <Metric label="λ₁ / λ₂" value={`${fmt(E.l1, 0)} / ${fmt(E.l2, 0)}`} tone="info" sub="principal stress modes" />
        <Metric label="P(≥1 zone damaged)" value={fmt((1 - joint[0].p) * 100, 0)} unit="%" tone={tone((1 - joint[0].p) * 100, 20, 50)} sub={`hot cell ⊗ cell #${s.selected + 1}`} />
      </div>
      <div className="grid g13">
        <Card title="Operator inputs">
          <Controls keys={['ambient', 'loadC', 'flow', 'cycles', 'defect']} reset={false} />
          <Slider label="Sensor noise / uncertainty" value={noise} min={0} max={100} onChange={setNoise} hint="Diagonal term S₂₂; sets the decoherence decay of the signal." />
          <button className="btn reset" onClick={() => { s.set({ ambient: 25, loadC: 2, flow: 40, cycles: 150, defect: 0 }); setNoise(25); }}>RESET TO DASHBOARD DEFAULTS</button>
        </Card>
        <div>
          <Card title="Stress operator & eigen-decomposition" sub="Channels from the shared model: thermal stress, load, degradation, cooling deficit">
            <div className="grid g4" style={{ marginBottom: 8 }}>
              <Metric label="Thermal" value={fmt(th, 0)} tone="info" /><Metric label="Load" value={fmt(ld, 0)} tone="info" /><Metric label="Degradation" value={fmt(dg, 0)} tone="info" /><Metric label="Cooling deficit" value={fmt(cd, 0)} tone="info" />
            </div>
            <div className="grid g3" style={{ marginBottom: 0 }}>
              <div><div className="hint">HERMITIAN OPERATOR S</div><div className="mat">[ {fmt(S11, 0)} &nbsp; {fmt(S12, 0)} ]<br />[ {fmt(S12, 0)} &nbsp; {fmt(S22, 0)} ]</div></div>
              <div><div className="hint">DOMINANT-MODE ATTRIBUTION (v₁²)</div>
                {[['Thermal / load', E.v1[0] ** 2], ['Degradation / noise', E.v1[1] ** 2]].map(([n, v]) => <div key={n as string}><div className="sl-h"><span>{n}</span><b>{fmt((v as number) * 100, 0)} %</b></div><div className="bar"><i style={{ width: (v as number) * 100 + '%' }} /></div></div>)}</div>
              <div><div className="hint">STATE |ψ⟩</div><div className="mat" style={{ fontSize: 13 }}>√{fmt(1 - pFail, 2)}|H⟩ + √{fmt(pFail, 2)}|D⟩</div></div>
            </div>
          </Card>
          <Card title="Joint zone risk — |ψ_hot⟩ ⊗ |ψ_selected⟩">
            <table><thead><tr><th>Outcome</th><th>Amplitude</th><th>Probability</th></tr></thead><tbody>{joint.map(j => <tr key={j.n}><td>{j.n}</td><td>{fmt(j.amp, 3)}</td><td>{fmt(j.p * 100, 1)} %</td></tr>)}</tbody></table>
          </Card>
        </div>
      </div>
      <div className="grid g13">
        <Card title="Variational optimiser">
          <Slider label="Circuit layers p" value={layers} min={1} max={3} onChange={v => { setLayers(v); setManual(null); }} />
          <Slider label="Learning rate" value={lr} min={0.02} max={0.6} step={0.01} digits={2} onChange={setLr} />
          <Slider label="Iterations" value={iters} min={10} max={200} step={5} onChange={setIters} />
          <Slider label="Evaluation noise σ" value={gnoise} min={0} max={0.5} step={0.01} digits={2} onChange={setGnoise} hint="Emulates shot / hardware noise on each energy estimate." />
          <Slider label="Cost weight λ_cost" value={lc} min={0} max={100} unit=" %" onChange={setLc} />
          <Slider label="Mass weight λ_mass" value={lm} min={0} max={100} unit=" %" onChange={setLm} />
          <Btn pri onClick={() => { setSeed(x => x + 1); setManual(null); }}>Re-run (new seed)</Btn><Btn onClick={() => setManual(null)}>Use optimised θ</Btn>
          <button className="btn reset" onClick={() => { setLayers(2); setLr(0.25); setIters(80); setGnoise(0.05); setLc(50); setLm(40); setSeed(3); setManual(null); }}>RESET OPTIMISER</button>
        </Card>
        <div>
          <Card title="Interactive circuit" sub={manual ? 'Manual θ — drag to explore the landscape' : 'Optimised θ — drag any angle to override'}>
            <svg viewBox={`0 0 ${120 + layers * 150} 180`} style={{ width: '100%', maxHeight: 190 }}>
              {Array.from({ length: NQ }, (_, q) => <g key={q}><text x="6" y={30 + q * 40} fill="#7d90a8" fontSize="11" fontFamily="monospace">q{q} |0⟩</text><line x1="56" x2={100 + layers * 150} y1={26 + q * 40} y2={26 + q * 40} stroke="#26384f" /></g>)}
              {theta.map((row, l) => <g key={l}>{row.map((v, q) => <g key={q}><rect x={70 + l * 150} y={12 + q * 40} width="44" height="28" rx="4" fill="#111b29" stroke="#35d6ff" /><text x={92 + l * 150} y={30 + q * 40} fill="#d6e2f0" fontSize="9.5" textAnchor="middle" fontFamily="monospace">RY {(v / Math.PI).toFixed(2)}π</text></g>)}
                {[0, 1, 2].map(q => <g key={q}><circle cx={136 + l * 150} cy={26 + q * 40} r="3.5" fill="#ffb43a" /><line x1={136 + l * 150} x2={136 + l * 150} y1={26 + q * 40} y2={66 + q * 40} stroke="#ffb43a" /><circle cx={136 + l * 150} cy={66 + q * 40} r="8" fill="none" stroke="#ffb43a" /><line x1={128 + l * 150} x2={144 + l * 150} y1={66 + q * 40} y2={66 + q * 40} stroke="#ffb43a" /></g>)}</g>)}
            </svg>
            <div className="grid g4" style={{ marginBottom: 0 }}>{theta[0].map((v, q) => <Slider key={q} label={`θ₀ q${q} (${NAMES[q].split(' ')[0]})`} value={v} min={0} max={Math.PI} step={0.01} digits={2} onChange={x => setTheta(0, q, x)} />)}</div>
          </Card>
          <div className="grid g2" style={{ marginBottom: 0 }}>
            <Card title="Measurement distribution" sub={`⟨E⟩ = ${fmt(Eexp, 2)} · green = QUBO optimum`}><ResponsiveContainer width="100%" height={200}><BarChart data={hist}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="x" {...AX} interval={1} angle={-50} textAnchor="end" height={40} /><YAxis {...AX} domain={[0, 1]} /><Tooltip {...TT} formatter={(v: any, n: any, p: any) => [`${(Number(v) * 100).toFixed(1)} % (E=${p.payload.e.toFixed(2)})`, 'P']} /><Bar dataKey="p" name="P" isAnimationActive={false}>{hist.map((h, i) => <Cell key={i} fill={h.best ? '#3ddc97' : '#35d6ff'} />)}</Bar></BarChart></ResponsiveContainer></Card>
            <Card title="Convergence" sub="⟨E⟩ vs iteration — variational circuit vs simulated annealing"><ResponsiveContainer width="100%" height={200}><LineChart data={conv}><CartesianGrid stroke={GRID} /><XAxis dataKey="it" {...AX} /><YAxis {...AX} domain={['auto', 'auto']} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(3)} /><Legend /><Line dataKey="vqe" name="Variational ⟨E⟩" stroke="#35d6ff" dot={false} isAnimationActive={false} /><Line dataKey="sa" name="Annealing best" stroke="#ffb43a" dot={false} isAnimationActive={false} /><Line dataKey="opt" name="Exact optimum" stroke="#3ddc97" strokeDasharray="4 3" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></Card>
          </div>
        </div>
      </div>
      <div className="grid g2">
        <Card title="QUBO candidate table" sub="E = Σ hᵢxᵢ + Σ Jᵢⱼxᵢxⱼ — biases scale with the live thermal stress, fault severity and cold exposure">
          <table><thead><tr><th>Option</th><th>h</th><th>Live driver</th></tr></thead><tbody>{NAMES.map((n, q) => <tr key={n}><td>{n}</td><td>{fmt(H.h[q], 2)}</td><td>{['thermal stress', 'thermal + fault', 'fault / SOC', 'cold exposure'][q]}</td></tr>)}</tbody></table>
          <div style={{ marginTop: 10 }}><Insights items={ins} /></div>
        </Card>
        <Card title="Signal wave & spectrum" sub="Carrier plus damage harmonics (H2 ∝ thermal stress, H3 ∝ degradation) under a decoherence envelope">
          <ResponsiveContainer width="100%" height={120}><LineChart data={spec.sig}><XAxis dataKey="t" hide /><YAxis {...AX} domain={[-2.5, 2.5]} /><Line dataKey="v" stroke="#a78bfa" dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
          <ResponsiveContainer width="100%" height={130}><BarChart data={spec.m}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="k" {...AX} /><YAxis {...AX} /><Tooltip {...TT} formatter={(v: any) => Number(v).toFixed(3)} /><Bar dataKey="v" name="|X(k)|" fill="#35d6ff" isAnimationActive={false} /></BarChart></ResponsiveContainer>
        </Card>
      </div>
      <div className="note"><b>Quantum-inspired, not quantum hardware.</b> The state vector, stress operator, QUBO and the 4-qubit circuit are a probabilistic representation of macroscopic pack health and a classical statevector simulation (RY and CNOT gates, parameter-shift gradients). All values are simulated.</div>
    </>
  );
}
