/** One- and two-variable statistics and least-squares regressions. */

export interface OneVarStats {
  n: number;
  mean: number;
  sum: number;
  sumSq: number;
  sx: number; // sample standard deviation
  sigmaX: number; // population standard deviation
  variance: number; // sample variance
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  range: number;
  mode: number[]; // empty when every value occurs equally often
}

/** Median of a sorted array slice */
function medianSorted(s: number[]): number {
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Expand values with integer frequencies. */
export function expand(xs: number[], freq?: number[]): number[] {
  if (!freq) return xs;
  const out: number[] = [];
  xs.forEach((x, i) => {
    const f = freq[i] ?? 1;
    if (!Number.isInteger(f) || f < 0) throw new Error('Frequencies must be non-negative integers');
    for (let k = 0; k < f; k++) out.push(x);
  });
  return out;
}

export function oneVar(data: number[]): OneVarStats {
  const n = data.length;
  if (n === 0) throw new Error('The list is empty');
  const s = [...data].sort((a, b) => a - b);
  // Kahan-compensated sums and a two-pass variance for numerical stability
  let sum = 0;
  let c = 0;
  for (const x of data) {
    const y = x - c;
    const t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  const mean = sum / n;
  let ss = 0;
  let sumSq = 0;
  for (const x of data) {
    ss += (x - mean) ** 2;
    sumSq += x * x;
  }
  const variance = n > 1 ? ss / (n - 1) : NaN;
  // Quartiles as on the TI-84: medians of the lower/upper halves excluding the median when n is odd
  const half = n >> 1;
  const lower = s.slice(0, half);
  const upper = s.slice(n % 2 ? half + 1 : half);
  const counts = new Map<number, number>();
  for (const x of data) counts.set(x, (counts.get(x) ?? 0) + 1);
  const maxCount = Math.max(...counts.values());
  const mode = maxCount > 1 ? [...counts.entries()].filter(([, k]) => k === maxCount).map(([x]) => x).sort((a, b) => a - b) : [];
  return {
    n,
    mean,
    sum,
    sumSq,
    sx: Math.sqrt(variance),
    sigmaX: Math.sqrt(ss / n),
    variance,
    min: s[0],
    q1: n > 1 ? medianSorted(lower) : s[0],
    median: medianSorted(s),
    q3: n > 1 ? medianSorted(upper) : s[0],
    max: s[n - 1],
    range: s[n - 1] - s[0],
    mode,
  };
}

export interface TwoVarStats {
  n: number;
  meanX: number;
  meanY: number;
  sx: number;
  sy: number;
  sumXY: number;
  r: number;
}

function assertPaired(xs: number[], ys: number[]) {
  if (xs.length !== ys.length) throw new Error(`Lists have different lengths (${xs.length} and ${ys.length})`);
  if (xs.length < 2) throw new Error('Need at least 2 data points');
}

export function twoVar(xs: number[], ys: number[]): TwoVarStats {
  assertPaired(xs, ys);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sumXY = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    sumXY += xs[i] * ys[i];
  }
  return {
    n,
    meanX: mx,
    meanY: my,
    sx: Math.sqrt(sxx / (n - 1)),
    sy: Math.sqrt(syy / (n - 1)),
    sumXY,
    r: sxy / Math.sqrt(sxx * syy),
  };
}

export type RegressionKind = 'linear' | 'quadratic' | 'cubic' | 'exponential' | 'logarithmic' | 'power';

export interface Regression {
  kind: RegressionKind;
  /** Named coefficients, e.g. { a, b } */
  coef: Record<string, number>;
  /** Expression in x usable as a graph function (plain text) */
  expr: (fmt: (n: number) => string) => string;
  /** TeX template of the model */
  modelTex: string;
  r2: number;
  r?: number;
  predict: (x: number) => number;
}

/** Solve a small dense linear system with partial pivoting. */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-300) throw new Error('Data is degenerate for this regression');
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Polynomial least squares of a given degree (centred x for conditioning). */
function polyFit(xs: number[], ys: number[], deg: number): number[] {
  const n = xs.length;
  if (n <= deg) throw new Error(`Need at least ${deg + 1} points for this regression`);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const sx = Math.sqrt(xs.reduce((a, b) => a + (b - mx) ** 2, 0) / n) || 1;
  const u = xs.map((x) => (x - mx) / sx);
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i <= deg; i++) {
    A.push([]);
    for (let j = 0; j <= deg; j++) A[i].push(u.reduce((s, v) => s + v ** (i + j), 0));
    b.push(u.reduce((s, v, k) => s + v ** i * ys[k], 0));
  }
  const c = solveLinearSystem(A, b); // coefficients in u
  // Expand back into powers of x: u = (x - mx)/sx
  const out = new Array(deg + 1).fill(0);
  for (let i = 0; i <= deg; i++) {
    // c_i * ((x - mx)/sx)^i = c_i/sx^i * Σ C(i,k) x^k (-mx)^(i-k)
    for (let k = 0; k <= i; k++) {
      out[k] += (c[i] / sx ** i) * binom(i, k) * (-mx) ** (i - k);
    }
  }
  return out; // out[k] = coefficient of x^k
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

function rSquared(xs: number[], ys: number[], f: (x: number) => number): number {
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let ssRes = 0;
  let ssTot = 0;
  xs.forEach((x, i) => {
    ssRes += (ys[i] - f(x)) ** 2;
    ssTot += (ys[i] - my) ** 2;
  });
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

const signed = (v: string) => (v.startsWith('-') ? `-${v.slice(1)}` : `+${v}`);

export function regress(kind: RegressionKind, xs: number[], ys: number[]): Regression {
  assertPaired(xs, ys);
  switch (kind) {
    case 'linear': {
      const [b, a] = polyFit(xs, ys, 1);
      const f = (x: number) => a * x + b;
      const r = twoVar(xs, ys).r;
      return { kind, coef: { a, b }, modelTex: 'y = ax + b', r2: r * r, r, predict: f, expr: (fm) => `${fm(a)}x${signed(fm(b))}` };
    }
    case 'quadratic': {
      const [c, b, a] = polyFit(xs, ys, 2);
      const f = (x: number) => (a * x + b) * x + c;
      return { kind, coef: { a, b, c }, modelTex: 'y = ax^2 + bx + c', r2: rSquared(xs, ys, f), predict: f, expr: (fm) => `${fm(a)}x^2${signed(fm(b))}x${signed(fm(c))}` };
    }
    case 'cubic': {
      const [d, c, b, a] = polyFit(xs, ys, 3);
      const f = (x: number) => ((a * x + b) * x + c) * x + d;
      return {
        kind,
        coef: { a, b, c, d },
        modelTex: 'y = ax^3 + bx^2 + cx + d',
        r2: rSquared(xs, ys, f),
        predict: f,
        expr: (fm) => `${fm(a)}x^3${signed(fm(b))}x^2${signed(fm(c))}x${signed(fm(d))}`,
      };
    }
    case 'exponential': {
      if (ys.some((y) => y <= 0)) throw new Error('Exponential regression needs all y > 0');
      const ly = ys.map(Math.log);
      const [lnA, lnB] = polyFit(xs, ly, 1);
      const a = Math.exp(lnA);
      const b = Math.exp(lnB);
      const f = (x: number) => a * b ** x;
      const r = twoVar(xs, ly).r;
      return { kind, coef: { a, b }, modelTex: 'y = a\\cdot b^{x}', r2: r * r, r, predict: f, expr: (fm) => `${fm(a)}*${fm(b)}^x` };
    }
    case 'logarithmic': {
      if (xs.some((x) => x <= 0)) throw new Error('Logarithmic regression needs all x > 0');
      const lx = xs.map(Math.log);
      const [a, b] = polyFit(lx, ys, 1);
      const f = (x: number) => a + b * Math.log(x);
      const r = twoVar(lx, ys).r;
      return { kind, coef: { a, b }, modelTex: 'y = a + b\\ln x', r2: r * r, r, predict: f, expr: (fm) => `${fm(a)}${signed(fm(b))}ln(x)` };
    }
    case 'power': {
      if (xs.some((x) => x <= 0) || ys.some((y) => y <= 0)) throw new Error('Power regression needs all x > 0 and y > 0');
      const lx = xs.map(Math.log);
      const ly = ys.map(Math.log);
      const [lnA, b] = polyFit(lx, ly, 1);
      const a = Math.exp(lnA);
      const f = (x: number) => a * x ** b;
      const r = twoVar(lx, ly).r;
      return { kind, coef: { a, b }, modelTex: 'y = a\\cdot x^{b}', r2: r * r, r, predict: f, expr: (fm) => `${fm(a)}*x^(${fm(b)})` };
    }
  }
}
