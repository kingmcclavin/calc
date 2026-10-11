import type { EditOp } from './editing';

export type KeyAction =
  | EditOp
  | { type: 'enter' }
  | { type: 'entry' }
  | { type: 'second' }
  | { type: 'angle' }
  | { type: 'menu'; menu: 'math' | 'vars' }
  | { type: 'none' };

export interface KeyFace {
  label: string;
  action: KeyAction;
  title: string;
  /** Plain operator inserted (triggers automatic "Ans" on an empty line) */
  binaryOp?: boolean;
}

export interface KeyDef extends KeyFace {
  id: string;
  variant: 'num' | 'fn' | 'op' | 'enter' | 'shift' | 'mod' | 'clear';
  second?: KeyFace;
  ariaLabel?: string;
}

const ins = (text: string, extra: Partial<Extract<EditOp, { type: 'insert' }>> = {}): EditOp => ({ type: 'insert', text, ...extra });
const fn = (text: string) => ins(text, { wrap: true });

export const KEYS: KeyDef[] = [
  // Row 1
  { id: '2nd', label: '2nd', variant: 'shift', action: { type: 'second' }, title: 'Second function: use the amber label on the next key' },
  { id: 'mode', label: 'MODE', variant: 'mod', action: { type: 'angle' }, title: 'Toggle degree / radian angle mode' },
  { id: 'math', label: 'MATH', variant: 'mod', action: { type: 'menu', menu: 'math' }, title: 'More functions: rounding, probability, calculus, statistics, distributions' },
  { id: 'vars', label: 'VARS', variant: 'mod', action: { type: 'menu', menu: 'vars' }, title: 'Variables A–Z, Ans, graph functions Y1… and lists L1–L6' },
  { id: 'clear', label: 'CLEAR', variant: 'clear', action: { type: 'clear' }, title: 'Clear the entry line (Esc)' },
  // Row 2
  { id: 'sin', label: 'sin', variant: 'fn', action: fn('sin('), title: 'Sine', second: { label: 'sin⁻¹', action: fn('asin('), title: 'Inverse sine' } },
  { id: 'cos', label: 'cos', variant: 'fn', action: fn('cos('), title: 'Cosine', second: { label: 'cos⁻¹', action: fn('acos('), title: 'Inverse cosine' } },
  { id: 'tan', label: 'tan', variant: 'fn', action: fn('tan('), title: 'Tangent', second: { label: 'tan⁻¹', action: fn('atan('), title: 'Inverse tangent' } },
  { id: 'left', label: '◀', ariaLabel: 'Cursor left', variant: 'mod', action: { type: 'left' }, title: 'Move cursor left', second: { label: '⇤', action: { type: 'home' }, title: 'Cursor to start' } },
  { id: 'right', label: '▶', ariaLabel: 'Cursor right', variant: 'mod', action: { type: 'right' }, title: 'Move cursor right', second: { label: '⇥', action: { type: 'end' }, title: 'Cursor to end' } },
  // Row 3
  { id: 'ln', label: 'ln', variant: 'fn', action: fn('ln('), title: 'Natural logarithm', second: { label: 'eˣ', action: ins('e^('), title: 'e to a power' } },
  { id: 'log', label: 'log', variant: 'fn', action: fn('log('), title: 'Base-10 logarithm; log(x, b) for base b', second: { label: '10ˣ', action: ins('10^('), title: '10 to a power' } },
  { id: 'sq', label: 'x²', variant: 'fn', action: ins('²'), binaryOp: true, title: 'Square', second: { label: 'x³', action: ins('³'), binaryOp: true, title: 'Cube' } },
  { id: 'pow', label: '^', variant: 'fn', action: ins('^'), binaryOp: true, title: 'Power', second: { label: 'ʸ√x', action: ins('root(', { wrap: true }), title: 'n-th root: root(x, n)' } },
  { id: 'sqrt', label: '√', variant: 'fn', action: fn('√('), title: 'Square root', second: { label: '∛', action: fn('∛('), title: 'Cube root' } },
  // Row 4
  { id: 'x', label: 'x', variant: 'fn', action: ins('x'), title: 'Variable x', second: { label: 'STO→', action: ins('→'), title: 'Store into a variable, e.g. 5→A' } },
  { id: 'pi', label: 'π', variant: 'fn', action: ins('π'), title: 'Pi', second: { label: 'e', action: ins('e'), title: "Euler's number" } },
  { id: 'comma', label: ',', variant: 'fn', action: ins(','), title: 'Argument separator', second: { label: 'ᴇ', action: ins('ᴇ'), title: 'Scientific notation: 2ᴇ3 = 2000' } },
  { id: 'frac', label: 'a/b', variant: 'fn', action: ins('()/()', { caret: 1 }), title: 'Fraction template', second: { label: '|x|', action: fn('abs('), title: 'Absolute value' } },
  { id: 'inv', label: 'x⁻¹', variant: 'fn', action: ins('⁻¹'), binaryOp: true, title: 'Reciprocal', second: { label: '!', action: ins('!'), binaryOp: true, title: 'Factorial' } },
  // Number block
  { id: '7', label: '7', variant: 'num', action: ins('7'), title: '7' },
  { id: '8', label: '8', variant: 'num', action: ins('8'), title: '8' },
  { id: '9', label: '9', variant: 'num', action: ins('9'), title: '9' },
  { id: 'div', label: '÷', ariaLabel: 'Divide', variant: 'op', action: ins('/'), binaryOp: true, title: 'Divide', second: { label: 'nCr', action: ins(' nCr '), binaryOp: true, title: 'Combinations' } },
  { id: 'del', label: 'DEL', variant: 'clear', action: { type: 'backspace' }, title: 'Delete before cursor (Backspace)', second: { label: 'DEL→', action: { type: 'delete' }, title: 'Delete after cursor' } },
  { id: '4', label: '4', variant: 'num', action: ins('4'), title: '4' },
  { id: '5', label: '5', variant: 'num', action: ins('5'), title: '5' },
  { id: '6', label: '6', variant: 'num', action: ins('6'), title: '6' },
  { id: 'mul', label: '×', ariaLabel: 'Multiply', variant: 'op', action: ins('*'), binaryOp: true, title: 'Multiply', second: { label: 'nPr', action: ins(' nPr '), binaryOp: true, title: 'Permutations' } },
  { id: 'lp', label: '(', variant: 'fn', action: ins('('), title: 'Open parenthesis', second: { label: '{', action: ins('{'), title: 'Start a list' } },
  { id: '1', label: '1', variant: 'num', action: ins('1'), title: '1' },
  { id: '2', label: '2', variant: 'num', action: ins('2'), title: '2' },
  { id: '3', label: '3', variant: 'num', action: ins('3'), title: '3' },
  { id: 'sub', label: '−', ariaLabel: 'Subtract', variant: 'op', action: ins('-'), binaryOp: true, title: 'Subtract' },
  { id: 'rp', label: ')', variant: 'fn', action: ins(')'), title: 'Close parenthesis', second: { label: '}', action: ins('}'), title: 'End a list' } },
  { id: '0', label: '0', variant: 'num', action: ins('0'), title: '0' },
  { id: 'dot', label: '.', ariaLabel: 'Decimal point', variant: 'num', action: ins('.'), title: 'Decimal point' },
  { id: 'neg', label: '(−)', ariaLabel: 'Negative', variant: 'num', action: ins('-'), title: 'Negative sign', second: { label: 'ANS', action: ins('Ans'), title: 'Previous answer' } },
  { id: 'add', label: '+', ariaLabel: 'Add', variant: 'op', action: ins('+'), binaryOp: true, title: 'Add' },
  { id: 'enter', label: 'ENTER', variant: 'enter', action: { type: 'enter' }, title: 'Evaluate (Enter)', second: { label: 'ENTRY', action: { type: 'entry' }, title: 'Recall the previous entry' } },
];

export interface MenuItem {
  label: string;
  insert: string;
  description: string;
}
export interface MenuTab {
  id: string;
  label: string;
  items: MenuItem[];
}

export const MATH_MENU: MenuTab[] = [
  {
    id: 'num',
    label: 'Number',
    items: [
      { label: 'abs(', insert: 'abs(', description: 'Absolute value' },
      { label: 'round(', insert: 'round(', description: 'round(x) or round(x, digits)' },
      { label: 'floor(', insert: 'floor(', description: 'Greatest integer ≤ x' },
      { label: 'ceil(', insert: 'ceil(', description: 'Smallest integer ≥ x' },
      { label: 'iPart(', insert: 'iPart(', description: 'Integer part' },
      { label: 'fPart(', insert: 'fPart(', description: 'Fractional part' },
      { label: 'mod(', insert: 'mod(', description: 'mod(a, b): remainder' },
      { label: 'gcd(', insert: 'gcd(', description: 'Greatest common divisor' },
      { label: 'lcm(', insert: 'lcm(', description: 'Least common multiple' },
      { label: 'min(', insert: 'min(', description: 'Minimum of values or a list' },
      { label: 'max(', insert: 'max(', description: 'Maximum of values or a list' },
      { label: 'root(', insert: 'root(', description: 'root(x, n): n-th root' },
      { label: '∛(', insert: '∛(', description: 'Cube root' },
      { label: 'sign(', insert: 'sign(', description: 'Sign: −1, 0 or 1' },
    ],
  },
  {
    id: 'prob',
    label: 'Probability',
    items: [
      { label: 'nPr', insert: ' nPr ', description: 'Permutations, e.g. 5 nPr 2 = 20' },
      { label: 'nCr', insert: ' nCr ', description: 'Combinations, e.g. 5 nCr 2 = 10' },
      { label: '!', insert: '!', description: 'Factorial (exact for integers)' },
      { label: 'gamma(', insert: 'gamma(', description: 'Gamma function Γ(x)' },
      { label: 'rand()', insert: 'rand()', description: 'Random number in [0, 1)' },
      { label: 'randInt(', insert: 'randInt(', description: 'randInt(a, b): random integer' },
    ],
  },
  {
    id: 'calc',
    label: 'Calculus',
    items: [
      { label: 'nDeriv(', insert: 'nDeriv(', description: 'nDeriv(expr, x, a): derivative at x = a (numerical)' },
      { label: 'fnInt(', insert: 'fnInt(', description: 'fnInt(expr, x, a, b): definite integral (numerical)' },
      { label: 'sum(', insert: 'sum(', description: 'sum(expr, k, a, b): Σ for k = a…b, or sum(list)' },
      { label: 'prod(', insert: 'prod(', description: 'prod(expr, k, a, b): Π for k = a…b, or prod(list)' },
    ],
  },
  {
    id: 'trig',
    label: 'Trig / Hyp',
    items: [
      { label: 'sec(', insert: 'sec(', description: 'Secant' },
      { label: 'csc(', insert: 'csc(', description: 'Cosecant' },
      { label: 'cot(', insert: 'cot(', description: 'Cotangent' },
      { label: 'atan2(', insert: 'atan2(', description: 'atan2(y, x): angle of a point' },
      { label: 'sinh(', insert: 'sinh(', description: 'Hyperbolic sine' },
      { label: 'cosh(', insert: 'cosh(', description: 'Hyperbolic cosine' },
      { label: 'tanh(', insert: 'tanh(', description: 'Hyperbolic tangent' },
      { label: 'asinh(', insert: 'asinh(', description: 'Inverse hyperbolic sine' },
      { label: 'acosh(', insert: 'acosh(', description: 'Inverse hyperbolic cosine' },
      { label: 'atanh(', insert: 'atanh(', description: 'Inverse hyperbolic tangent' },
      { label: '°', insert: '°', description: 'Degree marker: sin(30°) works in radian mode' },
    ],
  },
  {
    id: 'list',
    label: 'Lists',
    items: [
      { label: '{ }', insert: '{', description: 'List literal, e.g. {1, 2, 3}' },
      { label: 'mean(', insert: 'mean(', description: 'Mean of a list' },
      { label: 'median(', insert: 'median(', description: 'Median of a list' },
      { label: 'stdDev(', insert: 'stdDev(', description: 'Sample standard deviation' },
      { label: 'variance(', insert: 'variance(', description: 'Sample variance' },
      { label: 'sum(', insert: 'sum(', description: 'Sum of a list' },
      { label: 'prod(', insert: 'prod(', description: 'Product of a list' },
      { label: 'dim(', insert: 'dim(', description: 'Length of a list' },
    ],
  },
  {
    id: 'distr',
    label: 'Distributions',
    items: [
      { label: 'normalpdf(', insert: 'normalpdf(', description: 'normalpdf(x, μ, σ): normal density' },
      { label: 'normalcdf(', insert: 'normalcdf(', description: 'normalcdf(lo, hi, μ, σ): normal probability' },
      { label: 'invNorm(', insert: 'invNorm(', description: 'invNorm(area, μ, σ): inverse normal' },
      { label: 'binompdf(', insert: 'binompdf(', description: 'binompdf(n, p, k): P(X = k)' },
      { label: 'binomcdf(', insert: 'binomcdf(', description: 'binomcdf(n, p, k): P(X ≤ k)' },
      { label: 'poissonpdf(', insert: 'poissonpdf(', description: 'poissonpdf(μ, k): P(X = k)' },
      { label: 'poissoncdf(', insert: 'poissoncdf(', description: 'poissoncdf(μ, k): P(X ≤ k)' },
    ],
  },
];
