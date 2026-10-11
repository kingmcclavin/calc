import { describe, expect, it } from 'vitest';
import { evaluateComplex, formatComplex } from './complex';
import { emptyContext } from './evaluate';
import { parse } from './parser';

const F = { mode: 'float' as const, digits: 10 };
const c = (src: string, angle: 'rad' | 'deg' = 'rad') => evaluateComplex(parse(src), emptyContext(angle));
const rect = (src: string) => formatComplex(c(src), 'rect', F).text;

describe('complex numbers', () => {
  it('arithmetic', () => {
    expect(rect('(3+4i)(1-2i)')).toBe('11-2i');
    expect(rect('(1+i)^2')).toBe('2i');
    expect(rect('i^2')).toBe('-1');
    expect(rect('1/i')).toBe('-i');
    expect(rect('(2+3i)/(1+i)')).toBe('2.5+0.5i');
    expect(rect('√(-4)')).toBe('2i');
    expect(rect('√(-1)+2')).toBe('2+i');
  });
  it('functions', () => {
    expect(c('abs(3+4i)').re).toBe(5);
    expect(rect('conj(3+4i)')).toBe('3-4i');
    expect(c('real(3+4i)').re).toBe(3);
    expect(c('imag(3+4i)').re).toBe(4);
    expect(c('angle(i)').re).toBeCloseTo(Math.PI / 2, 14);
    expect(c('angle(i)', 'deg').re).toBeCloseTo(90, 12);
    expect(rect('e^(πi)')).toBe('-1');
    expect(rect('ln(-1)')).toBe('3.141592654i');
  });
  it('polar form', () => {
    expect(formatComplex(c('3+4i'), 'polar', F).text).toBe('5e^(0.927295218i)');
    expect(formatComplex(c('i'), 'polar', F).tex).toBe('1e^{1.570796327i}');
  });
});
