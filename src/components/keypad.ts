import type { EditOp } from './editing';
import type { GraphIntent, ViewId } from '../state/store';

export type MenuId = 'math' | 'vars' | 'apps' | 'mode' | 'prgm';

export type KeyAction =
  | EditOp
  | { type: 'enter' }
  | { type: 'entry' }
  | { type: 'second' }
  | { type: 'alpha' }
  | { type: 'alphaLock' }
  | { type: 'menu'; menu: MenuId; tab?: string }
  | { type: 'nav'; view: ViewId; intent?: GraphIntent }
  | { type: 'scroll'; dir: -1 | 1; page?: boolean }
  | { type: 'quit' }
  | { type: 'undo' }
  | { type: 'redo' }
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
  variant: 'num' | 'fn' | 'op' | 'enter' | 'shift' | 'alpha' | 'mod' | 'clear' | 'top';
  second?: KeyFace;
  /** Letter typed when ALPHA is active (A–Z, θ) */
  alpha?: string;
  ariaLabel?: string;
}

const ins = (text: string, extra: Partial<Extract<EditOp, { type: 'insert' }>> = {}): EditOp => ({ type: 'insert', text, ...extra });
const fn = (text: string) => ins(text, { wrap: true });

/**
 * Keys in TI-84 Plus CE order, row by row (the arrow pad is rendered
 * separately and occupies the right two columns of rows 2–3).
 */
export const KEYS: KeyDef[] = [
  // Graphing row
  { id: 'yeq', label: 'Y=', variant: 'top', action: { type: 'nav', view: 'graph', intent: 'equations' }, title: 'Edit graph functions (Y= editor)', second: { label: 'STAT PLOT', action: { type: 'nav', view: 'stats', intent: 'plot' }, title: 'Scatter plots & regression' } },
  { id: 'window', label: 'WINDOW', variant: 'top', action: { type: 'nav', view: 'graph', intent: 'window' }, title: 'Graph window settings', second: { label: 'TBLSET', action: { type: 'nav', view: 'table' }, title: 'Table setup' } },
  { id: 'zoom', label: 'ZOOM', variant: 'top', action: { type: 'nav', view: 'graph', intent: 'zoom' }, title: 'Zoom presets', second: { label: 'FORMAT', action: { type: 'nav', view: 'settings' }, title: 'Display format & settings' } },
  { id: 'trace', label: 'TRACE', variant: 'top', action: { type: 'nav', view: 'graph', intent: 'trace' }, title: 'Trace along a graph', second: { label: 'CALC', action: { type: 'nav', view: 'graph', intent: 'calc' }, title: 'Graph analysis: zeros, min/max, intersect, dy/dx, ∫' } },
  { id: 'graph', label: 'GRAPH', variant: 'top', action: { type: 'nav', view: 'graph', intent: 'graph' }, title: 'Show the graph', second: { label: 'TABLE', action: { type: 'nav', view: 'table' }, title: 'Table of values' } },

  // Rows 2–3 (left three columns; arrows on the right)
  { id: '2nd', label: '2nd', variant: 'shift', action: { type: 'second' }, title: 'Second function: use the amber label on the next key' },
  { id: 'mode', label: 'MODE', variant: 'mod', action: { type: 'menu', menu: 'mode' }, title: 'Angle mode, number display and theme', second: { label: 'QUIT', action: { type: 'quit' }, title: 'Clear the entry line and return to the bottom of the screen' } },
  { id: 'del', label: 'DEL', variant: 'mod', action: { type: 'backspace' }, title: 'Delete before cursor (Backspace)', second: { label: 'DEL→', action: { type: 'delete' }, title: 'Delete after cursor' } },
  { id: 'alpha', label: 'ALPHA', variant: 'alpha', action: { type: 'alpha' }, title: 'Type a letter: the green label on the next key', second: { label: 'A-LOCK', action: { type: 'alphaLock' }, title: 'Keep typing letters until ALPHA is pressed again' } },
  { id: 'xt', label: 'X,T,θ,n', variant: 'mod', action: ins('x'), title: 'Variable x' },
  { id: 'stat', label: 'STAT', variant: 'mod', action: { type: 'nav', view: 'stats' }, title: 'Lists, statistics & regression', second: { label: 'LIST', action: { type: 'menu', menu: 'vars', tab: 'lists' }, title: 'Lists L1–L6' } },

  // Row 4
  { id: 'math', label: 'MATH', variant: 'mod', alpha: 'A', action: { type: 'menu', menu: 'math' }, title: 'Math functions: rounding, probability, calculus, lists, distributions', second: { label: 'TEST', action: { type: 'menu', menu: 'math', tab: 'num' }, title: 'Number functions' } },
  { id: 'apps', label: 'APPS', variant: 'mod', alpha: 'B', action: { type: 'menu', menu: 'apps' }, title: 'Open another tool', second: { label: 'ANGLE', action: ins('°'), title: 'Degree marker: sin(30°) works in radian mode' } },
  { id: 'prgm', label: 'PRGM', variant: 'mod', alpha: 'C', action: { type: 'menu', menu: 'prgm' }, title: 'Programs: run, edit or create', second: { label: 'SOLVE', action: { type: 'nav', view: 'solver' }, title: 'Equation solver' } },
  { id: 'vars', label: 'VARS', variant: 'mod', action: { type: 'menu', menu: 'vars' }, title: 'Variables A–Z, Ans, Y1… and lists', second: { label: 'DISTR', action: { type: 'menu', menu: 'math', tab: 'distr' }, title: 'Probability distributions' } },
  { id: 'clear', label: 'CLEAR', variant: 'clear', action: { type: 'clear' }, title: 'Clear the entry line (Esc)' },

  // Row 5
  { id: 'inv', label: 'x⁻¹', variant: 'fn', alpha: 'D', action: ins('⁻¹'), binaryOp: true, title: 'Reciprocal', second: { label: '!', action: ins('!'), binaryOp: true, title: 'Factorial' } },
  { id: 'sin', label: 'sin', variant: 'fn', alpha: 'E', action: fn('sin('), title: 'Sine', second: { label: 'sin⁻¹', action: fn('asin('), title: 'Inverse sine' } },
  { id: 'cos', label: 'cos', variant: 'fn', alpha: 'F', action: fn('cos('), title: 'Cosine', second: { label: 'cos⁻¹', action: fn('acos('), title: 'Inverse cosine' } },
  { id: 'tan', label: 'tan', variant: 'fn', alpha: 'G', action: fn('tan('), title: 'Tangent', second: { label: 'tan⁻¹', action: fn('atan('), title: 'Inverse tangent' } },
  { id: 'pow', label: '^', variant: 'fn', alpha: 'H', action: ins('^'), binaryOp: true, title: 'Power', second: { label: 'π', action: ins('π'), title: 'Pi' } },

  // Row 6
  { id: 'sq', label: 'x²', variant: 'fn', alpha: 'I', action: ins('²'), binaryOp: true, title: 'Square', second: { label: '√', action: fn('√('), title: 'Square root' } },
  { id: 'comma', label: ',', variant: 'fn', alpha: 'J', action: ins(','), title: 'Argument separator', second: { label: 'EE', action: ins('ᴇ'), title: 'Scientific notation: 2ᴇ3 = 2000' } },
  { id: 'lp', label: '(', variant: 'fn', alpha: 'K', action: ins('('), title: 'Open parenthesis', second: { label: '{', action: ins('{'), title: 'Start a list' } },
  { id: 'rp', label: ')', variant: 'fn', alpha: 'L', action: ins(')'), title: 'Close parenthesis', second: { label: '}', action: ins('}'), title: 'End a list' } },
  { id: 'div', label: '÷', ariaLabel: 'Divide', variant: 'op', alpha: 'M', action: ins('/'), binaryOp: true, title: 'Divide', second: { label: 'e', action: ins('e'), title: "Euler's number" } },

  // Row 7
  { id: 'log', label: 'log', variant: 'fn', alpha: 'N', action: fn('log('), title: 'Base-10 logarithm; log(x, b) for base b', second: { label: '10ˣ', action: ins('10^('), title: '10 to a power' } },
  { id: '7', label: '7', variant: 'num', alpha: 'O', action: ins('7'), title: '7', second: { label: '∛', action: fn('∛('), title: 'Cube root' } },
  { id: '8', label: '8', variant: 'num', alpha: 'P', action: ins('8'), title: '8', second: { label: 'ˣ√', action: fn('root('), title: 'n-th root: root(x, n)' } },
  { id: '9', label: '9', variant: 'num', alpha: 'Q', action: ins('9'), title: '9', second: { label: '|x|', action: fn('abs('), title: 'Absolute value' } },
  { id: 'mul', label: '×', ariaLabel: 'Multiply', variant: 'op', alpha: 'R', action: ins('*'), binaryOp: true, title: 'Multiply', second: { label: 'nPr', action: ins(' nPr '), binaryOp: true, title: 'Permutations' } },

  // Row 8
  { id: 'ln', label: 'ln', variant: 'fn', alpha: 'S', action: fn('ln('), title: 'Natural logarithm', second: { label: 'eˣ', action: ins('e^('), title: 'e to a power' } },
  { id: '4', label: '4', variant: 'num', alpha: 'T', action: ins('4'), title: '4', second: { label: 'L4', action: ins('L4'), title: 'List 4' } },
  { id: '5', label: '5', variant: 'num', alpha: 'U', action: ins('5'), title: '5', second: { label: 'L5', action: ins('L5'), title: 'List 5' } },
  { id: '6', label: '6', variant: 'num', alpha: 'V', action: ins('6'), title: '6', second: { label: 'L6', action: ins('L6'), title: 'List 6' } },
  { id: 'sub', label: '−', ariaLabel: 'Subtract', variant: 'op', alpha: 'W', action: ins('-'), binaryOp: true, title: 'Subtract', second: { label: 'nCr', action: ins(' nCr '), binaryOp: true, title: 'Combinations' } },

  // Row 9
  { id: 'sto', label: 'STO→', variant: 'fn', alpha: 'X', action: ins('→'), title: 'Store into a variable, e.g. 5→A', second: { label: 'a/b', action: ins('()/()', { caret: 1 }), title: 'Fraction template' } },
  { id: '1', label: '1', variant: 'num', alpha: 'Y', action: ins('1'), title: '1', second: { label: 'L1', action: ins('L1'), title: 'List 1' } },
  { id: '2', label: '2', variant: 'num', alpha: 'Z', action: ins('2'), title: '2', second: { label: 'L2', action: ins('L2'), title: 'List 2' } },
  { id: '3', label: '3', variant: 'num', alpha: 'θ', action: ins('3'), title: '3', second: { label: 'L3', action: ins('L3'), title: 'List 3' } },
  { id: 'add', label: '+', ariaLabel: 'Add', variant: 'op', action: ins('+'), binaryOp: true, title: 'Add' },

  // Row 10
  { id: 'ans', label: 'ANS', variant: 'mod', action: ins('Ans'), title: 'Previous answer', second: { label: 'HIST', action: { type: 'nav', view: 'history' }, title: 'History & saved graphs' } },
  { id: '0', label: '0', variant: 'num', action: ins('0'), title: '0', second: { label: 'CATALOG', action: { type: 'menu', menu: 'math' }, title: 'All functions' } },
  { id: 'dot', label: '.', ariaLabel: 'Decimal point', variant: 'num', action: ins('.'), title: 'Decimal point' },
  { id: 'neg', label: '(−)', ariaLabel: 'Negative', variant: 'num', action: ins('-'), title: 'Negative sign', second: { label: 'ANS', action: ins('Ans'), title: 'Previous answer' } },
  { id: 'enter', label: 'ENTER', variant: 'enter', action: { type: 'enter' }, title: 'Evaluate, or paste the highlighted line (Enter)', second: { label: 'ENTRY', action: { type: 'entry' }, title: 'Recall the previous entry' } },
];

export interface ArrowDef {
  id: 'up' | 'down' | 'left' | 'right';
  label: string;
  title: string;
  action: KeyAction;
  second: KeyAction;
}

export const ARROWS: ArrowDef[] = [
  { id: 'up', label: '▲', title: 'Scroll up through the screen (highlight a previous line)', action: { type: 'scroll', dir: -1 }, second: { type: 'scroll', dir: -1, page: true } },
  { id: 'left', label: '◀', title: 'Move cursor left (2nd: to start)', action: { type: 'left' }, second: { type: 'home' } },
  { id: 'right', label: '▶', title: 'Move cursor right (2nd: to end)', action: { type: 'right' }, second: { type: 'end' } },
  { id: 'down', label: '▼', title: 'Scroll down through the screen', action: { type: 'scroll', dir: 1 }, second: { type: 'scroll', dir: 1, page: true } },
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
      { label: 'n/d', insert: '()/()', description: 'Fraction template' },
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
