import type { Node } from '../math/ast';
import { evaluate, type EvalContext, type Scalar } from '../math/evaluate';
import { formatNumber, formatScalar, type FormatOptions } from '../math/format';
import { derivative, findExtrema, findIntersections, findRoots, integrate } from '../math/numeric';
import { parse } from '../math/parser';
import { MathError } from '../math/ast';

export type Tool = 'value' | 'zero' | 'minimum' | 'maximum' | 'intersect' | 'derivative' | 'integral' | 'tangent';

export const TOOLS: Array<{ id: Tool; label: string; description: string }> = [
  { id: 'value', label: 'Value', description: 'Evaluate the function at a given x' },
  { id: 'zero', label: 'Zeros', description: 'All x-intercepts in the visible window (numerical)' },
  { id: 'minimum', label: 'Minimum', description: 'Local minima in the visible window (numerical)' },
  { id: 'maximum', label: 'Maximum', description: 'Local maxima in the visible window (numerical)' },
  { id: 'intersect', label: 'Intersect', description: 'Where two functions meet in the visible window (numerical)' },
  { id: 'derivative', label: 'dy/dx', description: 'Numerical derivative at x' },
  { id: 'tangent', label: 'Tangent', description: 'Tangent line at x' },
  { id: 'integral', label: '∫ f dx', description: 'Definite integral between two bounds (numerical)' },
];

export interface ResultRow {
  /** TeX shown for this row */
  tex: string;
  x?: number;
  y?: number;
  exact?: boolean;
}

export interface AnalysisOutput {
  rows: ResultRow[];
  shade?: { a: number; b: number };
  tangent?: { x0: number; y0: number; m: number };
  note?: string;
}

/** Evaluate a user-entered number such as "π/2" or "-3". */
export function evalInputNumber(src: string, ctx: EvalContext): Scalar {
  if (!src.trim()) throw new MathError('SYNTAX', 'Enter a value');
  const v = evaluate(parse(src), ctx);
  if (v.kind !== 'scalar') throw new MathError('DATA TYPE', 'Enter a single number');
  return v;
}

const fx = (n: number, f: FormatOptions) => formatNumber(n, f).replace('ᴇ', '\\text{E}');

export function runAnalysis(
  tool: Tool,
  opts: {
    f: (x: number) => number;
    ast: Node | null;
    name: string;
    g?: (x: number) => number;
    gName?: string;
    ctx: EvalContext;
    xInput: string;
    aInput: string;
    bInput: string;
    xMin: number;
    xMax: number;
    format: FormatOptions;
  },
): AnalysisOutput {
  const { f, ctx, xMin, xMax, format, name } = opts;
  const fmt = (n: number) => fx(n, format);
  switch (tool) {
    case 'value': {
      const xs = evalInputNumber(opts.xInput, ctx);
      // Try an exact evaluation first (e.g. f(1/2) = -15/4)
      let y: Scalar | null = null;
      if (opts.ast) {
        try {
          const v = evaluate(opts.ast, { ...ctx, vars: { ...ctx.vars, x: xs } });
          if (v.kind === 'scalar') y = v;
        } catch {
          y = null;
        }
      }
      const yn = y ? y.n : f(xs.n);
      if (!Number.isFinite(yn)) return { rows: [{ tex: `${name}\\left(${fmt(xs.n)}\\right)\\ \\text{is undefined}`, x: xs.n }] };
      const out = y ? formatScalar(y, format) : null;
      const exact = !!out?.exact;
      const tex = exact
        ? `${name}\\left(${formatScalar(xs, format).tex}\\right) = ${out!.tex}${out!.approxTex ? ` \\approx ${out!.approxTex}` : ''}`
        : `${name}\\left(${fmt(xs.n)}\\right) \\approx ${fmt(yn)}`;
      return { rows: [{ tex, x: xs.n, y: yn, exact }] };
    }
    case 'zero': {
      const roots = findRoots(f, xMin, xMax);
      return {
        rows: roots.map((x) => ({ tex: `x \\approx ${fmt(x)}`, x, y: 0 })),
        note: roots.length ? undefined : 'No zeros in the visible window. Pan or zoom out to search elsewhere.',
      };
    }
    case 'minimum':
    case 'maximum': {
      const ex = findExtrema(f, xMin, xMax).filter((e) => e.kind === (tool === 'minimum' ? 'min' : 'max'));
      return {
        rows: ex.map((e) => ({ tex: `\\left(${fmt(e.x)},\\ ${fmt(e.y)}\\right)`, x: e.x, y: e.y })),
        note: ex.length ? undefined : `No local ${tool} in the visible window.`,
      };
    }
    case 'intersect': {
      if (!opts.g) return { rows: [], note: 'Choose a second function.' };
      const pts = findIntersections(f, opts.g, xMin, xMax);
      return {
        rows: pts.map((p) => ({ tex: `\\left(${fmt(p.x)},\\ ${fmt(p.y)}\\right)`, x: p.x, y: p.y })),
        note: pts.length ? undefined : `${name} and ${opts.gName} do not meet in the visible window.`,
      };
    }
    case 'derivative':
    case 'tangent': {
      const x = evalInputNumber(opts.xInput, ctx).n;
      const y = f(x);
      if (!Number.isFinite(y)) return { rows: [{ tex: `${name}\\ \\text{is undefined at } x = ${fmt(x)}` }] };
      const m = derivative(f, x);
      if (!Number.isFinite(m)) return { rows: [{ tex: `\\text{No derivative at } x = ${fmt(x)}`, x, y }], note: 'The function has a corner, cusp, jump or vertical tangent here.' };
      if (tool === 'derivative') {
        return { rows: [{ tex: `\\left.\\frac{dy}{dx}\\right|_{x=${fmt(x)}} \\approx ${fmt(m)}`, x, y }], tangent: undefined };
      }
      const b = y - m * x;
      const bTex = Math.abs(b) < 1e-14 ? '' : b < 0 ? ` - ${fmt(-b)}` : ` + ${fmt(b)}`;
      return {
        rows: [
          { tex: `y \\approx ${fmt(m)}x${bTex}`, x, y },
          { tex: `\\text{slope} \\approx ${fmt(m)}\\ \\text{at}\\ \\left(${fmt(x)},\\ ${fmt(y)}\\right)`, x, y },
        ],
        tangent: { x0: x, y0: y, m },
      };
    }
    case 'integral': {
      const a = evalInputNumber(opts.aInput, ctx).n;
      const b = evalInputNumber(opts.bInput, ctx).n;
      const r = integrate(f, a, b);
      if (Number.isNaN(r.value)) {
        return { rows: [{ tex: '\\text{Integral undefined}' }], note: 'The function is undefined somewhere between the bounds.', shade: { a, b } };
      }
      return {
        rows: [{ tex: `\\int_{${fmt(a)}}^{${fmt(b)}} ${name}\\,dx \\approx ${fmt(r.value)}` }],
        shade: { a, b },
        note: r.reliable ? 'Signed area: regions below the x-axis count as negative.' : 'Warning: the integral did not converge to full accuracy — it may diverge.',
      };
    }
  }
}
