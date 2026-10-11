/**
 * Exact rational arithmetic on BigInt. Used so that expressions built only
 * from rational operations (e.g. 1/3 + 1/6, 0.1 + 0.2, 2^-3, 20!) produce an
 * exact result alongside the floating-point approximation.
 */
export interface Rational {
  readonly n: bigint; // numerator (carries the sign)
  readonly d: bigint; // denominator, always > 0
}

/** Results whose numerator/denominator exceed this many digits are dropped to floating point. */
const MAX_DIGITS = 400;

function babs(a: bigint): bigint {
  return a < 0n ? -a : a;
}

export function bgcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

function tooBig(x: bigint): boolean {
  // cheap magnitude check: 10^400 ~ 2^1329
  const a = babs(x);
  return a > 0n && a.toString(16).length > (MAX_DIGITS * 3.33) / 4;
}

/** Build a normalised rational, or null if it grows unreasonably large. */
export function rat(n: bigint, d: bigint = 1n): Rational | null {
  if (d === 0n) return null;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = bgcd(n, d);
  if (g > 1n) {
    n /= g;
    d /= g;
  }
  if (tooBig(n) || tooBig(d)) return null;
  return { n, d };
}

export const R_ZERO: Rational = { n: 0n, d: 1n };
export const R_ONE: Rational = { n: 1n, d: 1n };

/** Parse a decimal literal such as "12.375" exactly. */
export function ratFromDecimalString(s: string): Rational | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const intPart = m[1] || '0';
  const frac = m[2] ?? '';
  const n = BigInt(intPart + frac);
  const d = 10n ** BigInt(frac.length);
  return rat(n, d);
}

/** Convert an integer-valued JS number to a rational (only for safe integers). */
export function ratFromInt(x: number): Rational | null {
  if (!Number.isSafeInteger(x)) return null;
  return { n: BigInt(x), d: 1n };
}

export function add(a: Rational, b: Rational): Rational | null {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}
export function sub(a: Rational, b: Rational): Rational | null {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}
export function mul(a: Rational, b: Rational): Rational | null {
  return rat(a.n * b.n, a.d * b.d);
}
export function div(a: Rational, b: Rational): Rational | null {
  if (b.n === 0n) return null;
  return rat(a.n * b.d, a.d * b.n);
}
export function neg(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}
export function isInt(a: Rational): boolean {
  return a.d === 1n;
}
export function isZero(a: Rational): boolean {
  return a.n === 0n;
}
export function cmp(a: Rational, b: Rational): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

/** Integer power with a guard on result size. */
export function powInt(a: Rational, e: bigint): Rational | null {
  if (e === 0n) return R_ONE;
  if (e < 0n) {
    if (a.n === 0n) return null;
    const p = powInt(a, -e);
    return p ? div(R_ONE, p) : null;
  }
  // Rough size guard: digits(a)^e
  const digits = Math.max(babs(a.n).toString().length, a.d.toString().length);
  if (digits * Number(e) > MAX_DIGITS * 1.2 && !(babs(a.n) === 1n && a.d === 1n)) return null;
  return rat(a.n ** e, a.d ** e);
}

/** Exact integer k-th root of a non-negative BigInt, or null if not a perfect power. */
export function bigIntRoot(x: bigint, k: number): bigint | null {
  if (x < 0n) return null;
  if (x < 2n) return x;
  // Newton iteration starting from a floating estimate
  let r = BigInt(Math.floor(Math.pow(Number(x), 1 / k)));
  if (r < 1n) r = 1n;
  const K = BigInt(k);
  for (let i = 0; i < 200; i++) {
    const rk1 = r ** (K - 1n);
    const next = ((K - 1n) * r + x / rk1) / K;
    if (next >= r && i > 0) break;
    r = next;
  }
  for (const c of [r - 1n, r, r + 1n]) {
    if (c >= 0n && c ** K === x) return c;
  }
  return null;
}

/** Exact k-th root of a rational when it is a perfect power, else null. */
export function rootExact(a: Rational, k: number): Rational | null {
  if (a.n < 0n) {
    if (k % 2 === 0) return null;
    const r = rootExact(neg(a), k);
    return r ? neg(r) : null;
  }
  const n = bigIntRoot(a.n, k);
  const d = bigIntRoot(a.d, k);
  if (n === null || d === null) return null;
  return rat(n, d);
}

export function toNumber(a: Rational): number {
  const n = Number(a.n);
  const d = Number(a.d);
  if (Number.isFinite(n) && Number.isFinite(d) && Math.abs(n) < 2 ** 53 && d < 2 ** 53) return n / d;
  // High-precision path for large parts: scale to keep ~17 significant digits.
  const neg = a.n < 0n;
  const num = neg ? -a.n : a.n;
  const shift = num.toString().length - a.d.toString().length - 20;
  let q: number;
  if (shift >= 0) {
    q = Number(num / (a.d * 10n ** BigInt(shift))) * 10 ** shift;
  } else {
    q = Number((num * 10n ** BigInt(-shift)) / a.d) / 10 ** -shift;
  }
  if (!Number.isFinite(q) && shift < 0) {
    q = Number((num * 10n ** BigInt(-shift)) / a.d) * 10 ** shift;
  }
  return neg ? -q : q;
}

export function factorialBig(n: number): bigint {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

/**
 * Split a positive integer into k*k*m with m square-free (k² is the largest
 * square factor). Trial division only up to a bound, which is fine for the
 * magnitudes produced by the solver; residual factors are left inside m.
 */
export function squareFreeSplit(x: bigint): { outside: bigint; inside: bigint } {
  let outside = 1n;
  let inside = 1n;
  let rest = x;
  for (let p = 2n; p * p <= rest && p < 100000n; p += p === 2n ? 1n : 2n) {
    let count = 0;
    while (rest % p === 0n) {
      rest /= p;
      count++;
    }
    if (count) {
      outside *= p ** BigInt(Math.floor(count / 2));
      if (count % 2) inside *= p;
    }
  }
  // rest may itself be a perfect square (large prime squared)
  const r = bigIntRoot(rest, 2);
  if (r !== null) outside *= r;
  else inside *= rest;
  return { outside, inside };
}
