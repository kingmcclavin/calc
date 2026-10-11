import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { emptyContext, scalar, type EvalContext } from './evaluate';
import { formatValue } from './format';
import { parse } from './parser';
import { toTex } from './latex';

function ctx(angle: 'rad' | 'deg' = 'rad'): EvalContext {
  const c = emptyContext(angle);
  c.vars.A = scalar(3);
  c.lists.L1 = [1, 2, 3, 4];
  return c;
}

function num(src: string, c: EvalContext = ctx()): number {
  const r = calculate(src, c);
  if (!r.ok) throw new Error(`${src}: ${r.error}`);
  if (r.value.kind !== 'scalar') throw new Error('list');
  return r.value.n;
}

function text(src: string, c: EvalContext = ctx()): string {
  const r = calculate(src, c);
  if (!r.ok) throw new Error(`${src}: ${r.error}`);
  return formatValue(r.value).text;
}

function err(src: string, c: EvalContext = ctx()): string {
  const r = calculate(src, c);
  if (r.ok) throw new Error(`${src} unexpectedly evaluated`);
  return r.kind;
}

describe('arithmetic and precedence', () => {
  it.each([
    ['1+2*3', 7],
    ['(1+2)*3', 9],
    ['2^3^2', 512],
    ['-2^2', -4],
    ['(-2)^2', 4],
    ['2^-1', 0.5],
    ['10-4-3', 3],
    ['100/10/5', 2],
    ['-3--3', 0],
    ['2*-3', -6],
    ['--5', 5],
    ['3!', 6],
    ['2^3!', 64],
    ['5 nPr 2', 20],
    ['5 nCr 2', 10],
    ['nCr(10,3)', 120],
    ['1ᴇ3', 1000],
    ['2.5ᴇ-2', 0.025],
    ['.5+.25', 0.75],
    ['√16', 4],
    ['√(2)^2', 2],
    ['x²', NaN],
  ])('%s = %d', (src, expected) => {
    if (Number.isNaN(expected)) {
      expect(err(src)).toBe('UNDEFINED');
      return;
    }
    expect(num(src)).toBeCloseTo(expected, 12);
  });

  it('handles implicit multiplication', () => {
    expect(num('2A')).toBe(6);
    expect(num('2(A+1)')).toBe(8);
    expect(num('(1+1)(2+2)')).toBe(8);
    expect(num('2π')).toBeCloseTo(2 * Math.PI, 14);
    expect(num('Aπ')).toBeCloseTo(3 * Math.PI, 14);
    expect(num('2sin(0)')).toBe(0);
    // implicit has the same precedence as explicit multiplication (left to right)
    expect(num('1/2A')).toBe(1.5);
    expect(num('2A^2')).toBe(18);
  });

  it('keeps exact fractions', () => {
    expect(text('1/3+1/6')).toBe('1/2');
    expect(text('0.1+0.2')).toBe('3/10');
    expect(text('2^-3')).toBe('1/8');
    expect(text('(2/3)^2')).toBe('4/9');
    expect(text('√(9/4)')).toBe('3/2');
    expect(text('8^(1/3)')).toBe('2');
    expect(text('(-8)^(1/3)')).toBe('-2');
    expect(text('20!')).toBe('2432902008176640000');
    expect(text('1/7')).toBe('1/7');
  });

  it('auto-closes parentheses at the end', () => {
    expect(num('sin(0')).toBe(0);
    expect(num('2(3+4')).toBe(14);
  });

  it('reports errors', () => {
    expect(err('1/0')).toBe('DIVIDE BY 0');
    expect(err('√(-1)')).toBe('NONREAL');
    expect(err('ln(0)')).toBe('DOMAIN');
    expect(err('ln(-1)')).toBe('DOMAIN');
    expect(err('asin(2)')).toBe('DOMAIN');
    expect(err('1+')).toBe('SYNTAX');
    expect(err('*2')).toBe('SYNTAX');
    expect(err('(1+2))')).toBe('SYNTAX');
    expect(err('')).toBe('SYNTAX');
    expect(err('Q+1')).toBe('UNDEFINED');
    expect(err('10^400')).toBe('OVERFLOW');
    expect(err('0^0')).toBe('DOMAIN');
    expect(err('(-1)!')).toBe('DOMAIN');
    expect(err('sin 30')).toBe('SYNTAX');
    expect(err('tan(90)', ctx('deg'))).toBe('DOMAIN');
  });
});

describe('angles', () => {
  it('radian mode', () => {
    expect(num('sin(π/2)')).toBe(1);
    expect(num('cos(π)')).toBe(-1);
    expect(num('sin(π)')).toBe(0);
    expect(num('asin(1)')).toBeCloseTo(Math.PI / 2, 15);
    expect(num('sin(90°)')).toBe(1);
  });
  it('degree mode', () => {
    const d = ctx('deg');
    expect(text('sin(30)', d)).toBe('1/2');
    expect(text('cos(60)', d)).toBe('1/2');
    expect(text('tan(45)', d)).toBe('1');
    expect(num('sin(45)', d)).toBeCloseTo(Math.SQRT1_2, 15);
    expect(num('acos(0)', d)).toBeCloseTo(90, 12);
    expect(num('atan(1)', d)).toBeCloseTo(45, 12);
    expect(num('cos(180)', d)).toBe(-1);
  });
});

describe('functions', () => {
  it('logs and exponentials', () => {
    expect(text('log(1000)')).toBe('3');
    expect(text('log(8,2)')).toBe('3');
    expect(num('ln(e)')).toBeCloseTo(1, 15);
    expect(num('exp(1)')).toBeCloseTo(Math.E, 15);
    expect(num('log(2)')).toBeCloseTo(Math.log10(2), 15);
  });
  it('misc', () => {
    expect(num('abs(-4.5)')).toBe(4.5);
    expect(num('floor(-2.5)')).toBe(-3);
    expect(num('ceil(-2.5)')).toBe(-2);
    expect(num('round(2.5)')).toBe(3);
    expect(num('round(-2.5)')).toBe(-3);
    expect(num('round(3.14159,2)')).toBe(3.14);
    expect(num('mod(-7,3)')).toBe(2);
    expect(num('gcd(12,18)')).toBe(6);
    expect(num('lcm(4,6)')).toBe(12);
    expect(num('root(-32,5)')).toBe(-2);
    expect(num('∛(-27)')).toBe(-3);
    expect(num('gamma(5)')).toBe(24);
    expect(num('gamma(0.5)')).toBeCloseTo(Math.sqrt(Math.PI), 13);
    expect(num('max(1,5,3)')).toBe(5);
  });
  it('calculus', () => {
    expect(num('nDeriv(x^3,x,2)')).toBeCloseTo(12, 8);
    expect(num('fnInt(x^2,x,0,3)')).toBeCloseTo(9, 10);
    expect(num('fnInt(sin(x),x,0,π)')).toBeCloseTo(2, 10);
    expect(text('sum(1/k^2,K,1,4)')).toBe('205/144');
    expect(num('sum(k,K,1,100)')).toBe(5050);
  });
  it('lists', () => {
    expect(text('mean(L1)')).toBe('5/2');
    expect(text('sum({1,2,3})')).toBe('6');
    expect(num('median({5,1,3})')).toBe(3);
    expect(text('{1,2}+3')).toBe('{4,5}');
    expect(num('stdDev(L1)')).toBeCloseTo(1.2909944487358056, 14);
    expect(num('dim(L1)')).toBe(4);
  });
  it('distributions', () => {
    expect(num('normalcdf(-1,1)')).toBeCloseTo(0.6826894921370859, 13);
    expect(num('normalcdf(-1E99,1.96)'.replace('E', 'ᴇ'))).toBeCloseTo(0.9750021048517795, 13);
    expect(num('invNorm(0.975)')).toBeCloseTo(1.959963984540054, 12);
    expect(num('normalpdf(0)')).toBeCloseTo(0.3989422804014327, 15);
    expect(num('binompdf(10,0.5,5)')).toBeCloseTo(0.24609375, 13);
    expect(num('binomcdf(10,0.5,5)')).toBeCloseTo(0.623046875, 13);
    expect(num('poissonpdf(3,2)')).toBeCloseTo(0.22404180765538775, 13);
    expect(num('poissoncdf(3,2)')).toBeCloseTo(0.42319008112684353, 13);
  });
  it('variables and storing', () => {
    const c = ctx();
    const r = calculate('7→B', c);
    expect(r.ok && r.storedTo).toBe('B');
  });
  it('inverse trig notation', () => {
    expect(num('sin⁻¹(1)')).toBeCloseTo(Math.PI / 2, 14);
    expect(num('2⁻¹')).toBe(0.5);
    expect(num('3²')).toBe(9);
  });
  it('graph function references', () => {
    const c = ctx();
    c.functions.Y1 = parse('x^2+1');
    expect(num('Y1(3)', c)).toBe(10);
    expect(err('Y2(3)', c)).toBe('UNDEFINED');
  });
});

describe('latex', () => {
  it('renders structures', () => {
    expect(toTex(parse('(a+b)/c'))).toBe('\\frac{A+B}{C}');
    expect(toTex(parse('2x^2'))).toBe('2x^{2}');
    expect(toTex(parse('√(x+1)'))).toBe('\\sqrt{x+1}');
    expect(toTex(parse('sin(x)^2'))).toBe('\\left(\\sin\\left(x\\right)\\right)^{2}');
    expect(toTex(parse('2*3'))).toBe('2\\cdot 3');
    expect(toTex(parse('a-(b-c)'))).toBe('A-\\left(B-C\\right)');
  });
});

describe('relations and logic (used by programs)', () => {
  it.each([
    ['2+2=4', 1],
    ['3>5', 0],
    ['1/3=2/6', 1],
    ['0.1+0.2=0.3', 1],
    ['2≤2', 1],
    ['2<=1', 0],
    ['3≥4', 0],
    ['3!=6', 1], // != is not-equal
    ['3! = 6', 1], // factorial then equals
    ['4≠5', 1],
    ['1<>1', 0],
    ['1<2 and 2<3', 1],
    ['1>2 or 2>3', 0],
    ['1 xor 1', 0],
    ['not(0)', 1],
    ['(2>1)+(3>1)', 2],
    ['2+3*4>10', 1],
  ])('%s = %d', (src, expected) => {
    expect(num(src)).toBe(expected);
  });
  it('keeps ALPHA letters O,R as variables', () => {
    const c = ctx();
    c.vars.O = scalar(2);
    c.vars.R = scalar(5);
    expect(num('OR', c)).toBe(10);
  });
  it('stores into x and lists', () => {
    const r = calculate('{1,2}→L3', ctx());
    expect(r.ok && r.storedTo).toBe('L3');
    expect(toTex(parse('A≠B and C≤2'))).toBe('A \\ne B\\ \\mathrm{and}\\ C \\le 2');
  });
});
