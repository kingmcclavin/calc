import { MathError, type Node } from './ast';
import { compileFn, evaluate, type EvalContext, type Scalar } from './evaluate';
import { formatNumber, formatNumberTex, ratTex, type FormatOptions, DEFAULT_FORMAT } from './format';
import { toTex } from './latex';
import { findRoots } from './numeric';
import { parse, parseEquation } from './parser';
import { polyDegree, toPoly } from './polynomial';
import * as Q from './rational';
import type { Rational } from './rational';

export interface Step {
  /** Explanation in plain text */
  text: string;
  /** Optional display math */
  tex?: string;
}

export interface Solution {
  /** TeX of the solution, e.g. "x = \frac{1}{2}" */
  tex: string;
  /** decimal value(s) for numeric use */
  value?: number;
  exact: boolean;
}

export interface SolveResult {
  method: 'linear' | 'quadratic' | 'numeric' | 'identity' | 'none' | 'system';
  steps: Step[];
  solutions: Solution[];
  /** Short summary, e.g. "2 real solutions" */
  summary: string;
  /** Extra note shown under the results (limitations etc.) */
  note?: string;
}

/* ------------------------------------------------------------------------ */
/* Helpers for exact surd expressions  A ± B√m                               */
/* ------------------------------------------------------------------------ */

function r2n(r: Rational): number {
  return Q.toNumber(r);
}

function babs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / Q.bgcd(a, b)) * b;
}

/** Signed term TeX for polynomial display: "+ 3x", "- x^{2}" */
function polyTex(coeffs: Rational[]): string {
  const parts: string[] = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (Q.isZero(c)) continue;
    const negC = c.n < 0n;
    const abs = negC ? Q.neg(c) : c;
    const isOne = abs.n === 1n && abs.d === 1n;
    const coefTex = i > 0 && isOne ? '' : ratTex(abs);
    const xTex = i === 0 ? '' : i === 1 ? 'x' : `x^{${i}}`;
    const sign = parts.length === 0 ? (negC ? '-' : '') : negC ? ' - ' : ' + ';
    parts.push(`${sign}${coefTex}${xTex}`);
  }
  return parts.length ? parts.join('') : '0';
}

/** TeX for (p ± q√m) where p, q rational, q > 0, as a single fraction. */
function surdTex(p: Rational, q: Rational, m: bigint, sign: '+' | '-' | '\\pm', imaginary = false): string {
  const L = lcm(p.d, q.d);
  const pn = p.n * (L / p.d);
  const qn = q.n * (L / q.d);
  const root = m === 1n ? '' : `\\sqrt{${m}}`;
  const qPart = `${qn === 1n && root ? '' : qn.toString()}${root}${imaginary ? 'i' : ''}`;
  const num = pn === 0n ? (sign === '-' ? `-${qPart}` : sign === '\\pm' ? `\\pm ${qPart}` : qPart) : `${pn} ${sign} ${qPart}`;
  return L === 1n ? num : `\\frac{${num}}{${L}}`;
}

/* ------------------------------------------------------------------------ */
/* Equation solver                                                            */
/* ------------------------------------------------------------------------ */

export interface SolveOptions {
  /** Search interval for numeric solving */
  lo: number;
  hi: number;
  format?: FormatOptions;
}

function fmtTex(x: number, f: FormatOptions) {
  return formatNumberTex(x, f);
}

export function solveEquation(src: string, ctx: EvalContext, opts: SolveOptions): SolveResult {
  const fmt = opts.format ?? DEFAULT_FORMAT;
  if (!src.includes('=')) throw new MathError('SYNTAX', 'Enter an equation containing "=", e.g. 2x + 3 = 7');
  const { left, right } = parseEquation(src);
  const diff: Node = { type: 'binary', op: '-', left, right };
  const eqTex = `${toTex(left)} = ${toTex(right)}`;
  const poly = toPoly(diff);
  const steps: Step[] = [{ text: 'Start with the equation', tex: eqTex }];

  if (poly) {
    const deg = polyDegree(poly);
    if (deg === -Infinity) {
      steps.push({ text: 'Moving everything to one side gives 0 = 0, which is always true.' });
      return { method: 'identity', steps, solutions: [], summary: 'Every real x is a solution (identity)' };
    }
    if (deg === 0) {
      steps.push({ text: 'Moving everything to one side leaves a non-zero constant:', tex: `${polyTex(poly)} = 0` });
      return { method: 'none', steps, solutions: [], summary: 'No solution (contradiction)' };
    }
    if (deg === 1) return solveLinear(poly as [Rational, Rational], steps, fmt);
    if (deg === 2) return solveQuadratic(poly[2], poly[1], poly[0], steps, fmt);
    // Higher-degree polynomial: numeric over a guaranteed bound
    const an = r2n(poly[deg]);
    let bound = 1;
    for (let i = 0; i < deg; i++) bound = Math.max(bound, 1 + Math.abs(r2n(poly[i]) / an));
    steps.push({ text: `Rewrite as a degree-${deg} polynomial equal to zero:`, tex: `${polyTex(poly)} = 0` });
    steps.push({
      text: `Polynomials of degree ${deg} are solved numerically here. By Cauchy's bound every real root lies in [−${formatNumber(bound, fmt)}, ${formatNumber(bound, fmt)}], so that whole interval is searched.`,
    });
    const coeffs = poly.map(r2n);
    const p = (x: number) => coeffs.reduceRight((acc, c) => acc * x + c, 0);
    const roots = findRoots(p, -bound, bound, 20000);
    return {
      method: 'numeric',
      steps,
      solutions: roots.map((x) => ({ tex: `x \\approx ${fmtTex(x, fmt)}`, value: x, exact: false })),
      summary: roots.length ? `${roots.length} real solution${roots.length > 1 ? 's' : ''} (numerical)` : 'No real solutions',
    };
  }

  // General equation: numerical root finding on an interval
  const f = compileFn(diff, ctx);
  const lf = compileFn(left, ctx);
  const rf = compileFn(right, ctx);
  steps.push({ text: 'Rewrite as f(x) = 0 with', tex: `f(x) = ${toTex(left)} - \\left(${toTex(right)}\\right)` });
  steps.push({
    text: `This is not a polynomial equation, so solutions are found numerically: f is sampled on [${formatNumber(opts.lo, fmt)}, ${formatNumber(opts.hi, fmt)}], sign changes are bracketed, and each root is refined with Brent's method.`,
  });
  const roots = findRoots(f, opts.lo, opts.hi, 20000).filter((x) => {
    const a = lf(x);
    const b = rf(x);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
  });
  return {
    method: 'numeric',
    steps,
    solutions: roots.map((x) => ({ tex: `x \\approx ${fmtTex(x, fmt)}`, value: x, exact: false })),
    summary: roots.length ? `${roots.length} solution${roots.length > 1 ? 's' : ''} found in the interval (numerical)` : 'No solutions found in the search interval',
    note: 'Numerical search only finds solutions inside the interval; widen it if you expect more. Approximations are shown with ≈.',
  };
}

function solveLinear([b, a]: [Rational, Rational], steps: Step[], fmt: FormatOptions): SolveResult {
  steps.push({ text: 'Move every term to the left side and combine like terms:', tex: `${polyTex([b, a])} = 0` });
  const negB = Q.neg(b);
  if (!Q.isZero(b)) steps.push({ text: `${b.n < 0n ? 'Add' : 'Subtract'} ${b.n < 0n ? ratTexPlain(negB) : ratTexPlain(b)} on both sides:`, tex: `${polyTex([Q.R_ZERO, a])} = ${ratTex(negB)}` });
  const x = Q.div(negB, a)!;
  if (!(a.n === 1n && a.d === 1n)) steps.push({ text: `Divide both sides by ${ratTexPlain(a)}:`, tex: `x = \\frac{${ratTex(negB)}}{${ratTex(a)}}` });
  steps.push({ text: 'Simplify:', tex: `x = ${ratTex(x)}` });
  const v = r2n(x);
  const exactTex = `x = ${ratTex(x)}`;
  return {
    method: 'linear',
    steps,
    solutions: [{ tex: x.d === 1n ? exactTex : `${exactTex} \\approx ${fmtTex(v, fmt)}`, value: v, exact: true }],
    summary: 'Linear equation — one exact solution',
  };
}

function ratTexPlain(r: Rational): string {
  return r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`;
}

export function solveQuadratic(a: Rational, b: Rational, c: Rational, steps: Step[] = [], fmt: FormatOptions = DEFAULT_FORMAT): SolveResult {
  if (Q.isZero(a)) throw new MathError('DOMAIN', 'a must not be 0 for a quadratic');
  steps.push({ text: 'Write in standard form ax² + bx + c = 0:', tex: `${polyTex([c, b, a])} = 0` });
  steps.push({ text: 'Identify the coefficients:', tex: `a = ${ratTex(a)},\\quad b = ${ratTex(b)},\\quad c = ${ratTex(c)}` });
  const D = Q.sub(Q.mul(b, b)!, Q.mul({ n: 4n, d: 1n }, Q.mul(a, c)!)!)!;
  steps.push({
    text: 'Compute the discriminant:',
    tex: `\\Delta = b^2 - 4ac = \\left(${ratTex(b)}\\right)^2 - 4\\left(${ratTex(a)}\\right)\\left(${ratTex(c)}\\right) = ${ratTex(D)}`,
  });
  const twoA = Q.mul({ n: 2n, d: 1n }, a)!;
  const p = Q.div(Q.neg(b), twoA)!; // -b/2a
  steps.push({ text: 'Apply the quadratic formula:', tex: `x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${ratTex(Q.neg(b))} \\pm \\sqrt{${ratTex(D)}}}{${ratTex(twoA)}}` });

  if (Q.isZero(D)) {
    steps.push({ text: 'Δ = 0, so there is exactly one (repeated) real root:', tex: `x = ${ratTex(p)}` });
    const v = r2n(p);
    return {
      method: 'quadratic',
      steps,
      solutions: [{ tex: p.d === 1n ? `x = ${ratTex(p)}` : `x = ${ratTex(p)} \\approx ${fmtTex(v, fmt)}`, value: v, exact: true }],
      summary: 'One repeated real root',
    };
  }
  const absD = D.n < 0n ? Q.neg(D) : D;
  // √(n/d) = √(n·d)/d = (k/d)√m
  const { outside, inside } = Q.squareFreeSplit(absD.n * absD.d);
  const qRat = Q.rat(outside, absD.d * babs(twoA.n))!; // magnitude of ±term before dividing by |2a| numerator
  // q = √|D| / |2a| = (outside/absD.d)√inside / |2a|
  const q = Q.mul(qRat, { n: twoA.d, d: 1n })!;
  const sqrtTex = inside === 1n ? ratTex(Q.rat(outside, absD.d)!) : `${Q.rat(outside, absD.d)!.n === 1n && absD.d === 1n ? '' : ratTex(Q.rat(outside, absD.d)!)}\\sqrt{${inside}}`;
  steps.push({ text: inside === 1n ? 'The discriminant is a perfect square:' : 'Simplify the square root:', tex: `\\sqrt{${ratTex(absD)}} = ${sqrtTex}` });

  if (D.n < 0n) {
    const qv = r2n(q) * Math.sqrt(Number(inside));
    steps.push({ text: 'Δ < 0, so there are no real solutions. The two complex solutions are:', tex: `x = ${surdTex(p, q, inside, '\\pm', true)}` });
    return {
      method: 'quadratic',
      steps,
      solutions: [
        { tex: `x = ${surdTex(p, q, inside, '+', true)} \\approx ${fmtTex(r2n(p), fmt)} + ${fmtTex(qv, fmt)}i`, exact: true },
        { tex: `x = ${surdTex(p, q, inside, '-', true)} \\approx ${fmtTex(r2n(p), fmt)} - ${fmtTex(qv, fmt)}i`, exact: true },
      ],
      summary: 'No real solutions (two complex conjugate roots)',
    };
  }
  const qv = r2n(q) * Math.sqrt(Number(inside));
  const pv = r2n(p);
  // order: smaller root first
  const roots = [pv - qv, pv + qv];
  const texes =
    inside === 1n
      ? [ratTex(Q.sub(p, q)!), ratTex(Q.add(p, q)!)]
      : [surdTex(p, q, inside, '-'), surdTex(p, q, inside, '+')];
  steps.push({ text: 'Δ > 0, so there are two distinct real solutions.', tex: `x = ${surdTex(p, q, inside, '\\pm')}` });
  return {
    method: 'quadratic',
    steps,
    solutions: roots.map((v, i) => {
      const isInt = inside === 1n && /^-?\d+$/.test(texes[i]);
      return { tex: isInt ? `x = ${texes[i]}` : `x = ${texes[i]} \\approx ${fmtTex(v, fmt)}`, value: v, exact: true };
    }),
    summary: 'Two distinct real solutions',
  };
}

/** Evaluate a coefficient input such as "3", "-1/2", "√2". */
export function evalCoefficient(src: string, ctx: EvalContext, label: string): Scalar {
  if (!src.trim()) throw new MathError('SYNTAX', `Enter a value for ${label}`);
  const v = evaluate(parse(src), ctx);
  if (v.kind !== 'scalar') throw new MathError('DATA TYPE', `${label} must be a number`);
  return v;
}

/** Quadratic from coefficient strings; falls back to numeric formula if a coefficient is irrational. */
export function solveQuadraticInputs(a: string, b: string, c: string, ctx: EvalContext, fmt: FormatOptions = DEFAULT_FORMAT): SolveResult {
  const A = evalCoefficient(a, ctx, 'a');
  const B = evalCoefficient(b, ctx, 'b');
  const C = evalCoefficient(c, ctx, 'c');
  if (A.n === 0) throw new MathError('DOMAIN', 'a must not be 0 for a quadratic (that would be linear)');
  if (A.r && B.r && C.r) return solveQuadratic(A.r, B.r, C.r, [], fmt);
  // Irrational coefficients: decimal quadratic formula with a numerically stable form
  const steps: Step[] = [
    { text: 'Coefficients are not all rational, so the quadratic formula is evaluated in decimals:', tex: `a \\approx ${fmtTex(A.n, fmt)},\\ b \\approx ${fmtTex(B.n, fmt)},\\ c \\approx ${fmtTex(C.n, fmt)}` },
  ];
  const D = B.n * B.n - 4 * A.n * C.n;
  steps.push({ text: 'Discriminant:', tex: `\\Delta = b^2 - 4ac \\approx ${fmtTex(D, fmt)}` });
  if (D < 0) {
    const re = -B.n / (2 * A.n);
    const im = Math.sqrt(-D) / Math.abs(2 * A.n);
    return {
      method: 'quadratic',
      steps,
      solutions: [
        { tex: `x \\approx ${fmtTex(re, fmt)} + ${fmtTex(im, fmt)}i`, exact: false },
        { tex: `x \\approx ${fmtTex(re, fmt)} - ${fmtTex(im, fmt)}i`, exact: false },
      ],
      summary: 'No real solutions (two complex conjugate roots)',
    };
  }
  // q = -(b + sign(b)√Δ)/2 avoids cancellation
  const qq = -0.5 * (B.n + (B.n >= 0 ? 1 : -1) * Math.sqrt(D));
  const r1 = qq / A.n;
  const r2 = qq !== 0 ? C.n / qq : r1;
  const roots = [...new Set([r1, r2])].sort((x, y) => x - y);
  return {
    method: 'quadratic',
    steps,
    solutions: roots.map((v) => ({ tex: `x \\approx ${fmtTex(v, fmt)}`, value: v, exact: false })),
    summary: roots.length === 1 ? 'One repeated real root' : 'Two distinct real solutions',
  };
}

/* ------------------------------------------------------------------------ */
/* 2×2 linear systems                                                         */
/* ------------------------------------------------------------------------ */

type Num = { r: Rational | null; n: number };

function nTex(v: Num, fmt: FormatOptions): string {
  return v.r ? ratTex(v.r) : fmtTex(v.n, fmt);
}
function nMul(a: Num, b: Num): Num {
  const r = a.r && b.r ? Q.mul(a.r, b.r) : null;
  return { r, n: r ? r2n(r) : a.n * b.n };
}
function nSub(a: Num, b: Num): Num {
  const r = a.r && b.r ? Q.sub(a.r, b.r) : null;
  return { r, n: r ? r2n(r) : a.n - b.n };
}
function nDiv(a: Num, b: Num): Num {
  const r = a.r && b.r ? Q.div(a.r, b.r) : null;
  return { r, n: r ? r2n(r) : a.n / b.n };
}

export function solveSystem2(coef: string[][], ctx: EvalContext, fmt: FormatOptions = DEFAULT_FORMAT): SolveResult {
  const names = [
    ['a₁', 'b₁', 'c₁'],
    ['a₂', 'b₂', 'c₂'],
  ];
  const m = coef.map((row, i) => row.map((s, j) => evalCoefficient(s, ctx, names[i][j]))) as Num[][];
  const [[a1, b1, c1], [a2, b2, c2]] = m;
  const t = (v: Num) => nTex(v, fmt);
  const eq = (a: Num, b: Num, c: Num) => `${t(a)}x + ${t(b)}y = ${t(c)}`.replace(/\+ -/g, '- ');
  const steps: Step[] = [{ text: 'The system is', tex: `\\begin{cases} ${eq(a1, b1, c1)} \\\\ ${eq(a2, b2, c2)} \\end{cases}` }];
  const D = nSub(nMul(a1, b2), nMul(a2, b1));
  steps.push({ text: 'Compute the determinant of the coefficient matrix:', tex: `D = a_1 b_2 - a_2 b_1 = ${t(D)}` });
  const exactAll = m.every((row) => row.every((v) => v.r));
  const isZero = (v: Num) => (v.r ? Q.isZero(v.r) : Math.abs(v.n) < 1e-12);
  if (isZero(D)) {
    const Dx = nSub(nMul(c1, b2), nMul(c2, b1));
    const Dy = nSub(nMul(a1, c2), nMul(a2, c1));
    if (isZero(Dx) && isZero(Dy)) {
      steps.push({ text: 'D = 0 and the equations are multiples of each other, so the lines coincide.' });
      return { method: 'system', steps, solutions: [], summary: 'Infinitely many solutions (same line)' };
    }
    steps.push({ text: 'D = 0 but the equations are inconsistent, so the lines are parallel.' });
    return { method: 'system', steps, solutions: [], summary: 'No solution (parallel lines)' };
  }
  const Dx = nSub(nMul(c1, b2), nMul(c2, b1));
  const Dy = nSub(nMul(a1, c2), nMul(a2, c1));
  steps.push({ text: "Cramer's rule — replace a column with the constants:", tex: `D_x = c_1 b_2 - c_2 b_1 = ${t(Dx)},\\quad D_y = a_1 c_2 - a_2 c_1 = ${t(Dy)}` });
  const x = nDiv(Dx, D);
  const y = nDiv(Dy, D);
  steps.push({ text: 'Divide by D:', tex: `x = \\frac{D_x}{D} = ${t(x)},\\quad y = \\frac{D_y}{D} = ${t(y)}` });
  const sol = (name: string, v: Num): Solution => ({
    tex: v.r ? (v.r.d === 1n ? `${name} = ${ratTex(v.r)}` : `${name} = ${ratTex(v.r)} \\approx ${fmtTex(v.n, fmt)}`) : `${name} \\approx ${fmtTex(v.n, fmt)}`,
    value: v.n,
    exact: !!v.r,
  });
  return {
    method: 'system',
    steps,
    solutions: [sol('x', x), sol('y', y)],
    summary: exactAll ? 'One unique solution (exact)' : 'One unique solution',
  };
}
