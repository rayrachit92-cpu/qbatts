import { clamp } from './physics/core';
const STOPS: [number, [number, number, number]][] = [
  [0, [38, 84, 255]], [0.22, [0, 190, 225]], [0.45, [50, 215, 120]], [0.65, [245, 220, 50]], [0.82, [255, 135, 30]], [1, [255, 45, 55]],
];
export function colorAt(u: number): [number, number, number] {
  const x = clamp(Number.isFinite(u) ? u : 0, 0, 1);
  for (let i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) {
    const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (x - a) / (b - a);
    return [0, 1, 2].map(k => Math.round(ca[k] + (cb[k] - ca[k]) * f)) as [number, number, number];
  }
  return STOPS[STOPS.length - 1][1];
}
export const cssColor = (u: number) => { const [r, g, b] = colorAt(u); return `rgb(${r},${g},${b})`; };
export const tempU = (T: number, lo = 15, hi = 75) => clamp((T - lo) / (hi - lo), 0, 1);
export const GRADIENT_CSS = `linear-gradient(90deg,${[0, 0.2, 0.4, 0.6, 0.8, 1].map(cssColor).join(',')})`;
