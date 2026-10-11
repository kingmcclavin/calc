import { describe, expect, it } from 'vitest';
import { derivative, findExtrema, findIntersections, findRoots, integrate } from './numeric';
import { sampleFunction } from '../graph/sampler';
import { compileFn, emptyContext } from './evaluate';
import { parse } from './parser';
import { solveEquation, solveQuadraticInputs, solveSystem2 } from './solver';
import { oneVar, regress, twoVar } from './stats';

const fn = (src: string, angle: 'rad' | 'deg' = 'rad') => compileFn(parse(src), emptyContext(angle));

describe('numerical analysis', () => {
  it('finds roots', () => {
    expect(findRoots(fn('x^2-2'), -10, 10)).toEqual([expect.closeTo(-Math.SQRT2, 12), expect.closeTo(Math.SQRT2, 12)]);
    const sinRoots = findRoots(fn('sin(x)'), -1, 7);
    expect(sinRoots.length).toBe(3);
    expect(sinRoots[1]).toBeCloseTo(Math.PI, 12);
    // double root (touches the axis)
    const dbl = findRoots(fn('(x-1)^2'), -5, 5);
    expect(dbl.length).toBe(1);
    expect(dbl[0]).toBeCloseTo(1, 6);
    // a pole is not a root
    expect(findRoots(fn('1/x'), -5, 5)).toEqual([]);
    expect(findRoots(fn('tan(x)'), 1, 2)).toEqual([]);
  });

  it('finds extrema', () => {
    const ex = findExtrema(fn('x^3-3x'), -5, 5);
    expect(ex.map((e) => e.kind)).toEqual(['max', 'min']);
    expect(ex[0].x).toBeCloseTo(-1, 7);
    expect(ex[0].y).toBeCloseTo(2, 12);
    expect(ex[1].x).toBeCloseTo(1, 7);
    const deg = findExtrema(fn('sin(x)', 'deg'), 0, 360);
    expect(deg[0].x).toBeCloseTo(90, 5);
    expect(deg[1].x).toBeCloseTo(270, 5);
  });

  it('finds intersections', () => {
    const pts = findIntersections(fn('x^2'), fn('x+2'), -10, 10);
    expect(pts.map((p) => p.x)).toEqual([expect.closeTo(-1, 12), expect.closeTo(2, 12)]);
    expect(pts[1].y).toBeCloseTo(4, 12);
  });

  it('differentiates', () => {
    expect(derivative(fn('x^3'), 2)).toBeCloseTo(12, 9);
    expect(derivative(fn('sin(x)'), 0)).toBeCloseTo(1, 10);
    expect(derivative(fn('e^x'), 1)).toBeCloseTo(Math.E, 9);
    expect(derivative(fn('ln(x)'), 0.5)).toBeCloseTo(2, 8);
    expect(derivative(fn('abs(x)'), 0)).toBeNaN();
  });

  it('integrates', () => {
    expect(integrate(fn('x^2'), 0, 3).value).toBeCloseTo(9, 12);
    expect(integrate(fn('sin(x)'), 0, Math.PI).value).toBeCloseTo(2, 12);
    expect(integrate(fn('e^(-x^2)'), -10, 10).value).toBeCloseTo(Math.sqrt(Math.PI), 10);
    expect(integrate(fn('1/x'), 1, Math.E).value).toBeCloseTo(1, 12);
    expect(integrate(fn('√x'), 0, 4).value).toBeCloseTo(16 / 3, 8);
    expect(integrate(fn('x'), 3, 0).value).toBeCloseTo(-4.5, 12);
    expect(integrate(fn('1/x'), -1, 1).reliable).toBe(false);
  });
});

describe('graph sampler', () => {
  const opts = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, pixelWidth: 800, pixelHeight: 600 };
  it('draws a continuous function as one polyline', () => {
    expect(sampleFunction(fn('x^2'), opts).length).toBe(1);
    expect(sampleFunction(fn('sin(x)'), opts).length).toBe(1);
  });
  it('breaks at poles and jumps', () => {
    expect(sampleFunction(fn('1/x'), opts).length).toBe(2);
    // tan has 7 branches over [-10, 10]: asymptotes at ±π/2, ±3π/2, ±5π/2
    expect(sampleFunction(fn('tan(x)'), opts).length).toBe(7);
    // 20 steps plus the single point at x = 10
    expect(sampleFunction(fn('floor(x)'), opts).length).toBe(21);
  });
  it('respects the domain', () => {
    const lines = sampleFunction(fn('√x'), opts);
    expect(lines.length).toBe(1);
    expect(lines[0][0]).toBeLessThan(0.01);
    expect(lines[0][0]).toBeGreaterThanOrEqual(0);
    expect(sampleFunction(fn('√(-1-x^2)'), opts).length).toBe(0);
  });
});

describe('solver', () => {
  const ctx = emptyContext();
  const opts = { lo: -100, hi: 100 };
  it('linear', () => {
    const r = solveEquation('3x+5=2x-7', ctx, opts);
    expect(r.method).toBe('linear');
    expect(r.solutions[0].value).toBe(-12);
    const f = solveEquation('2x=1', ctx, opts);
    expect(f.solutions[0].tex).toContain('\\frac{1}{2}');
  });
  it('identity and contradiction', () => {
    expect(solveEquation('2(x+1)=2x+2', ctx, opts).method).toBe('identity');
    expect(solveEquation('x+1=x', ctx, opts).method).toBe('none');
  });
  it('quadratic', () => {
    const r = solveEquation('x^2-5x+6=0', ctx, opts);
    expect(r.method).toBe('quadratic');
    expect(r.solutions.map((s) => s.value)).toEqual([2, 3]);
    const s = solveEquation('x^2=2', ctx, opts);
    expect(s.solutions[1].tex).toContain('\\sqrt{2}');
    expect(s.solutions[1].value).toBeCloseTo(Math.SQRT2, 14);
    const c = solveQuadraticInputs('1', '2', '5', ctx);
    expect(c.summary).toMatch(/complex/);
    expect(c.solutions[0].tex).toContain('i');
    const surd = solveQuadraticInputs('2', '-3', '-1', ctx);
    expect(surd.solutions[0].tex).toContain('\\frac{3 - \\sqrt{17}}{4}');
  });
  it('higher degree and general numeric', () => {
    const r = solveEquation('x^3-6x^2+11x-6=0', ctx, opts);
    expect(r.solutions.map((s) => s.value)).toEqual([expect.closeTo(1, 9), expect.closeTo(2, 9), expect.closeTo(3, 9)]);
    const g = solveEquation('cos(x)=x', ctx, opts);
    expect(g.solutions.length).toBe(1);
    expect(g.solutions[0].value).toBeCloseTo(0.7390851332151607, 12);
    const p = solveEquation('1/x=0', ctx, opts);
    expect(p.solutions.length).toBe(0);
  });
  it('2x2 systems', () => {
    const r = solveSystem2([['2', '3', '8'], ['1', '-1', '-1']], ctx);
    expect(r.solutions.map((s) => s.value)).toEqual([1, 2]);
    expect(solveSystem2([['1', '1', '2'], ['2', '2', '4']], ctx).summary).toMatch(/Infinitely/);
    expect(solveSystem2([['1', '1', '2'], ['1', '1', '3']], ctx).summary).toMatch(/No solution/);
  });
});

describe('statistics', () => {
  it('one variable', () => {
    const s = oneVar([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.mean).toBe(5);
    expect(s.sigmaX).toBe(2);
    expect(s.sx).toBeCloseTo(2.138089935299395, 14);
    expect(s.median).toBe(4.5);
    expect(s.mode).toEqual([4]);
    expect(s.q1).toBe(4);
    expect(s.q3).toBe(6);
    expect(s.range).toBe(7);
    const odd = oneVar([1, 2, 3, 4, 5, 6, 7]);
    expect(odd.q1).toBe(2);
    expect(odd.q3).toBe(6);
  });
  it('two variable and regressions', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1];
    const lin = regress('linear', xs, ys);
    expect(lin.coef.a).toBeCloseTo(1.99, 12);
    expect(lin.coef.b).toBeCloseTo(0.05, 12);
    expect(twoVar(xs, ys).r).toBeCloseTo(0.99865, 4);
    const q = regress('quadratic', [0, 1, 2, 3], [1, 2, 5, 10]);
    expect(q.coef.a).toBeCloseTo(1, 10);
    expect(q.coef.b).toBeCloseTo(0, 10);
    expect(q.coef.c).toBeCloseTo(1, 10);
    expect(q.r2).toBeCloseTo(1, 12);
    const e = regress('exponential', [0, 1, 2, 3], [3, 6, 12, 24]);
    expect(e.coef.a).toBeCloseTo(3, 10);
    expect(e.coef.b).toBeCloseTo(2, 10);
    const pw = regress('power', [1, 2, 3, 4], [2, 16, 54, 128]);
    expect(pw.coef.a).toBeCloseTo(2, 10);
    expect(pw.coef.b).toBeCloseTo(3, 10);
  });
});
