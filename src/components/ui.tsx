import { ReactNode } from 'react';
import { GRADIENT_CSS } from '../colors';

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, hint, digits = 0 }:
  { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string; digits?: number }) {
  return (
    <div className="sl">
      <div className="sl-h"><span>{label}</span><b>{value.toFixed(digits)}{unit}</b></div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="tg"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={e => onChange(e.target.checked)} /><span className="kn" />{label}</label>;
}
export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="seg" role="tablist">{options.map(o => <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}</div>;
}
export function Chips({ items, active, onPick }: { items: { id: string; label: string; title?: string }[]; active?: string; onPick: (id: string) => void }) {
  return <>{items.map(i => <button key={i.id} title={i.title} className={'chip' + (active === i.id ? ' on' : '')} onClick={() => onPick(i.id)}>{i.label}</button>)}</>;
}
export function Card({ title, sub, right, children }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return <section className="card">{title && <h3><span>{title}</span>{right}</h3>}{sub && <div className="sub">{sub}</div>}{children}</section>;
}
export function Metric({ label, value, unit, sub, tone = 'info' }: { label: string; value: string | number; unit?: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' | 'info' }) {
  return <div className={'metric ' + tone}><div className="l">{label}</div><div className="v">{value}{unit && <small>{unit}</small>}</div>{sub && <div className="s">{sub}</div>}</div>;
}
export function PageHead({ kicker, title, desc, meta }: { kicker: string; title: string; desc: string; meta?: [string, string][] }) {
  return (
    <header>
      <div className="row" style={{ gap: 10 }}><span className="kick">{kicker}</span><span className="sim" title="All values come from a reduced-order physics-inspired model running in your browser">Simulated data</span></div>
      <h1>{title}</h1><p className="desc">{desc}</p>
      {meta && <div className="meta">{meta.map(([k, v]) => <span key={k}>{k}: <b>{v}</b></span>)}</div>}
    </header>
  );
}
export const Btn = ({ children, onClick, pri, reset }: { children: ReactNode; onClick: () => void; pri?: boolean; reset?: boolean }) =>
  <button className={'btn' + (pri ? ' pri' : '') + (reset ? ' reset' : '')} onClick={onClick}>{children}</button>;
export function Insights({ items }: { items: { tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }[] }) {
  return <ul className="ins">{items.map((i, k) => <li key={k} className={i.tone}>{i.text}</li>)}</ul>;
}
export function Legend({ lo, hi, unit = '°C' }: { lo: number; hi: number; unit?: string }) {
  return <><div className="legend" style={{ background: GRADIENT_CSS }} /><div><span>{lo.toFixed(0)}{unit}</span><span>{((lo + hi) / 2).toFixed(0)}{unit}</span><span>{hi.toFixed(0)}{unit}</span></div></>;
}
export const AX = { stroke: '#52647b', fontSize: 11 };
export const GRID = '#1c2a3d';
export const TT = { contentStyle: { background: '#0d141f', border: '1px solid #26384f', borderRadius: 6, fontSize: 12 }, labelStyle: { color: '#7d90a8' }, itemStyle: { padding: 0 } };
export const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
export const tone = (x: number, warn: number, bad: number): 'ok' | 'warn' | 'bad' => (x >= bad ? 'bad' : x >= warn ? 'warn' : 'ok');
