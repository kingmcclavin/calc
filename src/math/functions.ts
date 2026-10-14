/**
 * Catalogue of built-in functions understood by the parser. Evaluation lives
 * in evaluate.ts / compile.ts; this file only describes names, arity and
 * presentation so the parser, LaTeX printer and UI menus agree.
 */
export interface FnInfo {
  name: string; // canonical lower-case name used in the AST
  minArgs: number;
  maxArgs: number;
  /** LaTeX operator name or template; `#` placeholders are replaced by args */
  tex?: string;
  /** Text inserted by keypad/menu buttons */
  insert?: string;
  description: string;
  /** Function takes an expression + variable as first two args (nDeriv, fnInt, sum) */
  calculus?: boolean;
  /** Accepts list arguments */
  listFn?: boolean;
}

const F = (name: string, minArgs: number, maxArgs: number, description: string, extra: Partial<FnInfo> = {}): FnInfo => ({
  name,
  minArgs,
  maxArgs,
  description,
  ...extra,
});

export const FUNCTIONS: FnInfo[] = [
  F('det', 1, 1, 'det(matrix): determinant', { tex: '\\det' }),
  F('identity', 1, 1, 'identity(n): n×n identity matrix', { tex: '\\operatorname{identity}' }),
  F('rref', 1, 1, 'rref(matrix): reduced row-echelon form', { tex: '\\operatorname{rref}' }),
  F('ref', 1, 1, 'ref(matrix): row-echelon form', { tex: '\\operatorname{ref}' }),
  F('mixed', 3, 3, 'Un/d mixed number: mixed(U, n, d) = U n/d'),
  F('sin', 1, 1, 'Sine (respects degree/radian mode)', { tex: '\\sin' }),
  F('cos', 1, 1, 'Cosine (respects degree/radian mode)', { tex: '\\cos' }),
  F('tan', 1, 1, 'Tangent (respects degree/radian mode)', { tex: '\\tan' }),
  F('asin', 1, 1, 'Inverse sine, returns an angle in the current mode', { tex: '\\sin^{-1}' }),
  F('acos', 1, 1, 'Inverse cosine, returns an angle in the current mode', { tex: '\\cos^{-1}' }),
  F('atan', 1, 1, 'Inverse tangent, returns an angle in the current mode', { tex: '\\tan^{-1}' }),
  F('atan2', 2, 2, 'atan2(y, x): angle of the point (x, y)', { tex: '\\operatorname{atan2}' }),
  F('sec', 1, 1, 'Secant = 1/cos', { tex: '\\sec' }),
  F('csc', 1, 1, 'Cosecant = 1/sin', { tex: '\\csc' }),
  F('cot', 1, 1, 'Cotangent = 1/tan', { tex: '\\cot' }),
  F('sinh', 1, 1, 'Hyperbolic sine', { tex: '\\sinh' }),
  F('cosh', 1, 1, 'Hyperbolic cosine', { tex: '\\cosh' }),
  F('tanh', 1, 1, 'Hyperbolic tangent', { tex: '\\tanh' }),
  F('asinh', 1, 1, 'Inverse hyperbolic sine', { tex: '\\sinh^{-1}' }),
  F('acosh', 1, 1, 'Inverse hyperbolic cosine', { tex: '\\cosh^{-1}' }),
  F('atanh', 1, 1, 'Inverse hyperbolic tangent', { tex: '\\tanh^{-1}' }),
  F('ln', 1, 1, 'Natural logarithm (base e)', { tex: '\\ln' }),
  F('log', 1, 2, 'log(x) is base 10; log(x, b) is base b', { tex: '\\log' }),
  F('exp', 1, 1, 'e raised to a power', { tex: 'e' }),
  F('sqrt', 1, 1, 'Square root', { insert: '√(' }),
  F('cbrt', 1, 1, 'Cube root', { insert: '∛(' }),
  F('root', 2, 2, 'root(x, n): the n-th root of x (odd roots of negatives are real)'),
  F('abs', 1, 1, 'Absolute value |x|'),
  F('sign', 1, 1, 'Sign of x: −1, 0 or 1', { tex: '\\operatorname{sgn}' }),
  F('floor', 1, 1, 'Greatest integer ≤ x'),
  F('ceil', 1, 1, 'Smallest integer ≥ x'),
  F('round', 1, 2, 'round(x) or round(x, digits)', { tex: '\\operatorname{round}' }),
  F('ipart', 1, 1, 'Integer part (truncates toward zero)', { tex: '\\operatorname{iPart}' }),
  F('fpart', 1, 1, 'Fractional part x − iPart(x)', { tex: '\\operatorname{fPart}' }),
  F('mod', 2, 2, 'mod(a, b): remainder with the sign of b', { tex: '\\operatorname{mod}' }),
  F('gcd', 2, 2, 'Greatest common divisor of two integers', { tex: '\\gcd' }),
  F('lcm', 2, 2, 'Least common multiple of two integers', { tex: '\\operatorname{lcm}' }),
  F('min', 1, 99, 'Smallest of the arguments (or of a list)', { tex: '\\min', listFn: true }),
  F('max', 1, 99, 'Largest of the arguments (or of a list)', { tex: '\\max', listFn: true }),
  F('npr', 2, 2, 'Permutations: nPr(n, r) = n!/(n−r)!', { tex: '\\operatorname{nPr}' }),
  F('ncr', 2, 2, 'Combinations: nCr(n, r) = n!/(r!(n−r)!)', { tex: '\\operatorname{nCr}' }),
  F('gamma', 1, 1, 'Gamma function Γ(x) = (x−1)!', { tex: '\\Gamma' }),
  F('nderiv', 3, 3, 'nDeriv(expr, x, a): numerical derivative of expr at x = a', { calculus: true, insert: 'nDeriv(' }),
  F('fnint', 4, 4, 'fnInt(expr, x, a, b): numerical definite integral', { calculus: true, insert: 'fnInt(' }),
  F('sum', 1, 4, 'sum(list), or sum(expr, k, a, b) = Σ expr for k = a..b', { listFn: true, calculus: true }),
  F('prod', 1, 4, 'prod(list), or prod(expr, k, a, b) = Π expr for k = a..b', { listFn: true, calculus: true }),
  F('mean', 1, 1, 'Arithmetic mean of a list', { listFn: true, tex: '\\operatorname{mean}' }),
  F('median', 1, 1, 'Median of a list', { listFn: true, tex: '\\operatorname{median}' }),
  F('stdev', 1, 1, 'Sample standard deviation of a list', { listFn: true, tex: '\\operatorname{stdDev}', insert: 'stdDev(' }),
  F('variance', 1, 1, 'Sample variance of a list', { listFn: true, tex: '\\operatorname{variance}' }),
  F('dim', 1, 1, 'Number of elements in a list', { listFn: true, tex: '\\operatorname{dim}' }),
  F('normalpdf', 1, 3, 'normalpdf(x, μ=0, σ=1): normal density', { tex: '\\operatorname{normalpdf}', insert: 'normalpdf(' }),
  F('normalcdf', 2, 4, 'normalcdf(lower, upper, μ=0, σ=1): P(lower ≤ X ≤ upper)', { tex: '\\operatorname{normalcdf}', insert: 'normalcdf(' }),
  F('invnorm', 1, 3, 'invNorm(p, μ=0, σ=1): value with left-tail area p', { tex: '\\operatorname{invNorm}', insert: 'invNorm(' }),
  F('binompdf', 3, 3, 'binompdf(n, p, k): P(X = k) for X ~ B(n, p)', { tex: '\\operatorname{binompdf}', insert: 'binompdf(' }),
  F('binomcdf', 3, 3, 'binomcdf(n, p, k): P(X ≤ k) for X ~ B(n, p)', { tex: '\\operatorname{binomcdf}', insert: 'binomcdf(' }),
  F('poissonpdf', 2, 2, 'poissonpdf(μ, k): P(X = k) for X ~ Poisson(μ)', { tex: '\\operatorname{poissonpdf}', insert: 'poissonpdf(' }),
  F('poissoncdf', 2, 2, 'poissoncdf(μ, k): P(X ≤ k) for X ~ Poisson(μ)', { tex: '\\operatorname{poissoncdf}', insert: 'poissoncdf(' }),
  F('not', 1, 1, 'not(x): 1 if x is 0 (false), otherwise 0', { tex: '\\operatorname{not}' }),
  F('conj', 1, 1, 'Complex conjugate', { tex: '\\operatorname{conj}' }),
  F('real', 1, 1, 'Real part of a complex number', { tex: '\\operatorname{real}' }),
  F('imag', 1, 1, 'Imaginary part of a complex number', { tex: '\\operatorname{imag}' }),
  F('angle', 1, 1, 'Argument (angle) of a complex number', { tex: '\\operatorname{angle}' }),
  F('rand', 0, 0, 'Random number in [0, 1)', { tex: '\\operatorname{rand}' }),
  F('randint', 2, 2, 'randInt(a, b): random integer between a and b', { tex: '\\operatorname{randInt}', insert: 'randInt(' }),
];

export const FN_MAP: Record<string, FnInfo> = Object.fromEntries(FUNCTIONS.map((f) => [f.name, f]));

/** Aliases accepted when typing (all compared case-insensitively). */
export const FN_ALIASES: Record<string, string> = {
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  arsinh: 'asinh',
  arcosh: 'acosh',
  artanh: 'atanh',
  stddev: 'stdev',
  nthroot: 'root',
  int: 'floor',
  logbase: 'log',
};

/** Display name used when converting an AST back to text. */
export function displayName(name: string): string {
  const special: Record<string, string> = {
    nderiv: 'nDeriv',
    fnint: 'fnInt',
    invnorm: 'invNorm',
    stdev: 'stdDev',
    randint: 'randInt',
    ipart: 'iPart',
    fpart: 'fPart',
    npr: 'nPr',
    ncr: 'nCr',
  };
  return special[name] ?? name;
}
