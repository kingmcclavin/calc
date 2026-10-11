import type { Node } from './ast';
import { FN_MAP, displayName } from './functions';

/** Precedence levels used to decide where parentheses are required. */
const P = { logic: 0.2, rel: 0.5, add: 1, mul: 2, unary: 3, pow: 4, post: 5, atom: 6 } as const;
const REL_TEX: Record<string, string> = { '=': '=', '≠': '\\ne', '<': '<', '>': '>', '≤': '\\le', '≥': '\\ge' };

function prec(n: Node): number {
  switch (n.type) {
    case 'binary':
      if (n.op === 'and' || n.op === 'or' || n.op === 'xor') return P.logic;
      if (n.op in REL_TEX) return P.rel;
      if (n.op === '+' || n.op === '-') return P.add;
      if (n.op === '^') return P.pow;
      if (n.op === '/') return P.atom; // \frac is self-delimiting
      return P.mul;
    case 'unary':
      return P.unary;
    case 'postfix':
      return P.post;
    case 'store':
      return 0;
    case 'num':
      return n.value < 0 ? P.unary : P.atom;
    default:
      return P.atom;
  }
}

const paren = (s: string) => `\\left(${s}\\right)`;

function numTex(text: string): string {
  const m = /^(-?[0-9.]+)e(-?\d+)$/.exec(text);
  if (m) return `${m[1]}\\times10^{${m[2]}}`;
  return text;
}

function varTex(name: string): string {
  if (name === 'θ') return '\\theta';
  if (name === 'Ans') return '\\mathrm{Ans}';
  const l = /^L(\d)$/.exec(name);
  if (l) return `\\mathrm{L}_{${l[1]}}`;
  return name;
}

/** Does the LaTeX of this node start with a digit (so juxtaposition would be ambiguous)? */
function startsWithDigit(n: Node): boolean {
  switch (n.type) {
    case 'num':
      return true;
    case 'binary':
      return n.op !== '/' && startsWithDigit(n.left);
    case 'postfix':
      return startsWithDigit(n.arg);
    case 'unary':
      return true;
    default:
      return false;
  }
}

export function toTex(n: Node): string {
  switch (n.type) {
    case 'num':
      return numTex(n.text);
    case 'const':
      return n.name === 'pi' ? '\\pi' : 'e';
    case 'var':
      return varTex(n.name);
    case 'list':
      return `\\left\\{${n.items.map(toTex).join(',\\,')}\\right\\}`;
    case 'store':
      return `${toTex(n.value)}\\rightarrow ${varTex(n.target)}`;
    case 'unary': {
      const inner = prec(n.arg) <= P.add || n.arg.type === 'unary' ? paren(toTex(n.arg)) : toTex(n.arg);
      return `${n.op}${inner}`;
    }
    case 'postfix': {
      const inner = prec(n.arg) < P.atom ? paren(toTex(n.arg)) : toTex(n.arg);
      return n.op === '!' ? `${inner}!` : `${inner}^{\\circ}`;
    }
    case 'binary': {
      const { op, left, right } = n;
      if (op === '/') return `\\frac{${toTex(left)}}{${toTex(right)}}`;
      if (op === 'and' || op === 'or' || op === 'xor') {
        const side = (k: Node) => (prec(k) < P.logic ? paren(toTex(k)) : toTex(k));
        return `${side(left)}\\ \\mathrm{${op}}\\ ${side(right)}`;
      }
      if (op in REL_TEX) {
        const side = (k: Node) => (prec(k) <= P.rel ? paren(toTex(k)) : toTex(k));
        return `${side(left)} ${REL_TEX[op]} ${side(right)}`;
      }
      if (op === '^') {
        const base = prec(left) < P.atom || left.type === 'call' && !/^(abs|sqrt|cbrt|root|floor|ceil)$/.test(left.name) && !/^Y/.test(left.name)
          ? paren(toTex(left))
          : toTex(left);
        return `${base}^{${toTex(right)}}`;
      }
      if (op === '+' || op === '-') {
        const l = prec(left) < P.add ? paren(toTex(left)) : toTex(left);
        const needR = prec(right) <= (op === '-' ? P.add : 0) || right.type === 'unary' || (right.type === 'num' && right.value < 0);
        const r = needR ? paren(toTex(right)) : toTex(right);
        return `${l}${op}${r}`;
      }
      if (op === 'nPr' || op === 'nCr') {
        const l = prec(left) < P.unary ? paren(toTex(left)) : toTex(left);
        const r = prec(right) < P.unary ? paren(toTex(right)) : toTex(right);
        return `${l}\\,\\mathrm{${op}}\\,${r}`;
      }
      // multiplication
      const l = prec(left) < P.mul ? paren(toTex(left)) : toTex(left);
      const rightNeedsParen = prec(right) <= P.mul && !(right.type === 'binary' && right.op === '/');
      const r = rightNeedsParen ? paren(toTex(right)) : toTex(right);
      if (n.implicit && !startsWithDigit(right) && !rightNeedsParen) return `${l}${r}`;
      if (n.implicit && rightNeedsParen) return `${l}${r}`;
      return `${l}\\cdot ${r}`;
    }
    case 'call':
      return callTex(n.name, n.args);
  }
}

function callTex(name: string, args: Node[]): string {
  const a = args.map(toTex);
  const y = /^Y(\d+)$/.exec(name);
  if (y) return `Y_{${y[1]}}${paren(a[0])}`;
  switch (name) {
    case 'sqrt':
      return `\\sqrt{${a[0]}}`;
    case 'cbrt':
      return `\\sqrt[3]{${a[0]}}`;
    case 'root':
      return `\\sqrt[${a[1]}]{${a[0]}}`;
    case 'abs':
      return `\\left|${a[0]}\\right|`;
    case 'floor':
      return `\\left\\lfloor ${a[0]}\\right\\rfloor`;
    case 'ceil':
      return `\\left\\lceil ${a[0]}\\right\\rceil`;
    case 'exp':
      return `e^{${a[0]}}`;
    case 'log':
      return args.length === 2 ? `\\log_{${a[1]}}${paren(a[0])}` : `\\log${paren(a[0])}`;
    case 'nderiv':
      return `\\left.\\frac{d}{d${a[1]}}${paren(a[0])}\\right|_{${a[1]}=${a[2]}}`;
    case 'fnint':
      return `\\int_{${a[2]}}^{${a[3]}}${a[0]}\\,d${a[1]}`;
    case 'sum':
      if (args.length === 4) return `\\sum_{${a[1]}=${a[2]}}^{${a[3]}}${paren(a[0])}`;
      break;
    case 'prod':
      if (args.length === 4) return `\\prod_{${a[1]}=${a[2]}}^{${a[3]}}${paren(a[0])}`;
      break;
  }
  const info = FN_MAP[name];
  const op = info?.tex ?? `\\operatorname{${displayName(name)}}`;
  return `${op}${paren(a.join(',\\,'))}`;
}

/** Escape plain text for inclusion inside \text{}. */
export function texEscape(s: string): string {
  return s.replace(/[\\{}$&#^_%~]/g, (c) => `\\${c}`);
}
