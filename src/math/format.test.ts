import { describe, expect, it } from 'vitest';
import { formatNumber, formatScalar } from './format';
import { scalar } from './evaluate';

const F = { mode: 'float' as const, digits: 10 };

describe('MODE number formatting', () => {
  it('NORMAL / SCI / ENG', () => {
    expect(formatNumber(12345.678, F)).toBe('12345.678');
    expect(formatNumber(12345.678, { ...F, notation: 'sci' })).toBe('1.2345678ᴇ4');
    expect(formatNumber(12345.678, { ...F, notation: 'eng' })).toBe('12.345678ᴇ3');
    expect(formatNumber(0.00045, { ...F, notation: 'eng' })).toBe('450ᴇ-6');
    expect(formatNumber(999999.9999, { mode: 'fix', digits: 2, notation: 'eng' })).toBe('1.00ᴇ6');
    expect(formatNumber(-2, { ...F, notation: 'sci' })).toBe('-2ᴇ0');
    expect(formatNumber(3, { mode: 'fix', digits: 2 })).toBe('3.00');
  });
  it('ANSWERS AUTO / DEC and FRACTION TYPE', () => {
    const half7 = scalar(3.5, { n: 7n, d: 2n });
    expect(formatScalar(half7, F).text).toBe('7/2');
    expect(formatScalar(half7, { ...F, answers: 'dec' }).text).toBe('3.5');
    expect(formatScalar(half7, { ...F, fracType: 'mixed' }).tex).toBe('3\\frac{1}{2}');
    expect(formatScalar(scalar(-3.5, { n: -7n, d: 2n }), { ...F, fracType: 'mixed' }).tex).toBe('-3\\frac{1}{2}');
    expect(formatScalar(scalar(0.5, { n: 1n, d: 2n }), { ...F, fracType: 'mixed' }).tex).toBe('\\frac{1}{2}');
    expect(formatScalar(scalar(1200, { n: 1200n, d: 1n }), { ...F, notation: 'sci' }).text).toBe('1.2ᴇ3');
  });
});
