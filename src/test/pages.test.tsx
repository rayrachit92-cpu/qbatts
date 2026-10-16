import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { PAGES } from '../pages';
import { useStore } from '../store';

vi.mock('../components/Pack3D', () => ({ default: (p: any) => <div data-testid="pack3d">{p.u.length} cells<button aria-label="pick cell 5" onClick={() => p.onPick(5)} /></div> }));
beforeEach(() => { cleanup(); act(() => useStore.getState().reset()); });
const bad = (t: string) => /NaN|Infinity|undefined/.test(t);

describe.each(PAGES)('page: $label', ({ Comp, id }) => {
  it('renders without NaN / Infinity', () => {
    const { container } = render(<Comp />);
    expect(container.textContent!.length).toBeGreaterThan(200);
    expect(bad(container.textContent!)).toBe(false);
  });
  it('every slider works at min / mid / max', () => {
    const { container } = render(<Comp />);
    const n = container.querySelectorAll('input[type=range]').length;
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) for (const pos of ['min', 'max', 'mid']) {
      const el = container.querySelectorAll<HTMLInputElement>('input[type=range]')[i]; if (!el) continue;
      const lo = +el.min, hi = +el.max, st = +(el.step || 1), raw = pos === 'min' ? lo : pos === 'max' ? hi : (lo + hi) / 2, v = Math.min(hi, Math.max(lo, lo + Math.round((raw - lo) / st) * st)); // snap to step like a browser
      fireEvent.change(el, { target: { value: String(v) } });
      expect(bad(container.textContent!), `${id} slider "${el.getAttribute('aria-label')}" @${pos}`).toBe(false);
    }
  });
  it('every button / toggle / tab works', () => {
    const { container } = render(<Comp />);
    const n = container.querySelectorAll('button, input[type=checkbox]').length;
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const el = container.querySelectorAll<HTMLElement>('button, input[type=checkbox]')[i]; if (!el) continue;
      fireEvent.click(el);
      expect(bad(container.textContent!), `${id} control "${el.getAttribute('aria-label') ?? el.textContent}"`).toBe(false);
    }
  });
});

describe('shared state links pages', () => {
  it('ambient + defect set on one page changes values on another', () => {
    const a = render(PAGES.find(p => p.id === 'hotspot')!.Comp as any ? <></> : <></>); a.unmount();
    const H = PAGES.find(p => p.id === 'hotspot')!.Comp, O = PAGES.find(p => p.id === 'overview')!.Comp;
    const o1 = render(<O />); const before = o1.container.textContent; o1.unmount();
    const h = render(<H />); const defect = h.container.querySelector<HTMLInputElement>('input[aria-label="Internal-short severity"]')!;
    fireEvent.change(defect, { target: { value: '80' } }); h.unmount();
    const o2 = render(<O />); expect(o2.container.textContent).not.toEqual(before);
    expect(useStore.getState().defect).toBe(80);
  });
});
