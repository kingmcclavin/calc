/**
 * Adaptive sampling of y = f(x) for plotting. Produces polylines in *world*
 * coordinates, split wherever the function is undefined or jumps
 * (vertical asymptotes, step functions), so the renderer never draws a
 * misleading connecting line.
 */
export interface SampleOptions {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** horizontal resolution in pixels */
  pixelWidth: number;
  pixelHeight: number;
}

export type Polyline = Float64Array; // x0,y0,x1,y1,...

export function sampleFunction(f: (x: number) => number, o: SampleOptions): Polyline[] {
  const { xMin, xMax, yMin, yMax, pixelWidth, pixelHeight } = o;
  const n = Math.max(32, Math.ceil(pixelWidth));
  const dx = (xMax - xMin) / n;
  const yRange = yMax - yMin;
  const pxPerY = pixelHeight / yRange;
  // Jumps bigger than this (in pixels) are investigated by subdivision
  const JUMP_PX = 6;
  const MAX_DEPTH = 10;
  // Cap on extra evaluations so pathological functions (sin(1/x)) stay fast
  let budget = n * 60;
  const evalAt = (x: number) => {
    budget--;
    return f(x);
  };

  const lines: Polyline[] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length >= 4) lines.push(Float64Array.from(cur));
    else if (cur.length === 2) lines.push(Float64Array.from(cur)); // isolated point
    cur = [];
  };
  const push = (x: number, y: number) => {
    cur.push(x, y);
  };

  const finite = (y: number) => Number.isFinite(y);

  /**
   * Recursively refine between (x0, y0) and (x1, y1). Appends points after
   * (x0, y0) up to and including (x1, y1), inserting breaks at discontinuities.
   */
  const refine = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const f0 = finite(y0);
    const f1 = finite(y1);
    if (!f0 && !f1) {
      flush();
      return;
    }
    if (f0 !== f1) {
      // Boundary of the domain: bisect to find the edge closely
      if (depth < MAX_DEPTH + 4 && budget > 0) {
        const xm = (x0 + x1) / 2;
        const ym = evalAt(xm);
        refine(x0, y0, xm, ym, depth + 1);
        refine(xm, ym, x1, y1, depth + 1);
        return;
      }
      if (f1) {
        flush();
        push(x1, y1);
      } else flush();
      return;
    }
    const jump = Math.abs(y1 - y0) * pxPerY;
    if (jump > JUMP_PX && depth < MAX_DEPTH && budget > 0) {
      // both ends off-screen on the same side: no need to resolve detail
      if ((y0 > yMax && y1 > yMax) || (y0 < yMin && y1 < yMin)) {
        if (depth > 2) {
          push(x1, y1);
          return;
        }
      }
      const xm = (x0 + x1) / 2;
      const ym = evalAt(xm);
      refine(x0, y0, xm, ym, depth + 1);
      refine(xm, ym, x1, y1, depth + 1);
      return;
    }
    if (jump > JUMP_PX && depth >= MAX_DEPTH) {
      // Still a big jump after maximum refinement: treat as a discontinuity
      // unless the segment is monotone and steep but continuous (check midpoint lies between).
      const xm = (x0 + x1) / 2;
      const ym = f(xm);
      const between = finite(ym) && (ym - y0) * (y1 - ym) >= 0;
      const ratio = finite(ym) ? Math.min(Math.abs(ym - y0), Math.abs(y1 - ym)) / Math.abs(y1 - y0) : 0;
      const sameSideOff = (y0 > yMax && y1 > yMax) || (y0 < yMin && y1 < yMin);
      if (!sameSideOff && (!between || ratio < 0.05)) {
        flush();
        push(x1, y1);
        return;
      }
    }
    push(x1, y1);
  };

  let xPrev = xMin;
  let yPrev = f(xPrev);
  if (finite(yPrev)) push(xPrev, yPrev);
  for (let i = 1; i <= n; i++) {
    const x = i === n ? xMax : xMin + i * dx;
    const y = f(x);
    refine(xPrev, yPrev, x, y, 0);
    xPrev = x;
    yPrev = y;
  }
  flush();
  return lines;
}
