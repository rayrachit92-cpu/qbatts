import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useStore } from '../store';
import { usePack } from '../derive';
import { Card, Legend as Lg, Metric, PageHead, Seg, Slider, Toggle, AX, GRID, TT, fmt } from '../components/ui';
import { Controls } from '../components/Controls';
import { COLS, N, ROWS } from '../physics/core';
import { colorAt } from '../colors';

const W = 720, H = 480;
export default function Distribution() {
  const s = useStore(), P = usePack();
  const [mode, setMode] = useState<'abs' | 'dev' | 'grad'>('abs');
  const [smoothOn, setSmooth] = useState(true), [labels, setLabels] = useState(true), [auto, setAuto] = useState(true);
  const [lo, setLo] = useState(20), [hi, setHi] = useState(60);
  const ref = useRef<HTMLCanvasElement>(null);
  const T = P.grid.T, mean = P.avgT;
  const gradOf = (i: number) => { const r = Math.floor(i / COLS), c = i % COLS; const gx = ((T[r * COLS + Math.min(c + 1, COLS - 1)] - T[r * COLS + Math.max(c - 1, 0)]) / (c === 0 || c === COLS - 1 ? 1 : 2)); const gy = ((T[Math.min(r + 1, ROWS - 1) * COLS + c] - T[Math.max(r - 1, 0) * COLS + c]) / (r === 0 || r === ROWS - 1 ? 1 : 2)); return Math.hypot(gx, gy); };
  const val = (i: number) => (mode === 'abs' ? T[i] : mode === 'dev' ? T[i] - mean : gradOf(i));
  const vals = T.map((_, i) => val(i));
  let a = Math.min(...vals), b = Math.max(...vals);
  if (!auto && mode === 'abs') { a = lo; b = Math.max(hi, lo + 1); } else if (mode === 'dev') { const m = Math.max(Math.abs(a), Math.abs(b), 0.5); a = -m; b = m; } else if (b - a < 1) { b = a + 1; }
  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext?.('2d'); if (!cv || !ctx) return;
    const img = ctx.createImageData(W, H), cw = W / COLS, ch = H / ROWS;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v: number;
      if (smoothOn) {
        const fx = Math.min(Math.max(x / cw - 0.5, 0), COLS - 1), fy = Math.min(Math.max(y / ch - 0.5, 0), ROWS - 1);
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, COLS - 1), y1 = Math.min(y0 + 1, ROWS - 1), tx = fx - x0, ty = fy - y0;
        v = (vals[y0 * COLS + x0] * (1 - tx) + vals[y0 * COLS + x1] * tx) * (1 - ty) + (vals[y1 * COLS + x0] * (1 - tx) + vals[y1 * COLS + x1] * tx) * ty;
      } else v = vals[Math.floor(y / ch) * COLS + Math.floor(x / cw)];
      const [r, g, bb] = colorAt((v - a) / (b - a)), k = (y * W + x) * 4; img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = bb; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(5,8,14,.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < N; i++) {
      const c = i % COLS, r = Math.floor(i / COLS); ctx.strokeRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      if (labels) { ctx.fillStyle = '#05080e'; ctx.font = '600 15px monospace'; ctx.textAlign = 'center'; ctx.fillText(vals[i].toFixed(1), c * cw + cw / 2, r * ch + ch / 2 + 5); ctx.font = '10px monospace'; ctx.fillText('#' + (i + 1), c * cw + cw / 2, r * ch + 15); }
      if (i === s.selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(c * cw + 3, r * ch + 3, cw - 6, ch - 6); ctx.strokeStyle = 'rgba(5,8,14,.55)'; ctx.lineWidth = 2; }
    }
  });
  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => { const rc = e.currentTarget.getBoundingClientRect(); const c = Math.floor(((e.clientX - rc.left) / rc.width) * COLS), r = Math.floor(((e.clientY - rc.top) / rc.height) * ROWS); s.set({ selected: Math.min(N - 1, Math.max(0, r * COLS + c)) }); };
  const sd = Math.sqrt(T.reduce((x, t) => x + (t - mean) ** 2, 0) / N);
  const sr = Math.floor(s.selected / COLS), sc = s.selected % COLS;
  const rowProf = Array.from({ length: COLS }, (_, c) => ({ c: c + 1, T: T[sr * COLS + c], Tcool: P.grid.Tc[sr * COLS + c] }));
  const colProf = Array.from({ length: ROWS }, (_, r) => ({ r: r + 1, T: T[r * COLS + sc] }));
  return (
    <>
      <PageHead kicker="Spatial analysis" title="Temperature Distribution" desc="Interactive heatmap of the 4×6 cell grid. Click any cell to select it, switch between absolute, deviation and gradient views, and watch how coolant lane warming and edge losses shape the field."
        meta={[['Selected', `#${s.selected + 1} (R${sr + 1} C${sc + 1})`], ['View', mode === 'abs' ? 'Absolute °C' : mode === 'dev' ? 'ΔT vs mean' : '|∇T| K per cell'], ['Interpolation', smoothOn ? 'bilinear' : 'per cell']]} />
      <div className="grid g4">
        <Metric label="Mean" value={fmt(mean)} unit="°C" /><Metric label="Std. deviation σ" value={fmt(sd, 2)} unit="K" tone={sd > 2 ? 'warn' : 'ok'} />
        <Metric label="Max − min" value={fmt(P.dT)} unit="K" tone={P.dT > 8 ? 'bad' : P.dT > 4 ? 'warn' : 'ok'} />
        <Metric label="Uniformity index" value={fmt(100 * (1 - P.dT / Math.max(mean - s.ambient + 10, 10)), 0)} unit="%" tone="info" sub="1 − ΔT / (T̄ − T_amb + 10)" />
      </div>
      <div className="grid g21">
        <div className="vp"><canvas ref={ref} width={W} height={H} onClick={pick} style={{ cursor: 'crosshair' }} aria-label="Cell temperature heatmap" /><div className="ov">Click a cell to select</div></div>
        <div>
          <Card title="View"><Seg options={[{ id: 'abs', label: 'Absolute' }, { id: 'dev', label: 'ΔT' }, { id: 'grad', label: 'Gradient' }]} value={mode} onChange={setMode} />
            <div className="row"><Toggle label="Smooth" checked={smoothOn} onChange={setSmooth} /><Toggle label="Labels" checked={labels} onChange={setLabels} /><Toggle label="Auto range" checked={auto} onChange={setAuto} /></div>
            {!auto && mode === 'abs' && <><Slider label="Scale min" value={lo} min={-40} max={60} unit=" °C" onChange={setLo} /><Slider label="Scale max" value={hi} min={0} max={120} unit=" °C" onChange={setHi} /></>}
            <Lg lo={a} hi={b} unit={mode === 'grad' ? '' : mode === 'dev' ? ' K' : '°C'} /></Card>
          <Card title="Drive the field"><Controls keys={['ambient', 'loadC', 'flow', 'mode', 'defect', 'defectCell']} /></Card>
        </div>
      </div>
      <div className="grid g2">
        <Card title={`Row ${sr + 1} profile`} sub="Cell vs local coolant temperature along the flow direction"><ResponsiveContainer width="100%" height={190}><LineChart data={rowProf}><CartesianGrid stroke={GRID} /><XAxis dataKey="c" {...AX} /><YAxis {...AX} domain={['auto', 'auto']} /><Tooltip {...TT} /><Legend /><Line dataKey="T" name="Cell °C" stroke="#ff8a3a" isAnimationActive={false} /><Line dataKey="Tcool" name="Coolant °C" stroke="#35d6ff" isAnimationActive={false} /></LineChart></ResponsiveContainer></Card>
        <Card title={`Column ${sc + 1} profile`} sub="Across rows (edge losses vs interior)"><ResponsiveContainer width="100%" height={190}><LineChart data={colProf}><CartesianGrid stroke={GRID} /><XAxis dataKey="r" {...AX} /><YAxis {...AX} domain={['auto', 'auto']} /><Tooltip {...TT} /><Line dataKey="T" name="Cell °C" stroke="#3ddc97" isAnimationActive={false} /></LineChart></ResponsiveContainer></Card>
      </div>
    </>
  );
}
