import { describe, expect, it } from 'vitest';
import { applyEdit } from './editing';

describe('entry-line editing', () => {
  it('inserts at the caret and wraps selections in functions', () => {
    expect(applyEdit({ value: '12', start: 1, end: 1 }, { type: 'insert', text: '+' })).toEqual({ value: '1+2', caret: 2 });
    expect(applyEdit({ value: 'x+1', start: 0, end: 3 }, { type: 'insert', text: 'sin(', wrap: true })).toEqual({ value: 'sin(x+1)', caret: 8 });
    expect(applyEdit({ value: '', start: 0, end: 0 }, { type: 'insert', text: '()/()', caret: 1 })).toEqual({ value: '()/()', caret: 1 });
  });
  it('deletes whole function tokens with backspace', () => {
    expect(applyEdit({ value: '2sin(', start: 5, end: 5 }, { type: 'backspace' })).toEqual({ value: '2', caret: 1 });
    expect(applyEdit({ value: '√(', start: 2, end: 2 }, { type: 'backspace' })).toEqual({ value: '', caret: 0 });
    expect(applyEdit({ value: '12', start: 2, end: 2 }, { type: 'backspace' })).toEqual({ value: '1', caret: 1 });
  });
  it('moves the caret', () => {
    expect(applyEdit({ value: 'abc', start: 1, end: 1 }, { type: 'left' }).caret).toBe(0);
    expect(applyEdit({ value: 'abc', start: 3, end: 3 }, { type: 'right' }).caret).toBe(3);
    expect(applyEdit({ value: 'abc', start: 1, end: 1 }, { type: 'end' }).caret).toBe(3);
  });
});
