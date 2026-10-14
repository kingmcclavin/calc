import { describe, expect, it } from 'vitest';
import { calculate } from './engine';
import { emptyContext } from './evaluate';
import { formatValue } from './format';

const show = (src: string) => {
  const r = calculate(src, emptyContext());
  if (!r.ok) return `ERR:${r.kind}`;
  return formatValue(r.value).text;
};

describe('matrices', () => {
  it('parses matrix literals', () => {
    expect(show('[[1,2][3,4]]')).toBe('[[1,2][3,4]]');
    expect(show('[[1,2],[3,4]]')).toBe('[[1,2][3,4]]');
  });
  it('does arithmetic', () => {
    expect(show('[[1,2][3,4]]+[[1,1][1,1]]')).toBe('[[2,3][4,5]]');
    expect(show('2[[1,2][3,4]]')).toBe('[[2,4][6,8]]');
    expect(show('[[1,2][3,4]][[5][6]]')).toBe('[[17][39]]');
    expect(show('[[1,2][3,4]]²')).toBe('[[7,10][15,22]]');
  });
  it('computes det, inverse, transpose, rref', () => {
    expect(show('det([[1,2][3,4]])')).toBe('-2');
    expect(show('det([[2,0,1][1,3,2][1,1,2]])')).toBe('6');
    expect(show('[[1,2][3,4]]⁻¹')).toBe('[[-2,1][3/2,-1/2]]');
    expect(show('[[1,2,3][4,5,6]]ᵀ')).toBe('[[1,4][2,5][3,6]]');
    expect(show('rref([[1,2,3][4,5,6]])')).toBe('[[1,0,-1][0,1,2]]');
    expect(show('identity(2)')).toBe('[[1,0][0,1]]');
    expect(show('dim([[1,2,3][4,5,6]])')).toBe('{2,3}');
  });
  it('reports errors', () => {
    expect(show('[[1,2][2,4]]⁻¹')).toBe('ERR:SINGULAR MAT');
    expect(show('[[1,2][3,4]]+[[1]]')).toBe('ERR:DIM MISMATCH');
    expect(show('[[1,2][3]]')).toBe('ERR:DIM MISMATCH');
    expect(show('det([[1,2,3][4,5,6]])')).toBe('ERR:INVALID DIM');
  });
  it('keeps [ ] as grouping', () => {
    expect(show('2[3+1]')).toBe('8');
  });
});

describe('FRAC/FUNC templates', () => {
  it('evaluates mixed numbers and logBASE', () => {
    expect(show('mixed(2,1,3)')).toBe('7/3');
    expect(show('mixed(-2,1,3)')).toBe('-7/3');
    expect(show('logBASE(8,2)')).toBe('3');
  });
});
