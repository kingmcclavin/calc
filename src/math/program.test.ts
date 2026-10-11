import { describe, expect, it } from 'vitest';
import { checkProgram, runProgram, EXAMPLE_PROGRAMS, type ProgramIO } from './program';
import { emptyContext, type Value } from './evaluate';
import { formatValue } from './format';

function harness(programs: Record<string, string>, inputs: string[] = []) {
  const out: string[] = [];
  const stored: Record<string, Value> = {};
  const io: ProgramIO = {
    text: (s) => out.push(s),
    value: (v) => out.push(`=${formatValue(v).text}`),
    input: async (p) => {
      out.push(p);
      return inputs.shift() ?? '0';
    },
    pause: async () => undefined,
    clear: () => out.push('<clear>'),
    store: (n, v) => (stored[n] = v),
    getProgram: (n) => programs[n] ?? null,
    cancelled: () => false,
  };
  return { out, stored, io };
}

async function run(src: string, inputs: string[] = [], extra: Record<string, string> = {}) {
  const h = harness({ MAIN: src, ...extra }, inputs);
  const ctx = emptyContext();
  ctx.random = () => 0.5;
  const res = await runProgram('MAIN', ctx, h.io);
  return { ...h, res };
}

describe('programs', () => {
  it('runs expressions, Disp and stores', async () => {
    const { out, stored } = await run('3→A\nA²+1→B\nDisp "B IS",B');
    expect(out).toEqual(['B IS', '=10']);
    expect(stored.B).toMatchObject({ n: 10 });
  });
  it('supports colon-separated statements and For loops', async () => {
    const { out } = await run('0→S:For(I,1,10):S+I→S:End:Disp S');
    expect(out).toEqual(['=55']);
  });
  it('For with negative and fractional steps stays exact', async () => {
    expect((await run('For(I,3,1,-1):Disp I:End')).out).toEqual(['=3', '=2', '=1']);
    expect((await run('0→N:For(I,0,1,0.1):N+1→N:End:Disp N')).out).toEqual(['=11']);
  });
  it('If, single-line If, Then/Else', async () => {
    const src = `5→A
If A>3
Disp "BIG"
If A<3
Disp "SMALL"
If A=5
Then
Disp "FIVE"
Else
Disp "NOT FIVE"
End
Disp "DONE"`;
    expect((await run(src)).out).toEqual(['BIG', 'FIVE', 'DONE']);
  });
  it('While, Repeat, Goto/Lbl, Stop', async () => {
    expect((await run('1→A:While A<100:2A→A:End:Disp A')).out).toEqual(['=128']);
    expect((await run('0→A:Repeat A≥3:A+1→A:End:Disp A')).out).toEqual(['=3']);
    expect((await run('0→A:Lbl 1:A+1→A:If A<5:Goto 1:Disp A')).out).toEqual(['=5']);
    expect((await run('Disp 1:Stop:Disp 2')).out).toEqual(['=1']);
  });
  it('Input and Prompt evaluate expressions', async () => {
    const { out, stored } = await run('Prompt A,B\nInput "C?",C\nDisp A+B+C', ['2', '1/2', '0']);
    expect(out).toEqual(['A=?', 'B=?', 'C?', '=5/2']);
    expect(stored.C).toMatchObject({ n: 0 });
  });
  it('calls other programs', async () => {
    const { out } = await run('Disp "A":prgmSUB:Disp "C"', [], { SUB: 'Disp "B":Return:Disp "X"' });
    expect(out).toEqual(['A', 'B', 'C']);
  });
  it('stores lists', async () => {
    const { stored } = await run('{1,2,3}→L1');
    expect(stored.L1).toMatchObject({ kind: 'list' });
  });
  it('reports compile errors with line numbers', () => {
    expect(checkProgram('If 1\nThen\nDisp 1')?.message).toMatch(/missing its End/);
    expect(checkProgram('Disp 1\nEnd')?.line).toBe(2);
    expect(checkProgram('Goto Z')?.message).toMatch(/no Lbl Z/);
    expect(checkProgram('Disp 1+')?.line).toBe(1);
    expect(checkProgram('Else')?.message).toMatch(/Else without/);
  });
  it('reports runtime errors with line numbers', async () => {
    await expect(run('Disp 1\n1/0→A')).rejects.toMatchObject({ kind: 'DIVIDE BY 0', line: 2 });
  });
  it('can be cancelled', async () => {
    const h = harness({ MAIN: 'While 1:End' });
    let n = 0;
    h.io.cancelled = () => ++n > 1000;
    const res = await runProgram('MAIN', emptyContext(), h.io);
    expect(res.stoppedByUser).toBe(true);
  });
  it('example programs compile and run', async () => {
    for (const ex of EXAMPLE_PROGRAMS) expect(checkProgram(ex.source)).toBeNull();
    const quad = await run(EXAMPLE_PROGRAMS[0].source, ['1', '-3', '2']);
    expect(quad.out.slice(-2)).toEqual(['=2', '=1']);
    const fib = await run(EXAMPLE_PROGRAMS[1].source, ['6']);
    expect(fib.out.slice(1)).toEqual(['=1', '=1', '=2', '=3', '=5', '=8']);
    const guess = await run(EXAMPLE_PROGRAMS[2].source, ['10', '90', '51']); // randInt gives 51 with random()=0.5
    expect(guess.out).toContain('HIGHER');
    expect(guess.out).toContain('LOWER');
    expect(guess.out.slice(-2)).toEqual(['CORRECT! TRIES:', '=3']);
  });
});
