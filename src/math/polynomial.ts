import type { Node } from './ast';
import * as Q from './rational';
import type { Rational } from './rational';

/**
 * Structural conversion of an expression into a polynomial in one variable
 * with exact rational coefficients. Returns null when the expression is not
 * a polynomial with rational coefficients (e.g. contains sin, π, x in a
 * denominator, or non-integer powers of x).
 */
export type Poly = Rational[]; // coefficient of x^i at index i

const MAX_DEGREE = 12;

function trim(p: Poly): Poly {
  const out = [...p];
  while (out.length > 1 && Q.isZero(out[out.length - 1])) out.pop();
  return out;
}

function padd(a: Poly, b: Poly, sign = 1n): Poly | null {
  const out: Rational[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? Q.R_ZERO;
    const y = b[i] ?? Q.R_ZERO;
    const r = sign === 1n ? Q.add(x, y) : Q.sub(x, y);
    if (!r) return null;
    out.push(r);
  }
  return trim(out);
}

function pmul(a: Poly, b: Poly): Poly | null {
  if (a.length + b.length - 2 > MAX_DEGREE) return null;
  const out: Rational[] = new Array(a.length + b.length - 1).fill(Q.R_ZERO);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const prod = Q.mul(a[i], b[j]);
      if (!prod) return null;
      const s = Q.add(out[i + j], prod);
      if (!s) return null;
      out[i + j] = s;
    }
  }
  return trim(out);
}

function constant(p: Poly): Rational | null {
  return p.length === 1 ? p[0] : null;
}

export function toPoly(n: Node, v = 'x'): Poly | null {
  switch (n.type) {
    case 'num': {
      const m = /^(-?)([0-9.]+)(?:e(-?\d+))?$/.exec(n.text);
      if (!m) return null;
      let r = Q.ratFromDecimalString(m[2]);
      if (!r) return null;
      if (m[3]) {
        const p = Q.powInt({ n: 10n, d: 1n }, BigInt(m[3]));
        if (!p) return null;
        r = Q.mul(r, p);
        if (!r) return null;
      }
      return [m[1] ? Q.neg(r) : r];
    }
    case 'var':
      return n.name === v ? [Q.R_ZERO, Q.R_ONE] : null;
    case 'unary': {
      const a = toPoly(n.arg, v);
      if (!a) return null;
      return n.op === '-' ? a.map(Q.neg) : a;
    }
    case 'binary': {
      const a = toPoly(n.left, v);
      const b = toPoly(n.right, v);
      if (!a || !b) return null;
      switch (n.op) {
        case '+':
          return padd(a, b);
        case '-':
          return padd(a, b, -1n);
        case '*':
          return pmul(a, b);
        case '/': {
          const c = constant(b);
          if (!c || Q.isZero(c)) return null;
          const out: Rational[] = [];
          for (const coef of a) {
            const q = Q.div(coef, c);
            if (!q) return null;
            out.push(q);
          }
          return out;
        }
        case '^': {
          const e = constant(b);
          if (!e || !Q.isInt(e) || e.n < 0n || e.n > BigInt(MAX_DEGREE)) return null;
          let acc: Poly = [Q.R_ONE];
          for (let i = 0n; i < e.n; i++) {
            const m = pmul(acc, a);
            if (!m) return null;
            acc = m;
          }
          return acc;
        }
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

export function polyDegree(p: Poly): number {
  const t = trim(p);
  return t.length === 1 && Q.isZero(t[0]) ? -Infinity : t.length - 1;
}
