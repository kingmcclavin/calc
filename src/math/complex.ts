/**
 * Complex arithmetic for the a+bi and re^(θi) modes. Used when an
 * expression contains i, or when a real calculation would be NONREAL
 * while a complex mode is selected.
 */
import { MathError, type Node } from './ast';
import { applyNumeric, compareNum, relHolds, type EvalContext } from './evaluate';
import { formatNumber, formatNumberTex, type FormatOptions } from './format';

export interface Complex {
  re: number;
  im: number;
}

const C = (re: number, im = 0): Complex => ({ re, im });
const isReal = (z: Complex) => z.im === 0;

export const cadd = (a: Complex, b: Complex) => C(a.re + b.re, a.im + b.im);
export const csub = (a: Complex, b: Complex) => C(a.re - b.re, a.im - b.im);
export const cmul = (a: Complex, b: Complex) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export function cdiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new MathError('DIVIDE BY 0', 'Division by zero');
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
export const cabs = (z: Complex) => Math.hypot(z.re, z.im);
export const carg = (z: Complex) => Math.atan2(z.im, z.re);
export const cexp = (z: Complex) => C(Math.exp(z.re) * Math.cos(z.im), Math.exp(z.re) * Math.sin(z.im));
export function cln(z: Complex): Complex {
  if (z.re === 0 && z.im === 0) throw new MathError('DOMAIN', 'ln(0) is undefined');
  return C(Math.log(cabs(z)), carg(z));
}
export function cpow(a: Complex, b: Complex): Complex {
  if (isReal(b) && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
    // exact repeated multiplication keeps (1+i)^2 = 2i clean
    let r = C(1);
    for (let k = 0; k < Math.abs(b.re); k++) r = cmul(r, a);
    return b.re < 0 ? cdiv(C(1), r) : r;
  }
  if (a.re === 0 && a.im === 0) {
    if (b.re > 0) return C(0);
    throw new MathError('DOMAIN', '0 to a non-positive power is undefined');
  }
  return cexp(cmul(b, cln(a)));
}
export const csqrt = (z: Complex) => {
  const r = cabs(z);
  const re = Math.sqrt((r + z.re) / 2);
  const im = Math.sign(z.im || 1) * Math.sqrt((r - z.re) / 2);
  return C(re, z.im === 0 && z.re >= 0 ? 0 : im);
};
const csin = (z: Complex) => C(Math.sin(z.re) * Math.cosh(z.im), Math.cos(z.re) * Math.sinh(z.im));
const ccos = (z: Complex) => C(Math.cos(z.re) * Math.cosh(z.im), -Math.sin(z.re) * Math.sinh(z.im));

/** Remove floating noise such as 1.2e-16i. */
function clean(z: Complex): Complex {
  const scale = Math.max(Math.abs(z.re), Math.abs(z.im), 1e-300);
  return C(Math.abs(z.re) < 1e-14 * scale ? 0 : z.re, Math.abs(z.im) < 1e-14 * scale ? 0 : z.im);
}

export function evaluateComplex(node: Node, ctx: EvalContext, complexVars: Record<string, Complex> = {}): Complex {
  const deg = ctx.angle === 'deg';
  const toRad = deg ? Math.PI / 180 : 1;
  const ev = (n: Node): Complex => {
    switch (n.type) {
      case 'num':
        return C(n.value);
      case 'const':
        return n.name === 'i' ? C(0, 1) : C(n.name === 'pi' ? Math.PI : Math.E);
      case 'var': {
        if (complexVars[n.name]) return complexVars[n.name];
        const v = ctx.vars[n.name];
        if (!v) throw new MathError('UNDEFINED', `Variable ${n.name} has no value`);
        return C(v.n);
      }
      case 'unary': {
        const a = ev(n.arg);
        return n.op === '-' ? C(-a.re, a.im === 0 ? 0 : -a.im) : a;
      }
      case 'postfix': {
        const a = ev(n.arg);
        if (n.op === '°') return C(a.re * (deg ? 1 : Math.PI / 180), a.im * (deg ? 1 : Math.PI / 180));
        if (!isReal(a)) throw new MathError('DATA TYPE', 'Factorial needs a real number');
        return C(applyNumeric('gamma', [a.re + 1], ctx.angle));
      }
      case 'store':
        return ev(n.value);
      case 'binary': {
        const a = ev(n.left);
        const b = ev(n.right);
        switch (n.op) {
          case '+':
            return cadd(a, b);
          case '-':
            return csub(a, b);
          case '*':
            return cmul(a, b);
          case '/':
            return cdiv(a, b);
          case '^':
            return cpow(a, b);
          case '=':
          case '≠': {
            const eq = compareNum(a.re, b.re) === 0 && compareNum(a.im, b.im) === 0;
            return C(relHolds(n.op, eq ? 0 : 1) ? 1 : 0);
          }
          default:
            if (!isReal(a) || !isReal(b)) throw new MathError('DATA TYPE', `${n.op} needs real numbers`);
            return C(relHolds(n.op, compareNum(a.re, b.re)) ? 1 : 0);
        }
      }
      case 'call': {
        const args = n.args.map(ev);
        const z = args[0];
        switch (n.name) {
          case 'sqrt':
            return csqrt(z);
          case 'abs':
            return C(cabs(z));
          case 'conj':
            return C(z.re, -z.im);
          case 'real':
            return C(z.re);
          case 'imag':
            return C(z.im);
          case 'angle':
            return C(carg(z) / toRad);
          case 'exp':
            return cexp(z);
          case 'ln':
            return cln(z);
          case 'log':
            return args.length === 2 ? cdiv(cln(z), cln(args[1])) : cdiv(cln(z), C(Math.LN10));
          case 'sin':
            return csin(C(z.re * toRad, z.im * toRad));
          case 'cos':
            return ccos(C(z.re * toRad, z.im * toRad));
          case 'tan':
            return cdiv(csin(C(z.re * toRad, z.im * toRad)), ccos(C(z.re * toRad, z.im * toRad)));
        }
        if (args.every(isReal)) {
          const v = applyNumeric(n.name, args.map((a) => a.re), ctx.angle);
          if (Number.isNaN(v)) throw new MathError('DOMAIN', `${n.name} is undefined for this input`);
          return C(v);
        }
        throw new MathError('DATA TYPE', `${n.name} does not accept complex numbers`);
      }
      case 'list':
        throw new MathError('DATA TYPE', 'Lists are not supported with complex numbers');
    }
  };
  const z = clean(ev(node));
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) throw new MathError('OVERFLOW', 'Result is too large');
  return z;
}

/** Does the expression mention the imaginary unit i? */
export function usesI(node: Node): boolean {
  switch (node.type) {
    case 'const':
      return node.name === 'i';
    case 'binary':
      return usesI(node.left) || usesI(node.right);
    case 'unary':
    case 'postfix':
      return usesI(node.arg);
    case 'call':
      return node.args.some(usesI);
    case 'list':
      return node.items.some(usesI);
    case 'store':
      return usesI(node.value);
    default:
      return false;
  }
}

/** Format as a+bi or re^(θi) (θ in radians, as on the TI-84). */
export function formatComplex(z: Complex, form: 'rect' | 'polar', opt: FormatOptions): { tex: string; text: string } {
  if (form === 'polar') {
    const r = cabs(z);
    const t = carg(z);
    if (t === 0) return { tex: formatNumberTex(r, opt), text: formatNumber(r, opt) };
    return {
      tex: `${formatNumberTex(r, opt)}e^{${formatNumberTex(t, opt)}i}`,
      text: `${formatNumber(r, opt)}e^(${formatNumber(t, opt)}i)`,
    };
  }
  if (z.im === 0) return { tex: formatNumberTex(z.re, opt), text: formatNumber(z.re, opt) };
  const imAbs = Math.abs(z.im);
  const imTex = imAbs === 1 ? '' : formatNumberTex(imAbs, opt);
  const imText = imAbs === 1 ? '' : formatNumber(imAbs, opt);
  if (z.re === 0) return { tex: `${z.im < 0 ? '-' : ''}${imTex}i`, text: `${z.im < 0 ? '-' : ''}${imText}i` };
  const sign = z.im < 0 ? '-' : '+';
  return { tex: `${formatNumberTex(z.re, opt)}${sign}${imTex}i`, text: `${formatNumber(z.re, opt)}${sign}${imText}i` };
}
