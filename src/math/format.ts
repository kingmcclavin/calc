import type { Rational } from './rational';
import type { Scalar, Value } from './evaluate';

export interface FormatOptions {
  /** 'float' uses `digits` significant digits; 'fix' uses `digits` decimal places */
  mode: 'float' | 'fix';
  digits: number;
}

export const DEFAULT_FORMAT: FormatOptions = { mode: 'float', digits: 10 };

interface NumParts {
  mantissa: string;
  exponent: number | null;
}

function numParts(x: number, opt: FormatOptions): NumParts {
  if (x === 0 || Object.is(x, -0)) return { mantissa: opt.mode === 'fix' ? (0).toFixed(opt.digits) : '0', exponent: null };
  const ax = Math.abs(x);
  const sig = Math.min(Math.max(opt.digits, 1), 15);
  const useSci = ax >= 1e10 || ax < 1e-4 || (opt.mode === 'fix' && ax < 10 ** -opt.digits && ax !== 0);
  if (useSci) {
    const [m, e] = x.toExponential(opt.mode === 'fix' ? Math.min(opt.digits, 14) : sig - 1).split('e');
    let mant = m;
    if (opt.mode === 'float' && mant.includes('.')) mant = mant.replace(/\.?0+$/, '');
    return { mantissa: mant, exponent: Number(e) };
  }
  if (opt.mode === 'fix') return { mantissa: x.toFixed(Math.min(opt.digits, 12)), exponent: null };
  let s = x.toPrecision(sig);
  if (s.includes('e')) {
    // toPrecision may switch to exponential for big integers
    const [m, e] = s.split('e');
    return { mantissa: m.replace(/\.?0+$/, ''), exponent: Number(e) };
  }
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return { mantissa: s, exponent: null };
}

/** Plain text form (also suitable for re-entry), e.g. "1.5ᴇ12", "-0.25". */
export function formatNumber(x: number, opt: FormatOptions = DEFAULT_FORMAT): string {
  if (Number.isNaN(x)) return 'undefined';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const { mantissa, exponent } = numParts(x, opt);
  return exponent === null ? mantissa : `${mantissa}ᴇ${exponent}`;
}

export function formatNumberTex(x: number, opt: FormatOptions = DEFAULT_FORMAT): string {
  if (Number.isNaN(x)) return '\\text{undefined}';
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : '-\\infty';
  const { mantissa, exponent } = numParts(x, opt);
  return exponent === null ? mantissa : `${mantissa}\\times10^{${exponent}}`;
}

export interface FormattedResult {
  /** Main TeX to show */
  tex: string;
  /** Secondary TeX (decimal approximation for fractions) */
  approxTex?: string;
  /** Text inserted when the user reuses the result */
  text: string;
  /** True if the main form is exact */
  exact: boolean;
}

const MAX_EXACT_DIGITS = 40;

export function ratText(r: Rational): string {
  return r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`;
}

export function ratTex(r: Rational): string {
  if (r.d === 1n) return r.n.toString();
  const neg = r.n < 0n;
  return `${neg ? '-' : ''}\\frac{${(neg ? -r.n : r.n).toString()}}{${r.d.toString()}}`;
}

export function formatScalar(s: Scalar, opt: FormatOptions = DEFAULT_FORMAT): FormattedResult {
  const decText = formatNumber(s.n, opt);
  const decTex = formatNumberTex(s.n, opt);
  const r = s.r;
  if (r && r.n.toString().length <= MAX_EXACT_DIGITS && r.d.toString().length <= MAX_EXACT_DIGITS) {
    if (r.d === 1n) {
      // Integers: show exactly unless it would be very long; in Fix mode keep the decimals
      if (opt.mode === 'fix') return { tex: decTex, text: decText, exact: false };
      const t = r.n.toString();
      if (t.replace('-', '').length <= 15) return { tex: t, text: t, exact: true };
      return { tex: decTex, approxTex: t, text: t, exact: true };
    }
    // Terminating decimals with large denominators (e.g. 3.14159) read better as decimals
    let d = r.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    if (d === 1n && r.d > 1000n && opt.mode === 'float') {
      return { tex: decTex, text: decText, exact: decText.replace(/[ᴇ-]/g, '').length <= opt.digits + 1 };
    }
    return { tex: ratTex(r), approxTex: decTex, text: ratText(r), exact: true };
  }
  return { tex: decTex, text: decText, exact: false };
}

export function formatValue(v: Value, opt: FormatOptions = DEFAULT_FORMAT): FormattedResult {
  if (v.kind === 'scalar') return formatScalar(v, opt);
  const parts = v.items.map((it) => formatScalar(it, opt));
  const anyApprox = parts.some((p) => !p.exact);
  return {
    tex: `\\left\\{${parts.map((p) => p.tex).join(',\\,')}\\right\\}`,
    text: `{${parts.map((p) => p.text).join(',')}}`,
    exact: !anyApprox,
  };
}
