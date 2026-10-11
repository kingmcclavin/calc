import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { GraphWindow } from '../state/store';
import { sampleFunction, type Polyline } from './sampler';
import { clampWindow, niceStep, tickLabel, zoomWindow } from './viewport';

export interface PlotCurve {
  id: string;
  label: string;
  f: (x: number) => number;
  color: string;
  dashed?: boolean;
}
export interface PlotPoint {
  x: number;
  y: number;
  color: string;
  label?: string;
  emphasis?: boolean;
}
export interface Shade {
  f: (x: number) => number;
  a: number;
  b: number;
  color: string;
}
export interface TangentLine {
  x0: number;
  y0: number;
  m: number;
  color: string;
}
export interface TraceState {
  /** curve being traced, or null for a free cursor */
  curveId: string | null;
  x: number;
  /** only used for a free cursor */
  y?: number;
}

interface Props {
  window: GraphWindow;
  onWindowChange: (w: GraphWindow) => void;
  curves: PlotCurve[];
  points?: PlotPoint[];
  scatter?: { xs: number[]; ys: number[]; color: string };
  shade?: Shade | null;
  tangent?: TangentLine | null;
  trace?: TraceState | null;
  onTrace?: (t: TraceState | null) => void;
  showGrid?: boolean;
  showAxes?: boolean;
  showLabels?: boolean;
  lineWidth?: number;
  ariaLabel?: string;
  onSize?: (w: number, h: number) => void;
}

interface Theme {
  bg: string;
  grid: string;
  gridMajor: string;
  axis: string;
  label: string;
  text: string;
  surface: string;
  font: string;
}

function readTheme(el: HTMLElement): Theme {
  const cs = getComputedStyle(el);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    bg: v('--graph-bg'),
    grid: v('--graph-grid'),
    gridMajor: v('--graph-grid-major'),
    axis: v('--graph-axis'),
    label: v('--graph-label'),
    text: v('--text'),
    surface: v('--surface'),
    font: v('--font-sans') || 'system-ui',
  };
}

const CLAMP = 1e5;
const clampPx = (v: number) => (v > CLAMP ? CLAMP : v < -CLAMP ? -CLAMP : v);

export function GraphCanvas(props: Props) {
  const {
    window: win,
    onWindowChange,
    curves,
    points = [],
    scatter,
    shade,
    tangent,
    trace,
    onTrace,
    showGrid = true,
    showAxes = true,
    showLabels = true,
    lineWidth = 2.5,
    ariaLabel = 'Graph',
    onSize,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });
  const [themeTick, setThemeTick] = useState(0);
  // Live window during gestures; committed to the store when the gesture ends
  const [live, setLiveState] = useState<GraphWindow>(win);
  const liveRef = useRef(live);
  // keep the ref current synchronously so gesture handlers never read a stale window
  const setLive = useCallback((w: GraphWindow) => {
    liveRef.current = w;
    setLiveState(w);
  }, []);
  const interacting = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interacting.current) setLive(win);
  }, [win, setLive]);

  const commitSoon = useCallback(
    (w: GraphWindow, delay = 250) => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        interacting.current = false;
        onWindowChange(w);
      }, delay);
    },
    [onWindowChange],
  );

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  // Resize handling
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)), dpr: Math.min(window.devicePixelRatio || 1, 3) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.w > 1) onSize?.(size.w, size.h);
  }, [size.w, size.h, onSize]);

  // Re-read colors when the theme changes
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  /* ------------------------------ coordinate maps ----------------------------- */
  const toPx = useCallback(
    (x: number, y: number, w: GraphWindow = liveRef.current) => {
      const { w: W, h: H } = size;
      return [((x - w.xMin) / (w.xMax - w.xMin)) * W, ((w.yMax - y) / (w.yMax - w.yMin)) * H] as const;
    },
    [size],
  );
  const toWorld = useCallback(
    (px: number, py: number, w: GraphWindow = liveRef.current) => {
      const { w: W, h: H } = size;
      return [w.xMin + (px / W) * (w.xMax - w.xMin), w.yMax - (py / H) * (w.yMax - w.yMin)] as const;
    },
    [size],
  );

  /* ---------------------------------- drawing --------------------------------- */
  const sampleCache = useRef(new Map<string, { key: string; f: (x: number) => number; lines: Polyline[] }>());

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || size.w < 2) return;
    const { w: W, h: H, dpr } = size;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const th = readTheme(wrap);
    const w = live;
    const sx = W / (w.xMax - w.xMin);
    const sy = H / (w.yMax - w.yMin);
    const X = (x: number) => clampPx((x - w.xMin) * sx);
    const Y = (y: number) => clampPx((w.yMax - y) * sy);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    // ---- grid
    const xStep = w.xScl > 0 && W / ((w.xMax - w.xMin) / w.xScl) >= 6 ? w.xScl : niceStep(w.xMax - w.xMin, W / 90);
    const yStep = w.yScl > 0 && H / ((w.yMax - w.yMin) / w.yScl) >= 6 ? w.yScl : niceStep(w.yMax - w.yMin, H / 70);
    const lines = (step: number, from: number, to: number, cb: (v: number) => void) => {
      const start = Math.ceil(from / step);
      const end = Math.floor(to / step);
      if (end - start > 2000) return;
      for (let i = start; i <= end; i++) cb(i * step);
    };
    if (showGrid) {
      // minor
      const mxs = xStep / 5;
      const mys = yStep / 5;
      ctx.lineWidth = 1;
      if (mxs * sx >= 9 && mys * sy >= 9) {
        ctx.strokeStyle = th.grid;
        ctx.beginPath();
        lines(mxs, w.xMin, w.xMax, (v) => {
          const px = Math.round(X(v)) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, H);
        });
        lines(mys, w.yMin, w.yMax, (v) => {
          const py = Math.round(Y(v)) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(W, py);
        });
        ctx.stroke();
      }
      ctx.strokeStyle = th.gridMajor;
      ctx.beginPath();
      lines(xStep, w.xMin, w.xMax, (v) => {
        const px = Math.round(X(v)) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, H);
      });
      lines(yStep, w.yMin, w.yMax, (v) => {
        const py = Math.round(Y(v)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
      });
      ctx.stroke();
    }

    // ---- axes
    const ax = Math.round(X(0)) + 0.5; // y-axis position
    const ay = Math.round(Y(0)) + 0.5; // x-axis position
    const yAxisVisible = ax >= 0 && ax <= W;
    const xAxisVisible = ay >= 0 && ay <= H;
    if (showAxes) {
      ctx.strokeStyle = th.axis;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      if (xAxisVisible) {
        ctx.moveTo(0, ay);
        ctx.lineTo(W, ay);
      }
      if (yAxisVisible) {
        ctx.moveTo(ax, 0);
        ctx.lineTo(ax, H);
      }
      // tick marks
      lines(xStep, w.xMin, w.xMax, (v) => {
        if (!xAxisVisible) return;
        const px = Math.round(X(v)) + 0.5;
        ctx.moveTo(px, ay - 4);
        ctx.lineTo(px, ay + 4);
      });
      lines(yStep, w.yMin, w.yMax, (v) => {
        if (!yAxisVisible) return;
        const py = Math.round(Y(v)) + 0.5;
        ctx.moveTo(ax - 4, py);
        ctx.lineTo(ax + 4, py);
      });
      ctx.stroke();
    }

    // ---- labels
    if (showLabels) {
      ctx.font = `500 11px ${th.font}`;
      ctx.fillStyle = th.label;
      const pad = 4;
      const labelBg = (text: string, x: number, y: number, align: CanvasTextAlign, base: CanvasTextBaseline) => {
        ctx.textAlign = align;
        ctx.textBaseline = base;
        const m = ctx.measureText(text);
        const tw = m.width;
        let lx = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
        let ly = base === 'top' ? y : base === 'bottom' ? y - 11 : y - 6;
        lx = Math.round(lx);
        ly = Math.round(ly);
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = th.bg;
        ctx.fillRect(lx - 2, ly - 1, tw + 4, 13);
        ctx.restore();
        ctx.fillText(text, x, y);
      };
      const xLabelY = xAxisVisible ? Math.min(Math.max(ay + pad, 2), H - 16) : H - 16;
      lines(xStep, w.xMin, w.xMax, (v) => {
        if (Math.abs(v) < xStep / 2 && yAxisVisible && xAxisVisible) return;
        const px = X(v);
        if (px < 12 || px > W - 12) return;
        labelBg(tickLabel(v, xStep), px, xLabelY, 'center', 'top');
      });
      const yLabelX = yAxisVisible ? Math.max(ax - pad, 30) : 30;
      lines(yStep, w.yMin, w.yMax, (v) => {
        if (Math.abs(v) < yStep / 2 && yAxisVisible && xAxisVisible) return;
        const py = Y(v);
        if (py < 10 || py > H - 10) return;
        labelBg(tickLabel(v, yStep), yAxisVisible && ax < 30 ? ax + pad : yLabelX, py, yAxisVisible && ax < 30 ? 'left' : 'right', 'middle');
      });
      if (xAxisVisible && yAxisVisible) labelBg('0', ax - pad, ay + pad, 'right', 'top');
    }

    // ---- integral shading
    if (shade) {
      const a = Math.max(Math.min(shade.a, shade.b), w.xMin - (w.xMax - w.xMin));
      const b = Math.min(Math.max(shade.a, shade.b), w.xMax + (w.xMax - w.xMin));
      const n = Math.max(2, Math.ceil(((b - a) * sx) / 2));
      ctx.save();
      ctx.fillStyle = shade.color;
      ctx.globalAlpha = 0.22;
      let open = false;
      const y0 = Y(0);
      for (let i = 0; i <= n; i++) {
        const x = a + ((b - a) * i) / n;
        const y = shade.f(x);
        if (!Number.isFinite(y)) {
          if (open) {
            ctx.lineTo(X(x), y0);
            ctx.closePath();
            ctx.fill();
            open = false;
          }
          continue;
        }
        if (!open) {
          ctx.beginPath();
          ctx.moveTo(X(x), y0);
          open = true;
        }
        ctx.lineTo(X(x), Y(y));
        if (i === n) {
          ctx.lineTo(X(x), y0);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ---- curves
    const opts = { xMin: w.xMin, xMax: w.xMax, yMin: w.yMin, yMax: w.yMax, pixelWidth: W, pixelHeight: H };
    const optsKey = `${w.xMin},${w.xMax},${w.yMin},${w.yMax},${W},${H}`;
    const seen = new Set<string>();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const c of curves) {
      seen.add(c.id);
      const cached = sampleCache.current.get(c.id);
      let polylines: Polyline[];
      if (cached && cached.key === optsKey && cached.f === c.f) polylines = cached.lines;
      else {
        polylines = sampleFunction(c.f, opts);
        sampleCache.current.set(c.id, { key: optsKey, f: c.f, lines: polylines });
      }
      ctx.strokeStyle = c.color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(c.dashed ? [7, 6] : []);
      for (const pl of polylines) {
        ctx.beginPath();
        if (pl.length === 2) {
          // isolated point
          ctx.fillStyle = c.color;
          ctx.arc(X(pl[0]), Y(pl[1]), lineWidth / 1.5, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.moveTo(X(pl[0]), Y(pl[1]));
        for (let i = 2; i < pl.length; i += 2) ctx.lineTo(X(pl[i]), Y(pl[i + 1]));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const k of [...sampleCache.current.keys()]) if (!seen.has(k)) sampleCache.current.delete(k);

    // ---- scatter
    if (scatter) {
      ctx.fillStyle = scatter.color;
      ctx.strokeStyle = th.bg;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < scatter.xs.length; i++) {
        const px = X(scatter.xs[i]);
        const py = Y(scatter.ys[i]);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        ctx.beginPath();
        ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // ---- tangent line
    if (tangent) {
      ctx.save();
      ctx.strokeStyle = tangent.color;
      ctx.lineWidth = 1.75;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      const ya = tangent.y0 + tangent.m * (w.xMin - tangent.x0);
      const yb = tangent.y0 + tangent.m * (w.xMax - tangent.x0);
      ctx.moveTo(X(w.xMin), Y(ya));
      ctx.lineTo(X(w.xMax), Y(yb));
      ctx.stroke();
      ctx.restore();
    }

    // ---- points of interest
    const drawPoint = (p: PlotPoint) => {
      const px = X(p.x);
      const py = Y(p.y);
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) return;
      ctx.beginPath();
      ctx.arc(px, py, p.emphasis ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fillStyle = p.emphasis ? p.color : th.bg;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p.emphasis ? th.bg : p.color;
      ctx.stroke();
      if (p.emphasis) {
        ctx.beginPath();
        ctx.arc(px, py, 9.5, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p.label) {
        ctx.font = `600 12px ${th.font}`;
        const tw = ctx.measureText(p.label).width;
        let lx = px + 12;
        let ly = py - 26;
        if (lx + tw + 12 > W) lx = px - tw - 22;
        if (ly < 4) ly = py + 12;
        ctx.fillStyle = th.surface;
        ctx.globalAlpha = 0.92;
        roundRect(ctx, lx, ly, tw + 12, 20, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = th.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, lx + 6, ly + 10.5);
      }
    };
    points.forEach(drawPoint);

    // ---- trace cursor
    if (trace) {
      const curve = trace.curveId ? curves.find((c) => c.id === trace.curveId) : null;
      const ty = curve ? curve.f(trace.x) : trace.y ?? NaN;
      const color = curve ? curve.color : th.text;
      const px = X(trace.x);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, 0);
      ctx.lineTo(Math.round(px) + 0.5, H);
      if (Number.isFinite(ty)) {
        const py = Math.round(Y(ty)) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
      }
      ctx.stroke();
      ctx.restore();
      if (Number.isFinite(ty)) drawPoint({ x: trace.x, y: ty, color, emphasis: true });
    }
  }, [size, live, curves, points, scatter, shade, tangent, trace, showGrid, showAxes, showLabels, lineWidth, themeTick]);

  /* ------------------------------- interactions ------------------------------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    mode: 'pan' | 'pinch' | 'trace' | null;
    startWin: GraphWindow;
    startX: number;
    startY: number;
    moved: boolean;
    pinchDist?: number;
    pinchMid?: [number, number];
  } | null>(null);

  const localPos = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Pick the curve nearest to a pixel position (vertical distance at that x). */
  const pickCurve = useCallback(
    (px: number, py: number, radius: number) => {
      const [x] = toWorld(px, py);
      let best: { id: string; d: number } | null = null;
      for (const c of curves) {
        const y = c.f(x);
        if (!Number.isFinite(y)) continue;
        const d = Math.abs(toPx(x, y)[1] - py);
        if (d <= radius && (!best || d < best.d)) best = { id: c.id, d };
      }
      return best ? { id: best.id, x } : null;
    },
    [curves, toPx, toWorld],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
    const p = localPos(e);
    pointers.current.set(e.pointerId, p);
    interacting.current = true;
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: 'pinch',
        startWin: liveRef.current,
        startX: 0,
        startY: 0,
        moved: true,
        pinchDist: Math.hypot(a.x - b.x, a.y - b.y),
        pinchMid: [(a.x + b.x) / 2, (a.y + b.y) / 2],
      };
      return;
    }
    // Start dragging the trace cursor if the pointer lands on it
    let mode: 'pan' | 'trace' = 'pan';
    if (trace?.curveId) {
      const c = curves.find((k) => k.id === trace.curveId);
      const ty = c?.f(trace.x);
      if (c && ty !== undefined && Number.isFinite(ty)) {
        const [tx, tyPx] = toPx(trace.x, ty);
        if (Math.hypot(tx - p.x, tyPx - p.y) < (e.pointerType === 'touch' ? 36 : 22)) mode = 'trace';
      }
    }
    gesture.current = { mode, startWin: liveRef.current, startX: p.x, startY: p.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPos(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    const { w: W, h: H } = size;
    if (g.mode === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const factor = (g.pinchDist ?? dist) / Math.max(dist, 1);
      const sw = g.startWin;
      // world point under the initial midpoint stays under the current midpoint
      const wx = sw.xMin + (g.pinchMid![0] / W) * (sw.xMax - sw.xMin);
      const wy = sw.yMax - (g.pinchMid![1] / H) * (sw.yMax - sw.yMin);
      const xr = (sw.xMax - sw.xMin) * factor;
      const yr = (sw.yMax - sw.yMin) * factor;
      const xMin = wx - (mid[0] / W) * xr;
      const yMax = wy + (mid[1] / H) * yr;
      setLive(clampWindow({ ...sw, xMin, xMax: xMin + xr, yMax, yMin: yMax - yr }, liveRef.current));
      return;
    }
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    g.moved = true;
    if (g.mode === 'trace') {
      const [x] = toWorld(p.x, p.y);
      onTrace?.({ curveId: trace!.curveId, x });
      return;
    }
    if (g.mode === 'pan') {
      canvasRef.current?.classList.add('dragging');
      const sw = g.startWin;
      const ux = ((sw.xMax - sw.xMin) / W) * dx;
      const uy = ((sw.yMax - sw.yMin) / H) * dy;
      setLive({ ...sw, xMin: sw.xMin - ux, xMax: sw.xMax - ux, yMin: sw.yMin + uy, yMax: sw.yMax + uy });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    const p = localPos(e);
    pointers.current.delete(e.pointerId);
    canvasRef.current?.classList.remove('dragging');
    if (g?.mode === 'pinch') {
      if (pointers.current.size === 0) {
        gesture.current = null;
        commitSoon(liveRef.current, 0);
      } else {
        // continue as a pan with the remaining finger
        const [rest] = [...pointers.current.values()];
        gesture.current = { mode: 'pan', startWin: liveRef.current, startX: rest.x, startY: rest.y, moved: true };
      }
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (!g.moved) {
      // A tap/click: trace the nearest curve, or place a free cursor
      const hit = pickCurve(p.x, p.y, e.pointerType === 'touch' ? 34 : 20);
      if (hit) onTrace?.({ curveId: hit.id, x: hit.x });
      else {
        const [x, y] = toWorld(p.x, p.y);
        onTrace?.({ curveId: null, x, y });
      }
      interacting.current = false;
      return;
    }
    if (g.mode === 'pan') commitSoon(liveRef.current, 0);
    else interacting.current = false;
  };

  // Wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      const factor = Math.exp(e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.0018));
      const cur = liveRef.current;
      const [cx, cy] = [cur.xMin + (px / r.width) * (cur.xMax - cur.xMin), cur.yMax - (py / r.height) * (cur.yMax - cur.yMin)];
      const next = zoomWindow(cur, Math.min(Math.max(factor, 0.5), 2), cx, cy);
      interacting.current = true;
      setLive(next);
      commitSoon(next);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [commitSoon, setLive]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const w = liveRef.current;
    const xr = w.xMax - w.xMin;
    const yr = w.yMax - w.yMin;
    const big = e.shiftKey ? 10 : 1;
    const setW = (nw: GraphWindow) => {
      setLive(nw);
      onWindowChange(nw);
    };
    if (trace?.curveId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const step = (xr / 100) * big * (e.key === 'ArrowLeft' ? -1 : 1);
      const x = trace.x + step;
      onTrace?.({ curveId: trace.curveId, x });
      // scroll the window when the cursor leaves it
      if (x < w.xMin || x > w.xMax) setW({ ...w, xMin: w.xMin + step, xMax: w.xMax + step });
      return;
    }
    if (trace?.curveId && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && curves.length) {
      e.preventDefault();
      const i = curves.findIndex((c) => c.id === trace.curveId);
      const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + curves.length) % curves.length;
      onTrace?.({ curveId: curves[j].id, x: trace.x });
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
        setW({ ...w, xMin: w.xMin - xr * 0.1 * big, xMax: w.xMax - xr * 0.1 * big });
        break;
      case 'ArrowRight':
        setW({ ...w, xMin: w.xMin + xr * 0.1 * big, xMax: w.xMax + xr * 0.1 * big });
        break;
      case 'ArrowUp':
        setW({ ...w, yMin: w.yMin + yr * 0.1 * big, yMax: w.yMax + yr * 0.1 * big });
        break;
      case 'ArrowDown':
        setW({ ...w, yMin: w.yMin - yr * 0.1 * big, yMax: w.yMax - yr * 0.1 * big });
        break;
      case '+':
      case '=':
        setW(zoomWindow(w, 0.5));
        break;
      case '-':
      case '_':
        setW(zoomWindow(w, 2));
        break;
      case 'Enter':
      case 't':
        if (curves.length) onTrace?.({ curveId: trace?.curveId ?? curves[0].id, x: trace?.x ?? (w.xMin + w.xMax) / 2 });
        break;
      case 'Escape':
        onTrace?.(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div className="graph-canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`${ariaLabel}. Arrow keys pan, plus and minus zoom, Enter starts tracing; while tracing, left and right move along the curve and up and down switch curves.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
