import { useState } from 'react';
import { useStore } from '../store';
import { usePack } from '../derive';
import Pack3D from '../components/Pack3D';
import { Card, Legend, Metric, PageHead, Seg, Slider, Toggle, fmt } from '../components/ui';
import { Controls } from '../components/Controls';
import { COLS, N, ROWS, neighbors } from '../physics/core';
import { tempU } from '../colors';

export default function Battery3D() {
  const s = useStore(), P = usePack();
  const [colorBy, setColorBy] = useState<'T' | 'Q' | 'dT'>('T');
  const [explode, setExplode] = useState(0.15);
  const [auto, setAuto] = useState(true), [plate, setPlate] = useState(true), [heat, setHeat] = useState(true), [cut, setCut] = useState(-1);
  const mean = P.avgT, qmax = Math.max(...P.grid.Q, 1);
  const lo = Math.floor(P.minT - 2), hi = Math.max(Math.ceil(P.maxT + 2), lo + 12);
  const u = P.grid.T.map((T, i) => colorBy === 'T' ? tempU(T, lo, hi) : colorBy === 'Q' ? P.grid.Q[i] / qmax : 0.5 + (T - mean) / 12);
  const laneU = Array.from({ length: ROWS }, (_, r) => tempU(P.grid.Tc[r * COLS + COLS - 1]));
  const sel = s.selected, nb = neighbors(sel);
  return (
    <>
      <PageHead kicker="3D battery module" title="Rotatable Cell Model" desc="24 cylindrical cells coloured by the live thermal network. Drag to orbit, scroll to zoom, click a cell to inspect it. Colours, coolant particle speed and temperatures follow the shared sliders."
        meta={[['Layout', `${ROWS}×${COLS} cells`], ['Colour', colorBy === 'T' ? 'Temperature' : colorBy === 'Q' ? 'Heat generation' : 'ΔT vs pack mean'], ['Selected', `cell #${sel + 1}`]]} />
      <div className="grid g21">
        <div className="vp">
          <Pack3D u={u} selected={sel} onPick={i => s.set({ selected: i })} explode={explode} auto={auto} showPlate={plate} flow={s.coolingFail ? 0 : s.flow} laneU={laneU} cutRow={cut} heatColors={heat} />
          <div className="ov">Drag to orbit · scroll to zoom · click cell<br />Hottest: <b>#{P.hot + 1} {fmt(P.maxT)} °C</b> · Avg <b>{fmt(P.avgT)} °C</b></div>
        </div>
        <div>
          <Card title="Display"><Seg options={[{ id: 'T', label: 'Temp' }, { id: 'Q', label: 'Heat' }, { id: 'dT', label: 'ΔT' }]} value={colorBy} onChange={setColorBy} />
            <div className="row"><Toggle label="Heat colours" checked={heat} onChange={setHeat} /><Toggle label="Auto-rotate" checked={auto} onChange={setAuto} /><Toggle label="Cold plate + flow" checked={plate} onChange={setPlate} /></div>
            <Slider label="Exploded view" value={explode} min={0} max={1} step={0.05} digits={2} onChange={setExplode} />
            <Slider label="Hide cell row (cut-away)" value={cut + 1} min={0} max={ROWS} onChange={v => setCut(v - 1)} hint="0 = show all rows" />
            {colorBy === 'T' ? <Legend lo={lo} hi={hi} /> : colorBy === 'Q' ? <Legend lo={0} hi={qmax} unit=' W' /> : <Legend lo={-6} hi={6} unit=' K' />}
          </Card>
          <Card title={`Cell #${sel + 1}`} sub={`Row ${Math.floor(sel / COLS) + 1}, column ${(sel % COLS) + 1}`}>
            <div className="grid g2" style={{ marginBottom: 0 }}>
              <Metric label="Temperature" value={fmt(P.grid.T[sel])} unit="°C" tone={P.grid.T[sel] > s.crit ? 'bad' : P.grid.T[sel] > s.warn ? 'warn' : 'ok'} />
              <Metric label="Heat" value={fmt(P.grid.Q[sel])} unit="W" />
              <Metric label="vs mean" value={fmt(P.grid.T[sel] - mean)} unit="K" />
              <Metric label="Neighbours" value={fmt(nb.reduce((a, j) => a + P.grid.T[j], 0) / nb.length)} unit="°C" sub={`${nb.length} adjacent`} />
            </div>
          </Card>
        </div>
      </div>
      <div className="grid g3">
        <Card title="Thermal inputs"><Controls keys={['ambient', 'loadC', 'flow']} reset={false} /></Card>
        <Card title="Fault injection"><Controls keys={['defect', 'defectCell', 'coolingFail']} /></Card>
        <Card title="Cooling"><Controls keys={['mode', 'coolant']} reset={false} /><div className="hint">{N} cells · {P.pump.toFixed(0)} W pump</div></Card>
      </div>
    </>
  );
}
