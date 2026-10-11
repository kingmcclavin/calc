/**
 * Numerical analysis routines: root finding, extrema, derivatives, integrals.
 * All functions take a plain `(x) => number` and must cope with NaN/±Infinity.
 */
export type Fn = (x: number) => number;

const EPS = 2.220446049250313e-16;

/** Brent's method on a bracketing interval [a, b] with f(a)·f(b) ≤ 0. */
export function brentRoot(f: Fn, a: number, b: number, tol = 1e-14, maxIter = 200): number | null {
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm > 0 ? tol1 : -tol1;
    fb = f(b);
    if (!Number.isFinite(fb)) return null;
  }
  return b;
}

/** Golden-section/Brent minimisation of f on [a, b]. Returns the abscissa. */
export function brentMin(f: Fn, a: number, b: number, tol = 1e-11, maxIter = 200): number {
  const CG = 0.3819660112501051;
  let x = a + CG * (b - a);
  let w = x;
  let v = x;
  let fx = f(x);
  let fw = fx;
  let fv = fx;
  let d = 0;
  let e = 0;
  for (let i = 0; i < maxIter; i++) {
    const xm = 0.5 * (a + b);
    const tol1 = tol * Math.abs(x) + 1e-13;
    const tol2 = 2 * tol1;
    if (Math.abs(x - xm) <= tol2 - 0.5 * (b - a)) break;
    let useGolden = true;
    if (Math.abs(e) > tol1) {
      const r = (x - w) * (fx - fv);
      let q = (x - v) * (fx - fw);
      let p = (x - v) * q - (x - w) * r;
      q = 2 * (q - r);
      if (q > 0) p = -p;
      q = Math.abs(q);
      const etemp = e;
      e = d;
      if (!(Math.abs(p) >= Math.abs(0.5 * q * etemp) || p <= q * (a - x) || p >= q * (b - x))) {
        d = p / q;
        const u = x + d;
        if (u - a < tol2 || b - u < tol2) d = xm - x >= 0 ? tol1 : -tol1;
        useGolden = false;
      }
    }
    if (useGolden) {
      e = x >= xm ? a - x : b - x;
      d = CG * e;
    }
    const u = Math.abs(d) >= tol1 ? x + d : x + (d >= 0 ? tol1 : -tol1);
    let fu = f(u);
    if (Number.isNaN(fu)) fu = Infinity;
    if (fu <= fx) {
      if (u >= x) a = x;
      else b = x;
      v = w;
      fv = fw;
      w = x;
      fw = fx;
      x = u;
      fx = fu;
    } else {
      if (u < x) a = u;
      else b = u;
      if (fu <= fw || w === x) {
        v = w;
        fv = fw;
        w = u;
        fw = fu;
      } else if (fu <= fv || v === x || v === w) {
        v = u;
        fv = fu;
      }
    }
  }
  return x;
}

/** Numerical derivative using Ridders' extrapolation of central differences. */
export function derivative(f: Fn, x: number): number {
  const f0 = f(x);
  if (!Number.isFinite(f0)) return NaN;
  let h = 1e-2 * Math.max(1, Math.abs(x));
  const CON = 1.4;
  const CON2 = CON * CON;
  const NTAB = 10;
  const a: number[][] = Array.from({ length: NTAB }, () => new Array(NTAB).fill(0));
  a[0][0] = (f(x + h) - f(x - h)) / (2 * h);
  let err = Infinity;
  let ans = a[0][0];
  for (let i = 1; i < NTAB; i++) {
    h /= CON;
    a[0][i] = (f(x + h) - f(x - h)) / (2 * h);
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      a[j][i] = (a[j - 1][i] * fac - a[j - 1][i - 1]) / (fac - 1);
      fac *= CON2;
      const errt = Math.max(Math.abs(a[j][i] - a[j - 1][i]), Math.abs(a[j][i] - a[j - 1][i - 1]));
      if (errt <= err) {
        err = errt;
        ans = a[j][i];
      }
    }
    if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break;
  }
  if (!Number.isFinite(ans)) return NaN;
  // Check the two one-sided slopes agree; otherwise the derivative does not exist (corner/cusp/jump)
  const hh = 1e-6 * Math.max(1, Math.abs(x));
  const left = (f0 - f(x - hh)) / hh;
  const right = (f(x + hh) - f0) / hh;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  if (Math.abs(left - right) > 1e-3 * scale) return NaN;
  // round tiny noise
  return Math.abs(ans) < 1e-11 * Math.max(1, Math.abs(f0)) ? 0 : ans;
}

/* Gauss–Kronrod 7/15 nodes and weights */
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780, 0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

function gk15(f: Fn, a: number, b: number): { value: number; error: number; ok: boolean } {
  const c = 0.5 * (a + b);
  const h = 0.5 * (b - a);
  const fc = f(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  let ok = Number.isFinite(fc);
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    if (!Number.isFinite(f1) || !Number.isFinite(f2)) ok = false;
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  return { value: resK * h, error: Math.abs((resK - resG) * h), ok };
}

export interface IntegralResult {
  value: number;
  error: number;
  /** false when the integrand hit non-finite values or tolerance was not met */
  reliable: boolean;
}

/** Adaptive Gauss–Kronrod integration on [a, b]. */
export function integrate(f: Fn, a: number, b: number, tol = 1e-10): IntegralResult {
  if (a === b) return { value: 0, error: 0, reliable: true };
  if (a > b) {
    const r = integrate(f, b, a, tol);
    return { ...r, value: -r.value };
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { value: NaN, error: NaN, reliable: false };
  type Seg = { a: number; b: number; value: number; error: number; ok: boolean };
  const segs: Seg[] = [];
  const first = gk15(f, a, b);
  segs.push({ a, b, ...first });
  let total = first.value;
  let errTotal = first.error;
  let iterations = 0;
  while (iterations++ < 2000) {
    if (errTotal <= Math.max(tol, tol * Math.abs(total)) && segs.every((s) => s.ok)) break;
    // split the segment with largest error (or a non-finite one)
    let worst = 0;
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      const w = segs[worst];
      if ((!s.ok && w.ok) || (s.ok === w.ok && s.error > w.error)) worst = i;
    }
    const s = segs[worst];
    const m = 0.5 * (s.a + s.b);
    if (m <= s.a || m >= s.b) break; // cannot subdivide further
    const l = gk15(f, s.a, m);
    const r = gk15(f, m, s.b);
    segs.splice(worst, 1, { a: s.a, b: m, ...l }, { a: m, b: s.b, ...r });
    total = 0;
    errTotal = 0;
    for (const t of segs) {
      total += t.value;
      errTotal += t.error;
    }
  }
  const okAll = segs.every((s) => s.ok);
  const reliable = okAll && Number.isFinite(total) && errTotal <= Math.max(1e-6, 1e-6 * Math.abs(total));
  return { value: okAll ? total : NaN, error: errTotal, reliable };
}

/** Bracket sign changes / near-zero dips over [a, b] and refine every root found. */
export function findRoots(f: Fn, a: number, b: number, samples = 2000): number[] {
  const roots: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = a + ((b - a) * i) / samples;
    xs.push(x);
    ys.push(f(x));
  }
  const span = b - a;
  const addRoot = (r: number) => {
    if (roots.some((q) => Math.abs(q - r) < span * 1e-9 + 1e-12)) return;
    roots.push(r);
  };
  for (let i = 0; i < samples; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) {
      addRoot(xs[i]);
      continue;
    }
    if (y0 * y1 < 0) {
      const r = brentRoot(f, xs[i], xs[i + 1]);
      if (r === null) continue;
      // reject sign changes caused by poles (|f| grows instead of vanishing)
      const fr = Math.abs(f(r));
      const scale = Math.max(Math.abs(y0), Math.abs(y1));
      if (fr <= 1e-6 * Math.max(1, scale) || fr < 1e-9) addRoot(r);
    }
  }
  if (ys[samples] === 0) addRoot(xs[samples]);
  // Even-multiplicity roots (touching the axis): local minima of |f| that reach ~0
  for (let i = 1; i < samples; i++) {
    const y0 = Math.abs(ys[i - 1]);
    const y1 = Math.abs(ys[i]);
    const y2 = Math.abs(ys[i + 1]);
    if (!(y1 <= y0 && y1 <= y2) || ys[i - 1] * ys[i + 1] < 0) continue;
    if (!Number.isFinite(y0 + y1 + y2)) continue;
    const xm = brentMin((x) => Math.abs(f(x)), xs[i - 1], xs[i + 1]);
    const fm = Math.abs(f(xm));
    const localScale = Math.max(y0, y2, 1e-300);
    if (fm < 1e-10 && fm < localScale * 1e-3) addRoot(xm);
  }
  return roots.sort((p, q) => p - q);
}

export interface Extremum {
  x: number;
  y: number;
  kind: 'max' | 'min';
}

/** Interior local extrema of f on [a, b]. */
export function findExtrema(f: Fn, a: number, b: number, samples = 2000): Extremum[] {
  const out: Extremum[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = a + ((b - a) * i) / samples;
    xs.push(x);
    ys.push(f(x));
  }
  for (let i = 1; i < samples; i++) {
    const y0 = ys[i - 1];
    const y1 = ys[i];
    const y2 = ys[i + 1];
    if (!Number.isFinite(y0) || !Number.isFinite(y1) || !Number.isFinite(y2)) continue;
    let kind: 'max' | 'min' | null = null;
    if (y1 > y0 && y1 >= y2) kind = 'max';
    else if (y1 < y0 && y1 <= y2) kind = 'min';
    if (!kind) continue;
    const sgn = kind === 'max' ? -1 : 1;
    const x = brentMin((t) => sgn * f(t), xs[i - 1], xs[i + 1]);
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    // Plateau / flat region guard: skip if neighbourhood is constant
    if (Math.abs(y0 - y1) < 1e-14 * Math.max(1, Math.abs(y1)) && Math.abs(y2 - y1) < 1e-14 * Math.max(1, Math.abs(y1))) continue;
    // Discard extrema that are actually poles/jumps (values next to them blow up)
    const hh = (b - a) / samples / 50;
    const yl = f(x - hh);
    const yr = f(x + hh);
    if (!Number.isFinite(yl) || !Number.isFinite(yr)) continue;
    if (out.some((e) => Math.abs(e.x - x) < (b - a) * 1e-9)) continue;
    out.push({ x, y, kind });
  }
  return out;
}

/** Points where f(x) = g(x) on [a, b]. */
export function findIntersections(f: Fn, g: Fn, a: number, b: number): Array<{ x: number; y: number }> {
  const h = (x: number) => f(x) - g(x);
  return findRoots(h, a, b).map((x) => ({ x, y: f(x) }));
}

/** Clean values that are within floating noise of a "nice" number. */
export function snap(x: number, scale = 1): number {
  if (!Number.isFinite(x)) return x;
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-12 * Math.max(1, Math.abs(scale))) return r;
  return Math.abs(x) < 1e-13 * Math.max(1, Math.abs(scale)) ? 0 : x;
}
