/** Special functions and probability distributions (pure numeric). */

// Lanczos approximation (g = 607/128, 15 terms; Godfrey's coefficients) — ~1e-15 relative accuracy
const LANCZOS_G = 607 / 128;
const LANCZOS_C = [
  0.99999999999999709182, 57.156235665862923517, -59.597960355475491248, 14.136097974741747174,
  -0.49191381609762019978, 0.33994649984811888699e-4, 0.46523628927048575665e-4, -0.98374475304879564677e-4,
  0.15808870322491248884e-3, -0.21026444172410488319e-3, 0.2174396181152126432e-3, -0.16431810653676389022e-3,
  0.84418223983852743293e-4, -0.2619083840158140867e-4, 0.36899182659531622704e-5,
];

/** ln Γ(x) for x > 0. */
export function lgamma(x: number): number {
  if (!(x > 0)) return NaN;
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_C.length; i++) a += LANCZOS_C[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Γ(x): exact products for integers, Lanczos otherwise, reflection for x < 0.5. */
export function gamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (Number.isInteger(x)) {
    if (x <= 0) return NaN; // poles
    if (x <= 171) {
      let r = 1;
      for (let i = 2; i < x; i++) r *= i;
      return r;
    }
    return Infinity;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  if (x > 171.7) return Infinity;
  return Math.exp(lgamma(x));
}

export function factorial(x: number): number {
  if (x < 0 && Number.isInteger(x)) return NaN;
  return gamma(x + 1);
}

/** ln C(n, k) */
function lchoose(n: number, k: number): number {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

export function nCr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) return NaN;
  if (r > n) return 0;
  r = Math.min(r, n - r);
  let res = 1;
  for (let i = 1; i <= r; i++) {
    res = (res * (n - r + i)) / i;
    if (!Number.isFinite(res)) return Infinity;
  }
  return Math.round(res);
}

export function nPr(n: number, r: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) return NaN;
  if (r > n) return 0;
  let res = 1;
  for (let i = 0; i < r; i++) {
    res *= n - i;
    if (!Number.isFinite(res)) return Infinity;
  }
  return res;
}

/* ---------------------------- Normal distribution ------------------------ */

const SQRT2PI = Math.sqrt(2 * Math.PI);

export function stdNormalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / SQRT2PI;
}

/**
 * Upper tail Q(z) = P(Z > z) for z ≥ 0, accurate to ~1e-15 relative.
 * Uses a power series for small z and a Laplace continued fraction for large z.
 */
function upperTail(z: number): number {
  if (z < 3) {
    // Φ(z) = 1/2 + φ(z) Σ z^(2n+1) / (1·3·5···(2n+1))
    let term = z;
    let sum = z;
    for (let n = 1; n < 500; n++) {
      term *= (z * z) / (2 * n + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    return 0.5 - stdNormalPdf(z) * sum;
  }
  if (z > 40) return 0;
  // Continued fraction evaluated bottom-up: Q = φ(z) / (z + 1/(z + 2/(z + 3/(z + ...))))
  let f = z;
  for (let k = 120; k >= 1; k--) f = z + k / f;
  return stdNormalPdf(z) / f;
}

export function stdNormalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  return z >= 0 ? 1 - upperTail(z) : upperTail(-z);
}

/** P(lo ≤ X ≤ hi), computed on whichever tail keeps precision. */
export function normalCdf(lo: number, hi: number, mu = 0, sigma = 1): number {
  if (!(sigma > 0)) return NaN;
  const a = (lo - mu) / sigma;
  const b = (hi - mu) / sigma;
  if (a > b) return -normalCdf(hi, lo, mu, sigma);
  if (a >= 0) return upperTail(a) - upperTail(b === Infinity ? 41 : b);
  if (b <= 0) return upperTail(-b) - upperTail(a === -Infinity ? 41 : -a);
  return 1 - (a === -Infinity ? 0 : upperTail(-a)) - (b === Infinity ? 0 : upperTail(b));
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  if (!(sigma > 0)) return NaN;
  return stdNormalPdf((x - mu) / sigma) / sigma;
}

/** Inverse standard normal CDF (Acklam's approximation + Halley refinement). */
export function invNorm(p: number, mu = 0, sigma = 1): number {
  if (!(p > 0 && p < 1) || !(sigma > 0)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x: number;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Two Halley steps
  for (let k = 0; k < 2; k++) {
    const e = x >= 0 ? 1 - upperTail(x) - p : upperTail(-x) - p;
    const u = e * SQRT2PI * Math.exp((x * x) / 2);
    x = x - u / (1 + (x * u) / 2);
  }
  return mu + sigma * x;
}

/* --------------------------- Discrete distributions ---------------------- */

export function binomPdf(n: number, p: number, k: number): number {
  if (!Number.isInteger(n) || n < 0 || !(p >= 0 && p <= 1)) return NaN;
  if (!Number.isInteger(k) || k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  const c = n <= 1000 ? nCr(n, k) : Infinity;
  if (Number.isFinite(c)) {
    const v = c * Math.pow(p, k) * Math.pow(1 - p, n - k);
    if (v > 1e-280) return v;
  }
  return Math.exp(lchoose(n, k) + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

export function binomCdf(n: number, p: number, k: number): number {
  if (!Number.isInteger(n) || n < 0 || !(p >= 0 && p <= 1)) return NaN;
  k = Math.floor(k);
  if (k < 0) return 0;
  if (k >= n) return 1;
  let s = 0;
  for (let i = 0; i <= k; i++) s += binomPdf(n, p, i);
  return Math.min(1, s);
}

export function poissonPdf(mu: number, k: number): number {
  if (!(mu > 0)) return NaN;
  if (!Number.isInteger(k) || k < 0) return 0;
  if (k <= 170) {
    let v = Math.exp(-mu);
    for (let i = 1; i <= k; i++) v *= mu / i;
    if (v > 1e-280) return v;
  }
  return Math.exp(k * Math.log(mu) - mu - lgamma(k + 1));
}

export function poissonCdf(mu: number, k: number): number {
  if (!(mu > 0)) return NaN;
  k = Math.floor(k);
  if (k < 0) return 0;
  let s = 0;
  for (let i = 0; i <= k; i++) s += poissonPdf(mu, i);
  return Math.min(1, s);
}
