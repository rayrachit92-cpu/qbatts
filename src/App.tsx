import { useEffect } from 'react';
import { useStore, PRESETS, PageId } from './store';
import { usePack } from './derive';
import { PAGES } from './pages';
import { Btn, Chips, fmt } from './components/ui';

export default function App() {
  const { page, go, preset, applyPreset, reset } = useStore();
  const P = usePack();
  useEffect(() => {
    const read = () => { const h = window.location.hash.replace('#/', '') as PageId; if (PAGES.some(p => p.id === h)) go(h); };
    read(); window.addEventListener('hashchange', read); return () => window.removeEventListener('hashchange', read);
  }, [go]);
  const nav = (id: PageId) => { window.location.hash = '/' + id; go(id); };
  const Cur = (PAGES.find(p => p.id === page) ?? PAGES[0]).Comp;
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><b>Q_BATTS</b><span>EV battery thermal intelligence</span></div>
        <nav className="nav">{PAGES.map((p, i) => <button key={p.id} className={p.id === page ? 'on' : ''} onClick={() => nav(p.id)}><i>{String(i + 1).padStart(2, '0')}</i>{p.label}</button>)}</nav>
        <div className="sidefoot">Shared state: ambient, load, charge rate, cooling, SOC, ageing and fault settings carry across every page.<br /><br />All data is simulated by a reduced-order physics-inspired model.</div>
      </aside>
      <main className="main">
        <div className="topbar">
          <span className="lbl">Global scenario</span><Chips items={PRESETS.map(p => ({ id: p.id, label: p.label, title: p.note }))} active={preset} onPick={applyPreset} /><Btn onClick={reset}>Reset all</Btn>
          <span className="live"><span>T̄ <b>{fmt(P.avgT)}°C</b></span><span>Tmax <b>{fmt(P.maxT)}°C</b></span><span>SOH <b>{fmt(P.soh * 100)}%</b></span></span>
        </div>
        <Cur />
      </main>
    </div>
  );
}
