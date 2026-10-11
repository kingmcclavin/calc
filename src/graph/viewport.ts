import type { GraphWindow } from '../state/store';

/** Choose a "nice" tick spacing (1, 2, 5 × 10ⁿ) for roughly `target` ticks across `range`. */
export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return nice * mag;
}

/** Format a tick label without floating noise (e.g. 0.30000000000000004 → 0.3). */
export function tickLabel(v: number, step: number): string {
  if (Math.abs(v) < step * 1e-9) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 1e-4) {
    const [m, e] = v.toExponential(2).split('e');
    return `${Number(m)}ᴇ${Number(e)}`;
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step / 10 ** Math.floor(Math.log10(step)) === 2.5 ? 1 : 0));
  return Number(v.toFixed(Math.min(decimals, 10))).toString();
}

export function zoomWindow(w: GraphWindow, factor: number, cx?: number, cy?: number): GraphWindow {
  const x0 = cx ?? (w.xMin + w.xMax) / 2;
  const y0 = cy ?? (w.yMin + w.yMax) / 2;
  const nw = {
    ...w,
    xMin: x0 + (w.xMin - x0) * factor,
    xMax: x0 + (w.xMax - x0) * factor,
    yMin: y0 + (w.yMin - y0) * factor,
    yMax: y0 + (w.yMax - y0) * factor,
  };
  return clampWindow(nw, w);
}

/** Keep windows inside sane floating-point limits. Returns `fallback` if invalid. */
export function clampWindow(w: GraphWindow, fallback: GraphWindow): GraphWindow {
  const xr = w.xMax - w.xMin;
  const yr = w.yMax - w.yMin;
  const ok =
    [w.xMin, w.xMax, w.yMin, w.yMax].every(Number.isFinite) &&
    xr > 1e-10 * Math.max(1, Math.abs(w.xMin)) &&
    yr > 1e-10 * Math.max(1, Math.abs(w.yMin)) &&
    xr < 1e12 &&
    yr < 1e12;
  return ok ? w : fallback;
}

/** Adjust the window so one unit on x equals one unit on y on screen. */
export function squareWindow(w: GraphWindow, pxW: number, pxH: number): GraphWindow {
  const xr = w.xMax - w.xMin;
  const yr = w.yMax - w.yMin;
  const unitsPerPxX = xr / pxW;
  const unitsPerPxY = yr / pxH;
  const u = Math.max(unitsPerPxX, unitsPerPxY);
  const cx = (w.xMin + w.xMax) / 2;
  const cy = (w.yMin + w.yMax) / 2;
  return { ...w, xMin: cx - (u * pxW) / 2, xMax: cx + (u * pxW) / 2, yMin: cy - (u * pxH) / 2, yMax: cy + (u * pxH) / 2 };
}

export type ZoomPreset = 'standard' | 'trig' | 'square' | 'decimal' | 'integer' | 'fit' | 'quadrant1';

export const ZOOM_PRESETS: Array<{ id: ZoomPreset; label: string; description: string }> = [
  { id: 'standard', label: 'Standard', description: '−10 to 10 on both axes' },
  { id: 'trig', label: 'Trig', description: 'x from −2π to 2π (or ±360°), y from −4 to 4' },
  { id: 'square', label: 'Square', description: 'Equal scale on both axes (circles look round)' },
  { id: 'decimal', label: 'Decimal', description: 'x from −4.7 to 4.7 with equal axis scale' },
  { id: 'integer', label: 'Integer', description: 'x from −47 to 47 with equal axis scale' },
  { id: 'fit', label: 'Fit', description: 'Keep x, fit y to the visible curves' },
  { id: 'quadrant1', label: 'Quadrant I', description: 'x and y from 0 to 10' },
];
