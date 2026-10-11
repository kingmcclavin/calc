import { MathError, type Node } from './ast';
import { evaluate, type EvalContext, type Value } from './evaluate';
import { parse } from './parser';
import { toTex } from './latex';

export interface CalcSuccess {
  ok: true;
  ast: Node;
  inputTex: string;
  value: Value;
  /** Variable the value was stored into (for "expr→A") */
  storedTo?: string;
}
export interface CalcFailure {
  ok: false;
  error: string;
  kind: string;
  pos?: number;
}
export type CalcResult = CalcSuccess | CalcFailure;

export function toFailure(e: unknown): CalcFailure {
  if (e instanceof MathError) return { ok: false, error: e.message, kind: e.kind, pos: e.pos };
  if (e instanceof RangeError) return { ok: false, error: 'Calculation is too large or too deep', kind: 'OVERFLOW' };
  return { ok: false, error: e instanceof Error ? e.message : String(e), kind: 'ERROR' };
}

/** Parse and evaluate one calculator entry. */
export function calculate(src: string, ctx: EvalContext): CalcResult {
  try {
    const ast = parse(src);
    const value = evaluate(ast, ctx);
    return {
      ok: true,
      ast,
      inputTex: toTex(ast),
      value,
      storedTo: ast.type === 'store' ? ast.target : undefined,
    };
  } catch (e) {
    return toFailure(e);
  }
}

/** Try to render an input as TeX (for live previews). Returns null if it does not parse yet. */
export function previewTex(src: string): string | null {
  if (!src.trim()) return null;
  try {
    return toTex(parse(src));
  } catch {
    return null;
  }
}
