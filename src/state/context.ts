import { useCallback, useMemo } from 'react';
import type { Node } from '../math/ast';
import { calculate, toFailure } from '../math/engine';
import { compileFn, type EvalContext } from '../math/evaluate';
import { parse } from '../math/parser';
import { fromStored, useStore, type GraphFn } from './store';

export interface ParsedFn {
  fn: GraphFn;
  /** Y-name by position: Y1, Y2, ... */
  name: string;
  index: number;
  ast: Node | null;
  error: string | null;
  /** compiled evaluator (null on error or empty) */
  f: ((x: number) => number) | null;
}

const parseCache = new Map<string, { ast: Node | null; error: string | null }>();

export function parseCached(expr: string): { ast: Node | null; error: string | null } {
  let hit = parseCache.get(expr);
  if (!hit) {
    try {
      // Allow users to type "y = …" or "Y1 = …"
      const body = expr.replace(/^\s*(y\d*|Y\d*)\s*=/, '');
      hit = body.trim() ? { ast: parse(body), error: null } : { ast: null, error: null };
    } catch (e) {
      hit = { ast: null, error: toFailure(e).error };
    }
    if (parseCache.size > 500) parseCache.clear();
    parseCache.set(expr, hit);
  }
  return hit;
}

/** Build the evaluation context (variables, lists, Y-functions, angle mode) from the store. */
export function useEvalContext(): EvalContext {
  const vars = useStore((s) => s.vars);
  const lists = useStore((s) => s.lists);
  const functions = useStore((s) => s.functions);
  const angle = useStore((s) => s.settings.angle);
  return useMemo(() => buildContext(vars, lists, functions, angle), [vars, lists, functions, angle]);
}

export function buildContext(
  vars: Record<string, import('./store').StoredScalar>,
  lists: Record<string, number[]>,
  functions: GraphFn[],
  angle: 'rad' | 'deg',
): EvalContext {
  const v: EvalContext['vars'] = {};
  for (const [k, s] of Object.entries(vars)) v[k] = fromStored(s);
  const fnMap: EvalContext['functions'] = {};
  functions.forEach((f, i) => {
    fnMap[`Y${i + 1}`] = parseCached(f.expr).ast;
  });
  return { angle, vars: v, lists, functions: fnMap };
}

/** Parsed + compiled graph functions. */
export function useParsedFunctions(): { ctx: EvalContext; parsed: ParsedFn[] } {
  const ctx = useEvalContext();
  const functions = useStore((s) => s.functions);
  const parsed = useMemo(
    () =>
      functions.map((fn, index) => {
        const { ast, error } = parseCached(fn.expr);
        let f: ParsedFn['f'] = null;
        let err = error;
        if (ast) {
          try {
            f = compileFn(ast, ctx);
            // probe once so runtime-only problems (undefined Y refs, lists) surface as errors
            f(0.5);
          } catch (e) {
            err = toFailure(e).error;
            f = null;
          }
        }
        return { fn, name: `Y${index + 1}`, index, ast, error: err, f };
      }),
    [functions, ctx],
  );
  return { ctx, parsed };
}

/** Evaluate short numeric inputs such as "-2π" or "A/2" (uses stored variables). Returns null if invalid. */
export function useNumberEvaluator() {
  const ctx = useEvalContext();
  return useCallback(
    (s: string) => {
      const r = calculate(s, ctx);
      return r.ok && r.value.kind === 'scalar' ? r.value.n : null;
    },
    [ctx],
  );
}
