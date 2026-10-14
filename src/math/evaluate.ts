import { MathError, type Node } from './ast';
import { FN_MAP } from './functions';
import * as Q from './rational';
import type { Rational } from './rational';
import { derivative, integrate } from './numeric';
import * as S from './special';

export type AngleMode = 'rad' | 'deg';

/** A real scalar with an optional exact rational value. */
export interface Scalar {
  kind: 'scalar';
  n: number;
  r: Rational | null;
}
export interface ListVal {
  kind: 'list';
  items: Scalar[];
}
export interface MatrixVal {
  kind: 'matrix';
  rows: Scalar[][];
}
export type Value = Scalar | ListVal | MatrixVal;

export interface EvalContext {
  angle: AngleMode;
  /** Stored variables (A–Z, θ, x, Ans) */
  vars: Record<string, Scalar>;
  /** Statistics lists L1–L6 */
  lists: Record<string, number[]>;
  /** Parsed graph functions Y1–Y10 (null when empty or invalid) */
  functions: Record<string, Node | null>;
  /** Matrix values held by Ans or variables (home screen only) */
  matrices?: Record<string, MatrixVal>;
  /** Pseudo-random source (overridable for tests) */
  random?: () => number;
}

export const emptyContext = (angle: AngleMode = 'rad'): EvalContext => ({ angle, vars: {}, lists: {}, functions: {} });

export const scalar = (n: number, r: Rational | null = null): Scalar => ({ kind: 'scalar', n, r });
const exact = (r: Rational | null): Scalar | null => (r ? scalar(Q.toNumber(r), r) : null);

/* ------------------------------------------------------------------------ */
/* Numeric kernels shared by the exact evaluator and the compiled evaluator  */
/* ------------------------------------------------------------------------ */

const DEG = Math.PI / 180;

/** Remove floating noise like sin(π) = 1.22e-16 when the argument is not itself tiny. */
function trigClean(v: number, arg: number): number {
  return Math.abs(v) < 1e-15 && Math.abs(arg) > 1e-9 ? 0 : v;
}

/** Real power, including odd roots of negative bases such as (−8)^(1/3) = −2. */
export function realPow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  // Negative base, fractional exponent: real only if b = p/q with q odd
  for (const q of [3, 5, 7, 9, 11, 13, 15]) {
    const p = Math.round(b * q);
    if (Math.abs(b * q - p) < 1e-12) {
      if (p % 2 === 0 && q % 2 === 1) return Math.pow(-a, b);
      if (q % 2 === 1) return -Math.pow(-a, b);
    }
  }
  return NaN;
}

function roundTo(x: number, digits: number): number {
  if (!Number.isInteger(digits) || digits < 0 || digits > 15) return NaN;
  const m = 10 ** digits;
  // use exponent shifting to avoid 1.005*100 issues
  return Number(Math.round(Number(`${x}e${digits}`)) + `e-${digits}`) || Math.round(x * m) / m;
}

function gcdNum(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN;
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Evaluate a scalar built-in numerically. Returns NaN for domain errors. */
export function applyNumeric(name: string, a: number[], angle: AngleMode, random: () => number = Math.random): number {
  const toRad = angle === 'deg' ? DEG : 1;
  const fromRad = angle === 'deg' ? 1 / DEG : 1;
  const x = a[0];
  switch (name) {
    case 'mixed':
      return mixedNumber(a[0], a[1], a[2]);
    case 'det':
      return x;
    case 'identity':
    case 'rref':
    case 'ref':
      return NaN;
    case 'sin':
      return trigClean(Math.sin(x * toRad), x);
    case 'cos':
      return trigClean(Math.cos(x * toRad), x);
    case 'tan': {
      const c = trigClean(Math.cos(x * toRad), x);
      if (c === 0) return NaN;
      return trigClean(Math.sin(x * toRad), x) / c;
    }
    case 'sec': {
      const c = trigClean(Math.cos(x * toRad), x);
      return c === 0 ? NaN : 1 / c;
    }
    case 'csc': {
      const s = trigClean(Math.sin(x * toRad), x);
      return s === 0 ? NaN : 1 / s;
    }
    case 'cot': {
      const s = trigClean(Math.sin(x * toRad), x);
      return s === 0 ? NaN : trigClean(Math.cos(x * toRad), x) / s;
    }
    case 'asin':
      return x < -1 || x > 1 ? NaN : Math.asin(x) * fromRad;
    case 'acos':
      return x < -1 || x > 1 ? NaN : Math.acos(x) * fromRad;
    case 'atan':
      return Math.atan(x) * fromRad;
    case 'atan2':
      return Math.atan2(a[0], a[1]) * fromRad;
    case 'sinh':
      return Math.sinh(x);
    case 'cosh':
      return Math.cosh(x);
    case 'tanh':
      return Math.tanh(x);
    case 'asinh':
      return Math.asinh(x);
    case 'acosh':
      return x < 1 ? NaN : Math.acosh(x);
    case 'atanh':
      return x <= -1 || x >= 1 ? NaN : Math.atanh(x);
    case 'ln':
      return x <= 0 ? NaN : Math.log(x);
    case 'log':
      if (a.length === 2) {
        const b = a[1];
        if (x <= 0 || b <= 0 || b === 1) return NaN;
        return Math.log(x) / Math.log(b);
      }
      return x <= 0 ? NaN : Math.log10(x);
    case 'exp':
      return Math.exp(x);
    case 'sqrt':
      return x < 0 ? NaN : Math.sqrt(x);
    case 'cbrt':
      return Math.cbrt(x);
    case 'root': {
      const n = a[1];
      if (n === 0) return NaN;
      if (x < 0) {
        if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return -Math.pow(-x, 1 / n);
        return NaN;
      }
      return Math.pow(x, 1 / n);
    }
    case 'abs':
      return Math.abs(x);
    case 'sign':
      return Math.sign(x);
    case 'floor':
      return Math.floor(x);
    case 'ceil':
      return Math.ceil(x);
    case 'round':
      return a.length === 2 ? roundTo(x, a[1]) : Math.round(x);
    case 'ipart':
      return Math.trunc(x);
    case 'fpart':
      return x - Math.trunc(x);
    case 'mod': {
      const m = a[1];
      if (m === 0) return NaN;
      const r = x - m * Math.floor(x / m);
      return Math.abs(r) < 1e-15 * Math.abs(m) ? 0 : r;
    }
    case 'gcd':
      return gcdNum(a[0], a[1]);
    case 'lcm': {
      const g = gcdNum(a[0], a[1]);
      return g === 0 ? 0 : Math.abs(a[0] * a[1]) / g;
    }
    case 'min':
      return Math.min(...a);
    case 'max':
      return Math.max(...a);
    case 'npr':
      return S.nPr(a[0], a[1]);
    case 'ncr':
      return S.nCr(a[0], a[1]);
    case 'gamma':
      return S.gamma(x);
    case 'normalpdf':
      return S.normalPdf(x, a[1] ?? 0, a[2] ?? 1);
    case 'normalcdf':
      return S.normalCdf(a[0], a[1], a[2] ?? 0, a[3] ?? 1);
    case 'invnorm':
      return S.invNorm(x, a[1] ?? 0, a[2] ?? 1);
    case 'binompdf':
      return S.binomPdf(a[0], a[1], a[2]);
    case 'binomcdf':
      return S.binomCdf(a[0], a[1], a[2]);
    case 'poissonpdf':
      return S.poissonPdf(a[0], a[1]);
    case 'poissoncdf':
      return S.poissonCdf(a[0], a[1]);
    case 'not':
      return x === 0 ? 1 : 0;
    // complex helpers on real numbers
    case 'conj':
    case 'real':
      return x;
    case 'imag':
      return 0;
    case 'angle':
      return x < 0 ? Math.PI * fromRad : 0;
    case 'rand':
      return random();
    case 'randint': {
      const lo = Math.ceil(Math.min(a[0], a[1]));
      const hi = Math.floor(Math.max(a[0], a[1]));
      return lo + Math.floor(random() * (hi - lo + 1));
    }
    default:
      return NaN;
  }
}

/* ------------------------------------------------------------------------ */
/* List statistics helpers                                                    */
/* ------------------------------------------------------------------------ */

export function listMean(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}
export function listMedian(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function listVariance(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = listMean(xs);
  return xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1);
}

/* ------------------------------------------------------------------------ */
/* Exact-aware evaluator                                                      */
/* ------------------------------------------------------------------------ */

function fail(kind: string, msg: string): never {
  throw new MathError(kind, msg);
}

/** Validate a numeric result coming from finite inputs. */
function check(n: number, what: string): number {
  if (Number.isNaN(n)) fail('DOMAIN', `${what} is undefined for this input`);
  if (!Number.isFinite(n)) fail('OVERFLOW', `${what} overflowed (result is too large)`);
  return n;
}

function asScalar(v: Value, where: string): Scalar {
  if (v.kind === 'list') fail('DATA TYPE', `${where} needs a number, not a list`);
  if (v.kind === 'matrix') fail('DATA TYPE', `${where} needs a number, not a matrix`);
  return v;
}

function mapValue(v: Value, f: (s: Scalar) => Scalar): Value {
  if (v.kind === 'list') return { kind: 'list', items: v.items.map(f) };
  if (v.kind === 'matrix') return { kind: 'matrix', rows: v.rows.map((r) => r.map(f)) };
  return f(v);
}

/** U n/d as a value: −2 1/3 means −(2 + 1/3), as on the TI-84. */
function mixedNumber(u: number, n: number, d: number): number {
  if (d === 0) return NaN;
  const frac = n / d;
  return u < 0 ? u - frac : u + frac;
}

/* ------------------------------ matrices ------------------------------ */

const S0 = () => scalar(0, Q.R_ZERO);
const S1 = () => scalar(1, Q.R_ONE);
const isZeroS = (s: Scalar) => (s.r ? Q.isZero(s.r) : Math.abs(s.n) < 1e-14);
const dims = (m: MatrixVal) => [m.rows.length, m.rows[0]?.length ?? 0] as const;

export function identityMatrix(n: number): MatrixVal {
  return { kind: 'matrix', rows: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? S1() : S0()))) };
}

function matMul(a: MatrixVal, b: MatrixVal): MatrixVal {
  const [ar, ac] = dims(a);
  const [br, bc] = dims(b);
  if (ac !== br) fail('DIM MISMATCH', `Cannot multiply a ${ar}×${ac} matrix by a ${br}×${bc} matrix`);
  const rows: Scalar[][] = [];
  for (let i = 0; i < ar; i++) {
    const row: Scalar[] = [];
    for (let j = 0; j < bc; j++) {
      let acc = S0();
      for (let k = 0; k < ac; k++) acc = binaryScalar('+', acc, binaryScalar('*', a.rows[i][k], b.rows[k][j]));
      row.push(acc);
    }
    rows.push(row);
  }
  return { kind: 'matrix', rows };
}

/** Gaussian elimination. Returns the echelon form, the determinant factor and the pivot count. */
function eliminate(m: MatrixVal, reduced: boolean, augment?: MatrixVal): { rows: Scalar[][]; det: Scalar } {
  const [r, c] = dims(m);
  const rows = m.rows.map((row, i) => [...row, ...(augment ? augment.rows[i] : [])]);
  const width = rows[0]?.length ?? 0;
  let det = S1();
  let pr = 0;
  for (let col = 0; col < c && pr < r; col++) {
    // pivot: the largest entry in the column (exact zeros are skipped)
    let best = -1;
    for (let i = pr; i < r; i++) if (!isZeroS(rows[i][col]) && (best < 0 || Math.abs(rows[i][col].n) > Math.abs(rows[best][col].n))) best = i;
    if (best < 0) {
      det = S0();
      continue;
    }
    if (best !== pr) {
      [rows[best], rows[pr]] = [rows[pr], rows[best]];
      det = scalar(-det.n, det.r ? Q.neg(det.r) : null);
    }
    const piv = rows[pr][col];
    det = binaryScalar('*', det, piv);
    if (reduced || augment) rows[pr] = rows[pr].map((v) => binaryScalar('/', v, piv));
    for (let i = reduced || augment ? 0 : pr + 1; i < r; i++) {
      if (i === pr || isZeroS(rows[i][col])) continue;
      const f = binaryScalar('/', rows[i][col], rows[pr][col]);
      rows[i] = rows[i].map((v, j) => (j < col ? v : binaryScalar('-', v, binaryScalar('*', f, rows[pr][j]))));
    }
    if (!reduced && !augment) rows[pr] = rows[pr].map((v) => binaryScalar('/', v, piv));
    pr++;
  }
  if (pr < Math.min(r, c) || r !== c) det = r === c ? S0() : det;
  // tidy floating noise
  const clean = rows.map((row) => row.map((v) => (!v.r && Math.abs(v.n) < 1e-13 ? S0() : v)));
  return { rows: clean.map((row) => row.slice(0, width)), det };
}

function squareCheck(m: MatrixVal, what: string) {
  const [r, c] = dims(m);
  if (r !== c) fail('INVALID DIM', `${what} needs a square matrix (this one is ${r}×${c})`);
}

export function determinant(m: MatrixVal): Scalar {
  squareCheck(m, 'det');
  return eliminate(m, false).det;
}

function inverse(m: MatrixVal): MatrixVal {
  squareCheck(m, 'The inverse');
  const n = m.rows.length;
  const { rows, det } = eliminate(m, true, identityMatrix(n));
  if (isZeroS(det)) fail('SINGULAR MAT', 'The matrix is singular (its determinant is 0), so it has no inverse');
  return { kind: 'matrix', rows: rows.map((row) => row.slice(n)) };
}

function matrixPower(m: MatrixVal, e: Scalar): MatrixVal {
  squareCheck(m, 'A matrix power');
  if (!Number.isInteger(e.n)) fail('DOMAIN', 'A matrix can only be raised to an integer power');
  if (Math.abs(e.n) > 255) fail('DOMAIN', 'Matrix powers are limited to −255…255');
  let base = e.n < 0 ? inverse(m) : m;
  let k = Math.abs(e.n);
  let acc = identityMatrix(m.rows.length);
  while (k > 0) {
    if (k & 1) acc = matMul(acc, base);
    base = matMul(base, base);
    k >>= 1;
  }
  return acc;
}

function transpose(m: MatrixVal): MatrixVal {
  const [r, c] = dims(m);
  return { kind: 'matrix', rows: Array.from({ length: c }, (_, j) => Array.from({ length: r }, (_, i) => m.rows[i][j])) };
}

function matrixBinary(op: string, a: Value, b: Value): Value {
  if (a.kind === 'list' || b.kind === 'list') fail('DATA TYPE', 'Lists and matrices cannot be combined');
  if (a.kind === 'matrix' && b.kind === 'matrix') {
    switch (op) {
      case '+':
      case '-': {
        const [ar, ac] = dims(a);
        const [br, bc] = dims(b);
        if (ar !== br || ac !== bc) fail('DIM MISMATCH', `Cannot ${op === '+' ? 'add' : 'subtract'} a ${ar}×${ac} and a ${br}×${bc} matrix`);
        return { kind: 'matrix', rows: a.rows.map((row, i) => row.map((v, j) => binaryScalar(op, v, b.rows[i][j]))) };
      }
      case '*':
        return matMul(a, b);
      case '/':
        return matMul(a, inverse(b));
      case '=':
      case '≠': {
        const same =
          a.rows.length === b.rows.length &&
          a.rows[0].length === b.rows[0].length &&
          a.rows.every((row, i) => row.every((v, j) => binaryScalar('=', v, b.rows[i][j]).n === 1));
        return bool(op === '=' ? same : !same);
      }
    }
    fail('DATA TYPE', `"${op}" does not work on two matrices`);
  }
  if (a.kind === 'matrix') {
    const s = b as Scalar;
    if (op === '^') return matrixPower(a, s);
    if (op === '*' || op === '/') return mapValue(a, (v) => binaryScalar(op, v, s));
    fail('DATA TYPE', `"${op}" between a matrix and a number is not defined — use * or /`);
  }
  const s = a as Scalar;
  const m = b as MatrixVal;
  if (op === '*') return mapValue(m, (v) => binaryScalar('*', s, v));
  fail('DATA TYPE', `"${op}" between a number and a matrix is not defined`);
}

function zipValues(a: Value, b: Value, f: (x: Scalar, y: Scalar) => Scalar): Value {
  if (a.kind === 'list' && b.kind === 'list') {
    if (a.items.length !== b.items.length) fail('DIM MISMATCH', 'Lists must have the same length');
    return { kind: 'list', items: a.items.map((x, i) => f(x, b.items[i])) };
  }
  if (a.kind === 'matrix' || b.kind === 'matrix') fail('DATA TYPE', 'Matrices cannot be used here');
  if (a.kind === 'list') return { kind: 'list', items: a.items.map((x) => f(x, b as Scalar)) };
  if (b.kind === 'list') return { kind: 'list', items: b.items.map((y) => f(a, y)) };
  return f(a, b);
}

function ratFromLiteral(text: string): Rational | null {
  const m = /^(-?)([0-9.]+)(?:e(-?\d+))?$/.exec(text);
  if (!m) return null;
  let r = Q.ratFromDecimalString(m[2]);
  if (!r) return null;
  if (m[3]) {
    const e = Number(m[3]);
    if (Math.abs(e) > 300) return null;
    const p = Q.powInt({ n: 10n, d: 1n }, BigInt(e));
    r = p ? Q.mul(r, p) : null;
    if (!r) return null;
  }
  return m[1] ? Q.neg(r) : r;
}

function binaryScalar(op: string, a: Scalar, b: Scalar): Scalar {
  switch (op) {
    case '+':
      return (a.r && b.r && exact(Q.add(a.r, b.r))) || scalar(check(a.n + b.n, 'Addition'));
    case '-':
      return (a.r && b.r && exact(Q.sub(a.r, b.r))) || scalar(check(a.n - b.n, 'Subtraction'));
    case '*':
      return (a.r && b.r && exact(Q.mul(a.r, b.r))) || scalar(check(a.n * b.n, 'Multiplication'));
    case '/':
      if (b.n === 0 || (b.r && Q.isZero(b.r))) fail('DIVIDE BY 0', 'Division by zero');
      return (a.r && b.r && exact(Q.div(a.r, b.r))) || scalar(check(a.n / b.n, 'Division'));
    case '^':
      return power(a, b);
    case 'nPr':
    case 'nCr':
      return combinatoric(op === 'nPr' ? 'npr' : 'ncr', a, b);
    case '=':
    case '≠':
    case '<':
    case '>':
    case '≤':
    case '≥': {
      const c = a.r && b.r ? Q.cmp(a.r, b.r) : compareNum(a.n, b.n);
      return bool(relHolds(op, c));
    }
    case 'and':
      return bool(a.n !== 0 && b.n !== 0);
    case 'or':
      return bool(a.n !== 0 || b.n !== 0);
    case 'xor':
      return bool((a.n !== 0) !== (b.n !== 0));
  }
  fail('SYNTAX', `Unknown operator ${op}`);
}

const bool = (v: boolean): Scalar => (v ? scalar(1, Q.R_ONE) : scalar(0, Q.R_ZERO));

/** Compare floats, treating values equal to ~13 significant digits as equal (like the TI-84). */
export function compareNum(a: number, b: number): number {
  if (a === b) return 0;
  if (Math.abs(a - b) <= 1e-13 * Math.max(Math.abs(a), Math.abs(b))) return 0;
  return a < b ? -1 : 1;
}

export function relHolds(op: string, c: number): boolean {
  switch (op) {
    case '=':
      return c === 0;
    case '≠':
      return c !== 0;
    case '<':
      return c < 0;
    case '>':
      return c > 0;
    case '≤':
      return c <= 0;
    default:
      return c >= 0;
  }
}

function power(a: Scalar, b: Scalar): Scalar {
  if (a.n === 0 && b.n < 0) fail('DIVIDE BY 0', 'Zero raised to a negative power');
  if (a.n === 0 && b.n === 0) fail('DOMAIN', '0^0 is undefined');
  if (a.r && b.r) {
    if (Q.isInt(b.r)) {
      const r = exact(Q.powInt(a.r, b.r.n));
      if (r) return r;
    } else if (b.r.d <= 64n) {
      const root = Q.rootExact(a.r, Number(b.r.d));
      if (root) {
        const r = exact(Q.powInt(root, b.r.n));
        if (r) return r;
      }
    }
  }
  const n = a.n < 0 && b.r && !Q.isInt(b.r) && b.r.d % 2n === 1n
    ? (b.r.n % 2n === 0n ? 1 : -1) * Math.pow(-a.n, b.n)
    : realPow(a.n, b.n);
  if (Number.isNaN(n) && a.n < 0) fail('NONREAL', 'Result is not a real number (negative base with fractional exponent)');
  return scalar(check(n, 'Power'));
}

function combinatoric(name: 'npr' | 'ncr', a: Scalar, b: Scalar): Scalar {
  const n = a.n;
  const r = b.n;
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) {
    fail('DOMAIN', `${name === 'npr' ? 'nPr' : 'nCr'} needs non-negative integers`);
  }
  if (r > n) return scalar(0, Q.R_ZERO);
  if (n <= 5000) {
    let num = 1n;
    for (let i = 0n; i < BigInt(r); i++) num *= BigInt(n) - i;
    if (name === 'ncr') num /= Q.factorialBig(r);
    const ex = exact(Q.rat(num));
    if (ex) return ex;
  }
  return scalar(check(name === 'npr' ? S.nPr(n, r) : S.nCr(n, r), name));
}

function factorialScalar(a: Scalar): Scalar {
  if (a.r && Q.isInt(a.r)) {
    if (a.r.n < 0n) fail('DOMAIN', 'Factorial of a negative integer is undefined');
    if (a.r.n <= 1000n) {
      const ex = exact(Q.rat(Q.factorialBig(Number(a.r.n))));
      if (ex) return ex;
    }
  }
  return scalar(check(S.factorial(a.n), 'Factorial'));
}

/** Exact results for a few built-ins whose output stays rational. */
function exactCall(name: string, args: Scalar[], angle: AngleMode): Scalar | null {
  const r = args[0]?.r;
  switch (name) {
    case 'abs':
      return r ? exact(r.n < 0n ? Q.neg(r) : r) : null;
    case 'sqrt':
      return r ? exact(Q.rootExact(r, 2)) : null;
    case 'cbrt':
      return r ? exact(Q.rootExact(r, 3)) : null;
    case 'root': {
      const k = args[1].r;
      if (!r || !k || !Q.isInt(k) || k.n <= 0n || k.n > 64n) return null;
      return exact(Q.rootExact(r, Number(k.n)));
    }
    case 'floor':
    case 'ceil':
    case 'ipart':
    case 'round': {
      if (!r || args.length > 1) return null;
      const q = r.n / r.d; // truncates toward zero
      const isNeg = r.n < 0n;
      const hasFrac = r.n % r.d !== 0n;
      let v = q;
      if (name === 'floor' && isNeg && hasFrac) v = q - 1n;
      if (name === 'ceil' && !isNeg && hasFrac) v = q + 1n;
      if (name === 'round') {
        const twice = Q.rat(2n * r.n, r.d)!; // round half away from zero
        const t = twice.n / twice.d;
        v = isNeg ? -((-t + 1n) / 2n) : (t + 1n) / 2n;
      }
      return exact(Q.rat(v));
    }
    case 'fpart':
      return r ? exact(Q.sub(r, Q.rat(r.n / r.d)!)) : null;
    case 'sign':
      return r ? exact(Q.rat(BigInt(Math.sign(Number(r.n))))) : null;
    case 'gcd':
    case 'lcm': {
      const s = args[1].r;
      if (!r || !s || !Q.isInt(r) || !Q.isInt(s)) return null;
      const g = Q.bgcd(r.n, s.n);
      if (name === 'gcd') return exact(Q.rat(g));
      return exact(Q.rat(g === 0n ? 0n : (r.n * s.n < 0n ? -(r.n * s.n) : r.n * s.n) / g));
    }
    case 'mod': {
      const m = args[1].r;
      if (!r || !m || Q.isZero(m)) return null;
      const qd = Q.div(r, m);
      if (!qd) return null;
      let fl = qd.n / qd.d;
      if (qd.n < 0n && qd.n % qd.d !== 0n) fl -= 1n;
      const prod = Q.mul(m, Q.rat(fl)!);
      return prod ? exact(Q.sub(r, prod)) : null;
    }
    case 'min':
    case 'max': {
      if (!args.every((x) => x.r)) return null;
      let best = args[0];
      for (const x of args) {
        const c = Q.cmp(x.r!, best.r!);
        if ((name === 'min' && c < 0) || (name === 'max' && c > 0)) best = x;
      }
      return best;
    }
    case 'sin':
    case 'cos':
    case 'tan': {
      // exact values at multiples of 30° / 45° in degree mode
      if (angle !== 'deg' || !r || !Q.isInt(r)) return null;
      const deg = Number(((r.n % 360n) + 360n) % 360n);
      const sinTable: Record<number, Rational> = {
        0: Q.R_ZERO, 30: { n: 1n, d: 2n }, 90: Q.R_ONE, 150: { n: 1n, d: 2n }, 180: Q.R_ZERO,
        210: { n: -1n, d: 2n }, 270: { n: -1n, d: 1n }, 330: { n: -1n, d: 2n },
      };
      if (name === 'sin') return deg in sinTable ? exact(sinTable[deg]) : null;
      if (name === 'cos') {
        const shifted = (deg + 90) % 360;
        return shifted in sinTable ? exact(sinTable[shifted]) : null;
      }
      const tanTable: Record<number, Rational> = {
        0: Q.R_ZERO, 45: Q.R_ONE, 135: { n: -1n, d: 1n }, 180: Q.R_ZERO, 225: Q.R_ONE, 315: { n: -1n, d: 1n },
      };
      return deg in tanTable ? exact(tanTable[deg]) : null;
    }
    case 'log': {
      // exact integer logs, e.g. log(1000) = 3, log(8, 2) = 3
      if (!r || !Q.isInt(r) || r.n <= 0n) return null;
      const base = args.length === 2 ? args[1].r : Q.rat(10n);
      if (!base || !Q.isInt(base) || base.n < 2n) return null;
      let k = 0n;
      let p = 1n;
      while (p < r.n) {
        p *= base.n;
        k++;
      }
      return p === r.n ? exact(Q.rat(k)) : null;
    }
    case 'ln':
      return r && r.n === 1n && r.d === 1n ? exact(Q.R_ZERO) : null;
    case 'exp':
      return r && Q.isZero(r) ? exact(Q.R_ONE) : null;
  }
  return null;
}

const DOMAIN_MESSAGES: Record<string, string> = {
  sqrt: '√ of a negative number is not real',
  ln: 'ln is only defined for positive numbers',
  log: 'log is only defined for positive numbers (and a positive base ≠ 1)',
  asin: 'sin⁻¹ needs an input between −1 and 1',
  acos: 'cos⁻¹ needs an input between −1 and 1',
  acosh: 'cosh⁻¹ needs an input ≥ 1',
  atanh: 'tanh⁻¹ needs an input strictly between −1 and 1',
  tan: 'tan is undefined at this angle (odd multiple of 90°)',
  sec: 'sec is undefined at this angle',
  csc: 'csc is undefined at this angle',
  cot: 'cot is undefined at this angle',
  gamma: 'Γ is undefined at zero and negative integers',
  root: 'Even roots of negative numbers are not real',
  mod: 'mod by zero is undefined',
};

const LIST_FUNCTIONS = new Set(['mean', 'median', 'stdev', 'variance', 'dim']);

export class Evaluator {
  constructor(private ctx: EvalContext, private overrides: Record<string, Scalar> = {}, private depth = 0) {}

  private with(name: string, v: Scalar): Evaluator {
    return new Evaluator(this.ctx, { ...this.overrides, [name]: v }, this.depth);
  }

  eval(node: Node): Value {
    switch (node.type) {
      case 'num': {
        const r = ratFromLiteral(node.text);
        return scalar(node.value, r);
      }
      case 'const':
        if (node.name === 'i') fail('NONREAL', 'i is the imaginary unit — this needs complex arithmetic');
        return scalar(node.name === 'pi' ? Math.PI : Math.E);
      case 'var': {
        if (node.name in this.overrides) return this.overrides[node.name];
        const mat = this.ctx.matrices?.[node.name];
        if (mat) return mat;
        if (/^L[1-6]$/.test(node.name)) {
          const l = this.ctx.lists[node.name];
          if (!l || l.length === 0) fail('UNDEFINED', `List ${node.name} is empty`);
          return { kind: 'list', items: l.map((v) => scalar(v, numToRat(v))) };
        }
        const v = this.ctx.vars[node.name];
        if (!v) {
          if (node.name === 'x') fail('UNDEFINED', 'x has no value here — store one first (e.g. 2→x) or use the Graph view');
          if (node.name === 'Ans') fail('UNDEFINED', 'No previous answer yet');
          fail('UNDEFINED', `Variable ${node.name} has no value — store one with e.g. 5→${node.name}`);
        }
        return v;
      }
      case 'list':
        return { kind: 'list', items: node.items.map((it) => asScalar(this.eval(it), 'A list element')) };
      case 'matrix':
        return { kind: 'matrix', rows: node.rows.map((row) => row.map((it) => asScalar(this.eval(it), 'A matrix entry'))) };
      case 'unary': {
        const v = this.eval(node.arg);
        if (node.op === '+') return v;
        return mapValue(v, (s) => scalar(-s.n, s.r ? Q.neg(s.r) : null));
      }
      case 'binary': {
        const a = this.eval(node.left);
        const b = this.eval(node.right);
        if (a.kind === 'matrix' || b.kind === 'matrix') return matrixBinary(node.op, a, b);
        return zipValues(a, b, (x, y) => binaryScalar(node.op, x, y));
      }
      case 'postfix': {
        const v = this.eval(node.arg);
        if (node.op === 'ᵀ') {
          if (v.kind !== 'matrix') fail('DATA TYPE', 'ᵀ (transpose) needs a matrix');
          return transpose(v);
        }
        if (node.op === '!') return mapValue(v, factorialScalar);
        // degree marker
        if (this.ctx.angle === 'deg') return v;
        return mapValue(v, (s) => scalar(s.n * DEG));
      }
      case 'store': {
        const v = this.eval(node.value);
        return v;
      }
      case 'call':
        return this.call(node.name, node.args);
    }
  }

  private call(name: string, argNodes: Node[]): Value {
    if (/^Y\d+$/.test(name)) return this.callY(name, argNodes[0]);
    const info = FN_MAP[name];
    if (!info) fail('SYNTAX', `Unknown function ${name}`);

    if (info.calculus && (name === 'nderiv' || name === 'fnint' || argNodes.length === 4)) {
      return this.calculus(name, argNodes);
    }
    if ((name === 'sum' || name === 'prod') && argNodes.length !== 1) {
      fail('ARGUMENT', `${name} takes either a list, or (expression, variable, start, end)`);
    }

    const args = argNodes.map((n) => this.eval(n));

    // Matrix functions
    if (name === 'identity') {
      const n = asScalar(args[0], 'identity');
      if (!Number.isInteger(n.n) || n.n < 1 || n.n > 99) fail('DOMAIN', 'identity needs a whole number from 1 to 99');
      return identityMatrix(n.n);
    }
    if (name === 'det' || name === 'rref' || name === 'ref') {
      const m = args[0];
      if (m.kind !== 'matrix') {
        if (name === 'det' && m.kind === 'scalar') return m;
        fail('DATA TYPE', `${name} needs a matrix, e.g. ${name}([[1,2][3,4]])`);
      }
      if (name === 'det') return determinant(m);
      return { kind: 'matrix', rows: eliminate(m, name === 'rref').rows };
    }
    if (name === 'dim' && args[0].kind === 'matrix') {
      const [r, c] = dims(args[0]);
      return { kind: 'list', items: [scalar(r, Q.ratFromInt(r)), scalar(c, Q.ratFromInt(c))] };
    }
    if (args.some((a) => a.kind === 'matrix')) {
      if (args.length !== 1) fail('DATA TYPE', `${name} does not accept a matrix`);
      return mapValue(args[0], (s) => this.scalarCall(name, [s]));
    }
    const largs = args as Array<Scalar | ListVal>;

    if (LIST_FUNCTIONS.has(name) || ((name === 'sum' || name === 'prod') && largs.length === 1)) {
      const v = largs[0];
      const items = v.kind === 'list' ? v.items : [v];
      if (items.length === 0) fail('DIM MISMATCH', 'List is empty');
      const nums = items.map((s) => s.n);
      switch (name) {
        case 'dim':
          return scalar(items.length, Q.rat(BigInt(items.length)));
        case 'sum':
          return items.reduce((acc, s) => binaryScalar('+', acc, s), scalar(0, Q.R_ZERO));
        case 'prod':
          return items.reduce((acc, s) => binaryScalar('*', acc, s), scalar(1, Q.R_ONE));
        case 'mean': {
          const total = items.reduce((acc, s) => binaryScalar('+', acc, s), scalar(0, Q.R_ZERO));
          return binaryScalar('/', total, scalar(items.length, Q.rat(BigInt(items.length))));
        }
        case 'median': {
          const sorted = [...items].sort((p, q) => p.n - q.n);
          const m = sorted.length >> 1;
          if (sorted.length % 2) return sorted[m];
          return binaryScalar('/', binaryScalar('+', sorted[m - 1], sorted[m]), scalar(2, Q.rat(2n)));
        }
        case 'stdev':
          if (nums.length < 2) fail('DOMAIN', 'Standard deviation needs at least 2 values');
          return scalar(Math.sqrt(listVariance(nums)));
        case 'variance':
          if (nums.length < 2) fail('DOMAIN', 'Variance needs at least 2 values');
          return scalar(listVariance(nums));
      }
    }

    if ((name === 'min' || name === 'max') && largs.length === 1 && largs[0].kind === 'list') {
      const items = largs[0].items;
      if (!items.length) fail('DIM MISMATCH', 'List is empty');
      return this.scalarCall(name, items);
    }

    // Broadcast over a single list argument (e.g. sin({0, 30, 90}))
    const listIdx = largs.findIndex((a) => a.kind === 'list');
    if (listIdx >= 0) {
      const len = (largs[listIdx] as ListVal).items.length;
      for (const a of largs) if (a.kind === 'list' && a.items.length !== len) fail('DIM MISMATCH', 'Lists must have the same length');
      const items: Scalar[] = [];
      for (let i = 0; i < len; i++) items.push(this.scalarCall(name, largs.map((a) => (a.kind === 'list' ? a.items[i] : a))));
      return { kind: 'list', items };
    }
    return this.scalarCall(name, largs as Scalar[]);
  }

  private scalarCall(name: string, args: Scalar[]): Scalar {
    if (name === 'npr' || name === 'ncr') return combinatoric(name, args[0], args[1]);
    if (name === 'mixed') {
      const [u, n, d] = args;
      if (!Number.isInteger(u.n) || n.n < 0) fail('DOMAIN', 'A mixed number needs a whole-number part and a non-negative fraction');
      const frac = binaryScalar('/', n, d);
      return binaryScalar(u.n < 0 ? '-' : '+', u, frac);
    }
    const ex = exactCall(name, args, this.ctx.angle);
    if (ex) return ex;
    const nums = args.map((a) => a.n);
    const v = applyNumeric(name, nums, this.ctx.angle, this.ctx.random);
    if (Number.isNaN(v)) {
      if (name === 'sqrt' && nums[0] < 0) fail('NONREAL', DOMAIN_MESSAGES.sqrt);
      if (name === 'mod' && nums[1] === 0) fail('DIVIDE BY 0', DOMAIN_MESSAGES.mod);
      if ((name === 'gcd' || name === 'lcm') && nums.some((n) => !Number.isInteger(n))) fail('DOMAIN', `${name} needs integers`);
      if (name === 'round' && nums.length === 2) fail('DOMAIN', 'round digits must be an integer from 0 to 15');
      fail('DOMAIN', DOMAIN_MESSAGES[name] ?? `${name} is undefined for this input`);
    }
    if (!Number.isFinite(v)) {
      if (name === 'ln' || name === 'log') fail('DOMAIN', DOMAIN_MESSAGES[name]);
      fail('OVERFLOW', `${name} overflowed (result is too large)`);
    }
    return scalar(v);
  }

  private callY(name: string, argNode: Node): Value {
    const body = this.ctx.functions[name];
    if (!body) fail('UNDEFINED', `${name} is not defined (or has an error) — define it in the Graph view`);
    if (this.depth > 20) fail('RECURSION', `${name} refers to itself`);
    const arg = this.eval(argNode);
    const inner = new Evaluator(this.ctx, {}, this.depth + 1);
    return mapValue(arg, (x) => asScalar(inner.with('x', x).eval(body), name));
  }

  private calculus(name: string, argNodes: Node[]): Value {
    const [expr, varNode, ...rest] = argNodes;
    if (varNode.type !== 'var' || !/^([A-Zθ]|x)$/.test(varNode.name)) {
      fail('SYNTAX', `The second argument of ${name} must be a variable such as x`);
    }
    const v = varNode.name;
    const bounds = rest.map((n) => asScalar(this.eval(n), name));
    if (name === 'sum' || name === 'prod') {
      const [a, b] = bounds;
      if (!Number.isInteger(a.n) || !Number.isInteger(b.n)) fail('DOMAIN', `${name} bounds must be integers`);
      if (b.n - a.n > 1e6) fail('OVERFLOW', 'Too many terms (limit 1,000,000)');
      let acc = name === 'sum' ? scalar(0, Q.R_ZERO) : scalar(1, Q.R_ONE);
      for (let k = a.n; k <= b.n; k++) {
        const term = asScalar(this.with(v, scalar(k, Q.rat(BigInt(k)))).eval(expr), name);
        acc = binaryScalar(name === 'sum' ? '+' : '*', acc, term);
        // drop exactness once it becomes expensive
        if (acc.r && acc.r.d.toString().length > 60) acc = scalar(acc.n);
      }
      return acc;
    }
    const f = compileWith(expr, this.ctx, [v], this.overrides);
    const g = (t: number) => f([t]);
    if (name === 'nderiv') {
      const d = derivative(g, bounds[0].n);
      if (Number.isNaN(d)) fail('DOMAIN', 'The derivative does not exist (or could not be computed) at that point');
      return scalar(d);
    }
    // fnint
    const res = integrate(g, bounds[0].n, bounds[1].n);
    if (Number.isNaN(res.value)) fail('DOMAIN', 'The integrand is undefined somewhere on the interval');
    if (!res.reliable) fail('TOL NOT MET', 'The integral did not converge — it may diverge on this interval');
    return scalar(res.value);
  }
}

function numToRat(v: number): Rational | null {
  if (Number.isInteger(v)) return Q.ratFromInt(v);
  // numbers typed into lists have short decimal forms
  const s = String(v);
  return /e/i.test(s) ? null : ratFromLiteral(s);
}

/** Evaluate an AST to a Value. Throws MathError on problems. */
export function evaluate(node: Node, ctx: EvalContext): Value {
  return new Evaluator(ctx).eval(node);
}

/* ------------------------------------------------------------------------ */
/* Fast compiled evaluation for graphs / numerics                             */
/* ------------------------------------------------------------------------ */

type Compiled = (env: number[]) => number;

/** Does `node` reference any of the bound variables (or randomness)? */
function dependsOn(node: Node, bound: string[], ctx: EvalContext, seen = new Set<string>()): boolean {
  switch (node.type) {
    case 'num':
    case 'const':
      return false;
    case 'var':
      return bound.includes(node.name);
    case 'list':
      return node.items.some((n) => dependsOn(n, bound, ctx, seen));
    case 'matrix':
      return node.rows.some((r) => r.some((n) => dependsOn(n, bound, ctx, seen)));
    case 'unary':
    case 'postfix':
      return dependsOn(node.arg, bound, ctx, seen);
    case 'binary':
      return dependsOn(node.left, bound, ctx, seen) || dependsOn(node.right, bound, ctx, seen);
    case 'store':
      return dependsOn(node.value, bound, ctx, seen);
    case 'call':
      if (node.name === 'rand' || node.name === 'randint') return true;
      return node.args.some((n) => dependsOn(n, bound, ctx, seen));
  }
}

/**
 * Compile an AST into a closure over an environment array whose slots
 * correspond to `bound` variable names. Sub-expressions that do not depend
 * on the bound variables are folded with the exact evaluator.
 */
export function compileWith(node: Node, ctx: EvalContext, bound: string[], overrides: Record<string, Scalar> = {}, depth = 0): Compiled {
  const angle = ctx.angle;
  const rnd = ctx.random ?? Math.random;
  const toRad = angle === 'deg' ? DEG : 1;

  const fold = (n: Node): Compiled | null => {
    if (dependsOn(n, bound, ctx)) return null;
    try {
      const v = new Evaluator(ctx, overrides, depth).eval(n);
      const c = v.kind === 'scalar' ? v.n : NaN;
      return () => c;
    } catch (e) {
      if (e instanceof MathError && (e.kind === 'UNDEFINED' || e.kind === 'SYNTAX' || e.kind === 'RECURSION')) throw e;
      return () => NaN;
    }
  };

  const c = (n: Node): Compiled => {
    const folded = n.type === 'num' || n.type === 'const' || n.type === 'var' ? null : fold(n);
    if (folded) return folded;
    switch (n.type) {
      case 'num': {
        const v = n.value;
        return () => v;
      }
      case 'const': {
        const v = n.name === 'pi' ? Math.PI : n.name === 'e' ? Math.E : NaN;
        return () => v;
      }
      case 'var': {
        const idx = bound.indexOf(n.name);
        if (idx >= 0) return (env) => env[idx];
        if (/^L[1-6]$/.test(n.name)) throw new MathError('DATA TYPE', 'Lists cannot be used here');
        const s = overrides[n.name] ?? ctx.vars[n.name];
        if (!s) throw new MathError('UNDEFINED', `Variable ${n.name} has no value — store one with e.g. 5→${n.name}`);
        const v = s.n;
        return () => v;
      }
      case 'list':
        throw new MathError('DATA TYPE', 'Lists cannot be used here');
      case 'matrix':
        throw new MathError('DATA TYPE', 'Matrices cannot be used here');
      case 'unary': {
        const a = c(n.arg);
        return n.op === '-' ? (env) => -a(env) : a;
      }
      case 'postfix': {
        const a = c(n.arg);
        if (n.op === '!') return (env) => S.factorial(a(env));
        return angle === 'deg' ? a : (env) => a(env) * DEG;
      }
      case 'store':
        return c(n.value);
      case 'binary': {
        const l = c(n.left);
        const r = c(n.right);
        switch (n.op) {
          case '+':
            return (env) => l(env) + r(env);
          case '-':
            return (env) => l(env) - r(env);
          case '*':
            return (env) => l(env) * r(env);
          case '/':
            return (env) => {
              const d = r(env);
              return d === 0 ? NaN : l(env) / d;
            };
          case '^': {
            if (n.right.type === 'num' && n.right.value === 2) return (env) => {
              const v = l(env);
              return v * v;
            };
            return (env) => {
              const base = l(env);
              const ex = r(env);
              if (base === 0 && ex <= 0) return NaN;
              return realPow(base, ex);
            };
          }
          case 'nPr':
            return (env) => S.nPr(l(env), r(env));
          case 'nCr':
            return (env) => S.nCr(l(env), r(env));
          case 'and':
            return (env) => (l(env) !== 0 && r(env) !== 0 ? 1 : 0);
          case 'or':
            return (env) => (l(env) !== 0 || r(env) !== 0 ? 1 : 0);
          case 'xor':
            return (env) => ((l(env) !== 0) !== (r(env) !== 0) ? 1 : 0);
          default: {
            const op = n.op;
            return (env) => {
              const a = l(env);
              const b = r(env);
              if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
              return relHolds(op, compareNum(a, b)) ? 1 : 0;
            };
          }
        }
        break;
      }
      case 'call': {
        const name = n.name;
        if (/^Y\d+$/.test(name)) {
          const body = ctx.functions[name];
          if (!body) throw new MathError('UNDEFINED', `${name} is not defined`);
          if (depth > 20) throw new MathError('RECURSION', `${name} refers to itself`);
          const inner = compileWith(body, ctx, ['x'], {}, depth + 1);
          const arg = c(n.args[0]);
          const slot = [0];
          return (env) => {
            slot[0] = arg(env);
            return inner(slot);
          };
        }
        const info = FN_MAP[name];
        if (info?.calculus && (name === 'nderiv' || name === 'fnint' || n.args.length === 4)) {
          const varNode = n.args[1];
          if (varNode.type !== 'var') throw new MathError('SYNTAX', `The second argument of ${name} must be a variable`);
          const innerBound = [...bound.filter((b) => b !== varNode.name), varNode.name];
          const inner = compileWith(n.args[0], ctx, innerBound, overrides, depth);
          const outerIdx = bound.map((b) => (b === varNode.name ? -1 : bound.indexOf(b))).filter((i) => i >= 0);
          const bnds = n.args.slice(2).map(c);
          const mk = (env: number[]) => {
            const scratch = outerIdx.map((i) => env[i]);
            scratch.push(0);
            const last = scratch.length - 1;
            return (t: number) => {
              scratch[last] = t;
              return inner(scratch);
            };
          };
          if (name === 'nderiv') return (env) => derivative(mk(env), bnds[0](env));
          if (name === 'fnint') return (env) => integrate(mk(env), bnds[0](env), bnds[1](env), 1e-8).value;
          return (env) => {
            const f = mk(env);
            const a = Math.round(bnds[0](env));
            const b = Math.round(bnds[1](env));
            if (b - a > 1e5) return NaN;
            let acc = name === 'sum' ? 0 : 1;
            for (let k = a; k <= b; k++) acc = name === 'sum' ? acc + f(k) : acc * f(k);
            return acc;
          };
        }
        if (LIST_FUNCTIONS.has(name) || name === 'sum' || name === 'prod') {
          throw new MathError('DATA TYPE', `${name} needs a list that does not depend on x`);
        }
        const args = n.args.map(c);
        if (args.length === 1) {
          const a0 = args[0];
          switch (name) {
            case 'sin':
              return (env) => Math.sin(a0(env) * toRad);
            case 'cos':
              return (env) => Math.cos(a0(env) * toRad);
            case 'sqrt':
              return (env) => Math.sqrt(a0(env));
            case 'abs':
              return (env) => Math.abs(a0(env));
            case 'ln':
              return (env) => {
                const v = a0(env);
                return v <= 0 ? NaN : Math.log(v);
              };
            case 'exp':
              return (env) => Math.exp(a0(env));
          }
          return (env) => applyNumeric(name, [a0(env)], angle, rnd);
        }
        return (env) => applyNumeric(name, args.map((a) => a(env)), angle, rnd);
      }
    }
    throw new MathError('SYNTAX', 'Cannot compile expression');
  };

  return c(node);
}

/** Compile a function of x for graphing. Non-finite results come back as NaN. */
export function compileFn(node: Node, ctx: EvalContext): (x: number) => number {
  const f = compileWith(node, ctx, ['x']);
  const env = [0];
  return (x: number) => {
    env[0] = x;
    const y = f(env);
    return Number.isFinite(y) ? y : NaN;
  };
}
