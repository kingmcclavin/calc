import { describe, expect, it } from 'vitest';
import { compileParametric, compilePolar, evaluateSequences, modeWindow } from './modes';
import { emptyContext } from '../math/evaluate';

const fn = (a: string, b?: string) => ({ id: a, a, b, color: '#000', visible: true });

describe('graph modes', () => {
  it('parametric curves', () => {
    const m = compileParametric([fn('3cos(T)', '3sin(T)')], emptyContext(), {});
    const p = m.pointAt['3cos(T)'](Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(3, 12);
    expect(m.curves[0].param?.tMax).toBeCloseTo(2 * Math.PI, 12);
  });
  it('polar curves respect degree mode', () => {
    const m = compilePolar([fn('2')], emptyContext('deg'), {});
    const p = m.pointAt['2'](90);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(2, 12);
    expect(modeWindow({}, true).thetaMax).toBe(360);
    const rose = compilePolar([fn('sin(2θ)')], emptyContext(), {});
    expect(rose.pointAt['sin(2θ)'](Math.PI / 4).extra).toBeCloseTo(1, 12);
  });
  it('sequences: explicit, recursive and two-term recursive', () => {
    const r = evaluateSequences([fn('n^2'), fn('2v(n-1)', '1'), fn('v(n-1)+v(n-2)', '{1,1}')], emptyContext(), 1, 6);
    expect(r.errors).toEqual({});
    expect(r.values['n^2']).toEqual([1, 4, 9, 16, 25, 36]);
    expect(r.values['2v(n-1)']).toEqual([1, 2, 4, 8, 16, 32]);
    // third entry is "w" in the editor but its formula refers to v — v is the second sequence (2u(n-1))
    expect(r.values['v(n-1)+v(n-2)'].slice(0, 2)).toEqual([1, 1]);
  });
  it('fibonacci in w and a missing start value', () => {
    const r = evaluateSequences([fn(''), fn(''), fn('w(n-1)+w(n-2)', '{1,1}')], emptyContext(), 1, 8);
    expect(r.values['w(n-1)+w(n-2)']).toEqual([1, 1, 2, 3, 5, 8, 13, 21]);
    const bad = evaluateSequences([fn('u(n-1)+1')], emptyContext(), 1, 3);
    expect(bad.errors['u(n-1)+1']).toMatch(/starting value/);
  });
});
