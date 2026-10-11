/**
 * PARAMETRIC, POLAR and SEQ graph modes (FUNCTION mode uses Y1…Y10).
 * Each mode has its own list of entries; this module turns them into
 * plottable curves and table values.
 */
import { MathError, type Node } from '../math/ast';
import { compileWith, Evaluator, scalar, type EvalContext, type Scalar } from '../math/evaluate';
import { parse } from '../math/parser';
import type { PlotCurve } from './GraphCanvas';

export type ParamMode = 'par' | 'pol' | 'seq';

/** One entry of a non-function mode. par: a = X(T), b = Y(T); pol: a = r(θ); seq: a = u(n), b = u(nMin). */
export interface ModeFn {
  id: string;
  a: string;
  b?: string;
  color: string;
  visible: boolean;
}

export interface ModeWindow {
  tMin?: number;
  tMax?: number;
  tStep?: number;
  thetaMin?: number;
  thetaMax?: number;
  thetaStep?: number;
  nMin?: number;
  nMax?: number;
}

/** Window values with TI-84 defaults (which depend on the angle mode). */
export function modeWindow(w: ModeWindow, deg: boolean) {
  const full = deg ? 360 : 2 * Math.PI;
  const step = deg ? 7.5 : Math.PI / 24;
  return {
    tMin: w.tMin ?? 0,
    tMax: w.tMax ?? full,
    tStep: w.tStep ?? step,
    thetaMin: w.thetaMin ?? 0,
    thetaMax: w.thetaMax ?? full,
    thetaStep: w.thetaStep ?? step,
    nMin: w.nMin ?? 1,
    nMax: w.nMax ?? 10,
  };
}

export const SEQ_NAMES = ['u', 'v', 'w'] as const;

/** Labels shown in the editor/table, e.g. X₁T, r₂, u. */
export function modeLabels(mode: ParamMode, i: number): string[] {
  if (mode === 'par') return [`X${i + 1}T`, `Y${i + 1}T`];
  if (mode === 'pol') return [`r${i + 1}`];
  return [SEQ_NAMES[i], `${SEQ_NAMES[i]}(nMin)`];
}

/** The independent variable of each mode (what X,T,θ,n types). */
export const MODE_VARIABLE: Record<'func' | ParamMode, string> = { func: 'x', par: 'T', pol: 'θ', seq: 'n' };

/* ------------------------------------------------------------------------ */

const parseOrNull = (src: string | undefined): Node | null => (src && src.trim() ? parse(src) : null);

export interface CompiledMode {
  curves: PlotCurve[];
  /** error per entry id */
  errors: Record<string, string>;
  /** evaluate an entry at a parameter value: returns [x, y] in the plane (or [n, u(n)]) */
  pointAt: Record<string, (s: number) => { x: number; y: number; extra?: number }>;
}

function errorText(e: unknown): string {
  return e instanceof MathError ? e.message : e instanceof Error ? e.message : String(e);
}

export function compileParametric(fns: ModeFn[], ctx: EvalContext, w: ModeWindow): CompiledMode {
  const W = modeWindow(w, ctx.angle === 'deg');
  const out: CompiledMode = { curves: [], errors: {}, pointAt: {} };
  fns.forEach((fn, i) => {
    try {
      const ax = parseOrNull(fn.a);
      const ay = parseOrNull(fn.b);
      if (!ax || !ay) return;
      const fx = compileWith(ax, ctx, ['T']);
      const fy = compileWith(ay, ctx, ['T']);
      const env = [0];
      const x = (t: number) => ((env[0] = t), fx(env));
      const y = (t: number) => ((env[0] = t), fy(env));
      out.pointAt[fn.id] = (t) => ({ x: x(t), y: y(t) });
      if (fn.visible) out.curves.push({ id: fn.id, label: `X${i + 1}T, Y${i + 1}T`, color: fn.color, param: { x, y, tMin: W.tMin, tMax: W.tMax, tStep: W.tStep } });
    } catch (e) {
      out.errors[fn.id] = errorText(e);
    }
  });
  return out;
}

export function compilePolar(fns: ModeFn[], ctx: EvalContext, w: ModeWindow): CompiledMode {
  const deg = ctx.angle === 'deg';
  const W = modeWindow(w, deg);
  const toRad = deg ? Math.PI / 180 : 1;
  const out: CompiledMode = { curves: [], errors: {}, pointAt: {} };
  fns.forEach((fn, i) => {
    try {
      const ar = parseOrNull(fn.a);
      if (!ar) return;
      const fr = compileWith(ar, ctx, ['θ']);
      const env = [0];
      const r = (th: number) => ((env[0] = th), fr(env));
      const x = (th: number) => r(th) * Math.cos(th * toRad);
      const y = (th: number) => r(th) * Math.sin(th * toRad);
      out.pointAt[fn.id] = (th) => ({ x: x(th), y: y(th), extra: r(th) });
      if (fn.visible) out.curves.push({ id: fn.id, label: `r${i + 1}`, color: fn.color, param: { x, y, tMin: W.thetaMin, tMax: W.thetaMax, tStep: W.thetaStep } });
    } catch (e) {
      out.errors[fn.id] = errorText(e);
    }
  });
  return out;
}

/* ------------------------------- sequences ------------------------------- */

/**
 * Replace u(n−1), u(n−2) (and v, w) with internal variables so recursive
 * formulas can be evaluated step by step. In SEQ mode "u(…)" is parsed as
 * the implicit product U·(…), which is what we look for here.
 */
function rewriteSeq(node: Node): Node {
  const isN = (k: Node) => k.type === 'var' && k.name === 'N';
  const offset = (k: Node): number | null => {
    if (isN(k)) return 0;
    if (k.type === 'binary' && k.op === '-' && isN(k.left) && k.right.type === 'num' && Number.isInteger(k.right.value)) return k.right.value;
    return null;
  };
  const seqRef = (name: string, index: Node): Node => {
    const off = offset(index);
    if (off === 1 || off === 2) return { type: 'var', name: `__${name.toLowerCase()}${off}` };
    throw new MathError('SYNTAX', `Use ${name.toLowerCase()}(n−1) or ${name.toLowerCase()}(n−2) to refer to earlier terms`);
  };
  const isSeqVar = (k: Node): k is { type: 'var'; name: string } => k.type === 'var' && /^[UVW]$/.test(k.name);
  const visit = (k: Node): Node => {
    if (k.type === 'binary' && k.op === '*' && k.implicit) {
      // u(n−1)
      if (isSeqVar(k.left)) return seqRef(k.left.name, k.right);
      // 2u(n−1) parses as (2·u)·(n−1)
      if (k.left.type === 'binary' && k.left.op === '*' && k.left.implicit && isSeqVar(k.left.right)) {
        return { type: 'binary', op: '*', left: visit(k.left.left), right: seqRef(k.left.right.name, k.right) };
      }
    }
    switch (k.type) {
      case 'binary':
        return { ...k, left: visit(k.left), right: visit(k.right) };
      case 'unary':
      case 'postfix':
        return { ...k, arg: visit(k.arg) };
      case 'call':
        return { ...k, args: k.args.map(visit) };
      case 'list':
        return { ...k, items: k.items.map(visit) };
      case 'store':
        return { ...k, value: visit(k.value) };
      default:
        return k;
    }
  };
  return visit(node);
}

/** Compute the terms u(n), v(n), w(n) for n = nMin … nMax. */
export function evaluateSequences(fns: ModeFn[], ctx: EvalContext, nMin: number, nMax: number): { values: Record<string, number[]>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, number[]> = {};
  const setup = fns.map((fn) => {
    try {
      const expr = parseOrNull(fn.a);
      if (!expr) return null;
      const startNode = parseOrNull(fn.b);
      const startVal = startNode ? new Evaluator(ctx).eval(startNode) : null;
      const starts: number[] = startVal ? (startVal.kind === 'list' ? startVal.items.map((s) => s.n) : [startVal.n]) : [];
      return { id: fn.id, expr: rewriteSeq(expr), starts };
    } catch (e) {
      errors[fn.id] = errorText(e);
      return null;
    }
  });
  const count = Math.max(0, Math.min(5000, Math.floor(nMax) - Math.ceil(nMin) + 1));
  const n0 = Math.ceil(nMin);
  for (const s of setup) if (s) values[s.id] = [];
  for (let k = 0; k < count; k++) {
    const n = n0 + k;
    const overrides: Record<string, Scalar> = { N: scalar(n, { n: BigInt(n), d: 1n }) };
    setup.forEach((s, i) => {
      if (!s) return;
      const name = SEQ_NAMES[i];
      const vals = values[s.id];
      for (const off of [1, 2]) {
        const v = vals[k - off];
        overrides[`__${name}${off}`] = scalar(v ?? NaN);
      }
    });
    setup.forEach((s) => {
      if (!s || errors[s.id]) return;
      const vals = values[s.id];
      if (k < s.starts.length) {
        vals.push(s.starts[k]);
        return;
      }
      try {
        const v = new Evaluator(ctx, overrides).eval(s.expr);
        vals.push(v.kind === 'scalar' ? v.n : NaN);
      } catch (e) {
        if (e instanceof MathError && e.kind === 'UNDEFINED') {
          errors[s.id] = e.message;
          return;
        }
        vals.push(NaN);
      }
      // an undefined earlier term means a starting value is missing
      if (k === 0 && Number.isNaN(vals[0]) && /__/.test(JSON.stringify(s.expr))) {
        errors[s.id] = 'This sequence refers to earlier terms — enter its starting value u(nMin)';
      }
    });
  }
  return { values, errors };
}

export function compileSequences(fns: ModeFn[], ctx: EvalContext, w: ModeWindow): CompiledMode {
  const W = modeWindow(w, ctx.angle === 'deg');
  const { values, errors } = evaluateSequences(fns, ctx, W.nMin, W.nMax);
  const out: CompiledMode = { curves: [], errors, pointAt: {} };
  const n0 = Math.ceil(W.nMin);
  fns.forEach((fn, i) => {
    const vals = values[fn.id];
    if (!vals || errors[fn.id]) return;
    out.pointAt[fn.id] = (n) => ({ x: n, y: vals[Math.round(n) - n0] ?? NaN });
    if (fn.visible) out.curves.push({ id: fn.id, label: SEQ_NAMES[i], color: fn.color, points: vals.map((y, k) => ({ x: n0 + k, y })).filter((p) => Number.isFinite(p.y)) });
  });
  return out;
}

export function compileMode(mode: ParamMode, fns: ModeFn[], ctx: EvalContext, w: ModeWindow): CompiledMode {
  if (mode === 'par') return compileParametric(fns, ctx, w);
  if (mode === 'pol') return compilePolar(fns, ctx, w);
  return compileSequences(fns, ctx, w);
}
