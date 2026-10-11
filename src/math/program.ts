/**
 * A small TI-BASIC-style programming language.
 *
 * Programs are compiled into a flat list of instructions with jump targets
 * (which makes Goto/Lbl straightforward) and run by an async interpreter so
 * that Input/Pause can wait for the user and long loops can be stopped.
 * Expressions are parsed by the calculator's own parser — never eval().
 *
 * Supported statements (one per line, or separated by ":"):
 *   expr                  evaluate (result becomes Ans), e.g.  A+1→A
 *   Disp item[,item…]     show text ("…") or values
 *   Input ["prompt",]var  ask for a value
 *   Prompt var[,var…]     ask for several values ("A=?")
 *   If cond               run the next statement only if cond ≠ 0
 *   If cond / Then / [Else] / End
 *   For(var,start,end[,step]) … End
 *   While cond … End      Repeat cond … End
 *   Lbl name   Goto name
 *   Pause [item]   ClrHome   Stop   Return   prgmNAME (call another program)
 */
import { MathError, type Node } from './ast';
import { Evaluator, type EvalContext, type Scalar, type Value } from './evaluate';
import { parse } from './parser';

export const PROGRAM_NAME_RE = /^[A-Zθ][A-Z0-9θ]{0,7}$/;

export class ProgramError extends Error {
  constructor(
    public kind: string,
    message: string,
    public line?: number,
    public program?: string,
  ) {
    super(message);
  }
}

type Item = { type: 'text'; text: string } | { type: 'expr'; node: Node };

type Instr =
  | { op: 'expr'; node: Node; line: number }
  | { op: 'disp'; items: Item[]; line: number }
  | { op: 'input'; prompt: string | null; target: string; line: number }
  | { op: 'prompt'; targets: string[]; line: number }
  | { op: 'jz'; cond: Node; target: number; line: number } // jump if cond is false (0)
  | { op: 'jnz'; cond: Node; target: number; line: number } // jump if cond is true
  | { op: 'jmp'; target: number; line: number }
  | { op: 'forInit'; v: string; start: Node; end: Node; step: Node | null; id: number; line: number }
  | { op: 'forTest'; v: string; id: number; exit: number; line: number }
  | { op: 'forNext'; v: string; id: number; test: number; line: number }
  | { op: 'pause'; item: Item | null; line: number }
  | { op: 'clrhome'; line: number }
  | { op: 'stop'; line: number }
  | { op: 'return'; line: number }
  | { op: 'call'; name: string; line: number }
  | { op: 'nop'; line: number };

export interface CompiledProgram {
  instrs: Instr[];
}

/* ------------------------------------------------------------------------ */
/* Compilation                                                                */
/* ------------------------------------------------------------------------ */

interface Stmt {
  text: string;
  line: number;
}

/** Split source into statements on new lines and ":" (outside quotes). */
export function splitStatements(src: string): Stmt[] {
  const out: Stmt[] = [];
  src.split(/\r?\n/).forEach((raw, idx) => {
    let cur = '';
    let inStr = false;
    for (const ch of raw) {
      if (ch === '"') inStr = !inStr;
      if (ch === ':' && !inStr) {
        if (cur.trim()) out.push({ text: cur.trim(), line: idx + 1 });
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push({ text: cur.trim(), line: idx + 1 });
  });
  return out;
}

/** Split on top-level commas (not inside brackets or quotes). */
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if ('([{'.includes(ch)) depth++;
      if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

function fail(line: number, msg: string, kind = 'SYNTAX'): never {
  throw new ProgramError(kind, msg, line);
}

function expr(src: string, line: number): Node {
  try {
    return parse(src);
  } catch (e) {
    fail(line, e instanceof MathError ? e.message : String(e));
  }
}

function item(src: string, line: number): Item {
  const m = /^"([^"]*)"?$/.exec(src);
  if (m) return { type: 'text', text: m[1] };
  return { type: 'expr', node: expr(src, line) };
}

function variable(src: string, line: number): string {
  const v = src.trim();
  const up = v.length === 1 && v !== 'x' && v !== 'θ' ? v.toUpperCase() : v;
  if (/^[A-Zθ]$/.test(up) || up === 'x' || up === 'X') return up === 'X' ? 'x' : up;
  fail(line, `"${src}" is not a variable — use a letter A–Z or θ`);
}

const kw = (text: string, word: string) => new RegExp(`^${word}(?![A-Za-z0-9θ])\\s*(.*)$`, 'i').exec(text);

export function compileProgram(src: string): CompiledProgram {
  const stmts = splitStatements(src);
  const instrs: Instr[] = [];
  type Block =
    | { type: 'if'; jz: number; line: number; hasElse: boolean; elseJmp?: number }
    | { type: 'for'; init: number; test: number; v: string; id: number; line: number }
    | { type: 'while'; head: number; jz: number; line: number }
    | { type: 'repeat'; head: number; cond: Node; line: number };
  const stack: Block[] = [];
  const labels = new Map<string, number>();
  const gotos: Array<{ index: number; name: string; line: number }> = [];
  let loopId = 0;
  let pendingSingleIf: number | null = null; // index of a jz awaiting "after next statement"

  for (let si = 0; si < stmts.length; si++) {
    const { text, line } = stmts[si];
    const before = instrs.length;
    let m: RegExpExecArray | null;

    if ((m = kw(text, 'If'))) {
      if (!m[1]) fail(line, 'If needs a condition, e.g. If A>0');
      const cond = expr(m[1], line);
      const next = stmts[si + 1];
      instrs.push({ op: 'jz', cond, target: -1, line });
      if (next && /^Then$/i.test(next.text)) {
        stack.push({ type: 'if', jz: instrs.length - 1, line, hasElse: false });
        si++; // consume Then
      } else {
        if (!next) fail(line, 'If must be followed by a statement (or Then … End)');
        pendingSingleIf = instrs.length - 1;
        continue; // the next statement is the conditional one
      }
    } else if (/^Then$/i.test(text)) {
      fail(line, 'Then must directly follow an If line');
    } else if (/^Else$/i.test(text)) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== 'if' || top.hasElse) fail(line, 'Else without a matching If … Then');
      instrs.push({ op: 'jmp', target: -1, line });
      top.elseJmp = instrs.length - 1;
      top.hasElse = true;
      (instrs[top.jz] as Extract<Instr, { op: 'jz' }>).target = instrs.length;
    } else if (/^End$/i.test(text)) {
      const top = stack.pop();
      if (!top) fail(line, 'End without a matching If/For/While/Repeat');
      if (top.type === 'if') {
        if (top.hasElse) (instrs[top.elseJmp!] as Extract<Instr, { op: 'jmp' }>).target = instrs.length;
        else (instrs[top.jz] as Extract<Instr, { op: 'jz' }>).target = instrs.length;
      } else if (top.type === 'for') {
        instrs.push({ op: 'forNext', v: top.v, id: top.id, test: top.test, line });
        (instrs[top.test] as Extract<Instr, { op: 'forTest' }>).exit = instrs.length;
      } else if (top.type === 'while') {
        instrs.push({ op: 'jmp', target: top.head, line });
        (instrs[top.jz] as Extract<Instr, { op: 'jz' }>).target = instrs.length;
      } else {
        // Repeat: loop back while the condition is still false
        instrs.push({ op: 'jz', cond: top.cond, target: top.head, line });
      }
    } else if ((m = /^For\s*\((.*?)\)?$/i.exec(text))) {
      const args = splitArgs(m[1]);
      if (args.length < 3 || args.length > 4) fail(line, 'For needs (variable, start, end[, step])');
      const v = variable(args[0], line);
      const id = loopId++;
      instrs.push({ op: 'forInit', v, start: expr(args[1], line), end: expr(args[2], line), step: args[3] ? expr(args[3], line) : null, id, line });
      instrs.push({ op: 'forTest', v, id, exit: -1, line });
      stack.push({ type: 'for', init: instrs.length - 2, test: instrs.length - 1, v, id, line });
    } else if ((m = kw(text, 'While'))) {
      if (!m[1]) fail(line, 'While needs a condition');
      const head = instrs.length;
      instrs.push({ op: 'jz', cond: expr(m[1], line), target: -1, line });
      stack.push({ type: 'while', head, jz: head, line });
    } else if ((m = kw(text, 'Repeat'))) {
      if (!m[1]) fail(line, 'Repeat needs a condition');
      stack.push({ type: 'repeat', head: instrs.length, cond: expr(m[1], line), line });
    } else if ((m = kw(text, 'Disp'))) {
      const args = m[1] ? splitArgs(m[1]) : [];
      instrs.push({ op: 'disp', items: args.map((a) => item(a, line)), line });
    } else if ((m = kw(text, 'Input'))) {
      const args = m[1] ? splitArgs(m[1]) : [];
      if (args.length === 1) instrs.push({ op: 'input', prompt: null, target: variable(args[0], line), line });
      else if (args.length === 2 && /^"/.test(args[0])) instrs.push({ op: 'input', prompt: args[0].replace(/^"|"$/g, ''), target: variable(args[1], line), line });
      else fail(line, 'Use Input A or Input "PROMPT",A');
    } else if ((m = kw(text, 'Prompt'))) {
      const args = m[1] ? splitArgs(m[1]) : [];
      if (!args.length) fail(line, 'Prompt needs at least one variable');
      instrs.push({ op: 'prompt', targets: args.map((a) => variable(a, line)), line });
    } else if ((m = kw(text, 'Lbl'))) {
      const name = m[1].trim().toUpperCase();
      if (!/^[A-Z0-9θ]{1,2}$/.test(name)) fail(line, 'Label names are 1–2 letters or digits');
      if (labels.has(name)) fail(line, `Label ${name} is defined twice`);
      labels.set(name, instrs.length);
      instrs.push({ op: 'nop', line });
    } else if ((m = kw(text, 'Goto'))) {
      gotos.push({ index: instrs.length, name: m[1].trim().toUpperCase(), line });
      instrs.push({ op: 'jmp', target: -1, line });
    } else if ((m = kw(text, 'Pause'))) {
      instrs.push({ op: 'pause', item: m[1] ? item(m[1], line) : null, line });
    } else if (/^ClrHome$/i.test(text)) {
      instrs.push({ op: 'clrhome', line });
    } else if (/^Stop$/i.test(text)) {
      instrs.push({ op: 'stop', line });
    } else if (/^Return$/i.test(text)) {
      instrs.push({ op: 'return', line });
    } else if ((m = /^prgm\s*([A-Za-z0-9θ]+)$/i.exec(text))) {
      instrs.push({ op: 'call', name: m[1].toUpperCase(), line });
    } else {
      instrs.push({ op: 'expr', node: expr(text, line), line });
    }

    // A single-line If skips exactly the statement that follows it
    if (pendingSingleIf !== null && instrs.length > before) {
      (instrs[pendingSingleIf] as Extract<Instr, { op: 'jz' }>).target = instrs.length;
      pendingSingleIf = null;
    }
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    fail(top.line, `${top.type === 'if' ? 'If … Then' : top.type[0].toUpperCase() + top.type.slice(1)} on line ${top.line} is missing its End`);
  }
  for (const g of gotos) {
    const target = labels.get(g.name);
    if (target === undefined) fail(g.line, `Goto ${g.name}: there is no Lbl ${g.name}`, 'LABEL');
    (instrs[g.index] as Extract<Instr, { op: 'jmp' }>).target = target;
  }
  return { instrs };
}

/** Syntax-check a program without running it. */
export function checkProgram(src: string): ProgramError | null {
  try {
    compileProgram(src);
    return null;
  } catch (e) {
    return e instanceof ProgramError ? e : new ProgramError('SYNTAX', String(e));
  }
}

/* ------------------------------------------------------------------------ */
/* Execution                                                                  */
/* ------------------------------------------------------------------------ */

export interface ProgramIO {
  /** Show a line of text (left aligned) */
  text(s: string): void;
  /** Show a value (right aligned) */
  value(v: Value): void;
  /** Ask for input; resolves with the raw text the user entered */
  input(prompt: string): Promise<string>;
  /** Wait for ENTER */
  pause(): Promise<void>;
  clear(): void;
  /** Persist a variable / list assignment */
  store(name: string, v: Value): void;
  /** Look up another program's source by name (for prgmNAME calls) */
  getProgram(name: string): string | null;
  /** Polled regularly; return true to break the program */
  cancelled(): boolean;
}

class StopSignal {}

export interface RunResult {
  /** Last evaluated value (Ans) */
  ans: Value | null;
  stoppedByUser: boolean;
}

const YIELD_EVERY = 400;

export async function runProgram(name: string, ctx: EvalContext, io: ProgramIO): Promise<RunResult> {
  const state = { ans: null as Value | null, steps: 0 };
  try {
    await execute(name, ctx, io, state, 0);
  } catch (e) {
    if (e instanceof StopSignal) return { ans: state.ans, stoppedByUser: false };
    if (e instanceof BreakSignal) return { ans: state.ans, stoppedByUser: true };
    throw e;
  }
  return { ans: state.ans, stoppedByUser: false };
}

class BreakSignal {}

async function execute(name: string, ctx: EvalContext, io: ProgramIO, state: { ans: Value | null; steps: number }, depth: number) {
  if (depth > 20) throw new ProgramError('RECURSION', 'Programs are nested more than 20 deep', undefined, name);
  const src = io.getProgram(name);
  if (src === null) throw new ProgramError('UNDEFINED', `There is no program named ${name}`, undefined, name);
  let prog: CompiledProgram;
  try {
    prog = compileProgram(src);
  } catch (e) {
    if (e instanceof ProgramError) e.program = name;
    throw e;
  }
  const { instrs } = prog;
  const loops = new Map<number, { end: Scalar; step: Scalar }>();

  const ev = () => new Evaluator(ctx);
  const evalScalar = (node: Node, what: string): Scalar => {
    const v = ev().eval(node);
    if (v.kind !== 'scalar') throw new MathError('DATA TYPE', `${what} must be a number, not a list`);
    return v;
  };
  const assign = (target: string, v: Value) => {
    if (/^L[1-6]$/.test(target)) {
      if (v.kind !== 'list') throw new MathError('DATA TYPE', `Only a list can be stored in ${target}`);
      ctx.lists = { ...ctx.lists, [target]: v.items.map((s) => s.n) };
    } else {
      if (v.kind !== 'scalar') throw new MathError('DATA TYPE', 'Only numbers can be stored in variables');
      ctx.vars = { ...ctx.vars, [target]: v };
    }
    io.store(target, v);
  };
  const show = (it: Item) => {
    if (it.type === 'text') io.text(it.text);
    else io.value(ev().eval(it.node));
  };
  const ask = async (prompt: string, target: string) => {
    for (;;) {
      const raw = await io.input(prompt);
      if (io.cancelled()) throw new BreakSignal();
      try {
        assign(target, ev().eval(parse(raw)));
        return;
      } catch (e) {
        io.text(`ERR: ${e instanceof MathError ? e.message : String(e)} — try again`);
      }
    }
  };

  let pc = 0;
  while (pc < instrs.length) {
    const ins = instrs[pc];
    if (++state.steps % YIELD_EVERY === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
    if (io.cancelled()) throw new BreakSignal();
    try {
      switch (ins.op) {
        case 'expr': {
          const v = ev().eval(ins.node);
          if (ins.node.type === 'store') assign(ins.node.target, v);
          state.ans = v;
          ctx.vars = v.kind === 'scalar' ? { ...ctx.vars, Ans: v } : ctx.vars;
          if (v.kind === 'scalar') io.store('Ans', v);
          break;
        }
        case 'disp':
          if (!ins.items.length) io.text('');
          ins.items.forEach(show);
          break;
        case 'input':
          await ask(ins.prompt ?? '?', ins.target);
          break;
        case 'prompt':
          for (const t of ins.targets) await ask(`${t}=?`, t);
          break;
        case 'jz':
          if (evalScalar(ins.cond, 'A condition').n === 0) {
            pc = ins.target;
            continue;
          }
          break;
        case 'jnz':
          if (evalScalar(ins.cond, 'A condition').n !== 0) {
            pc = ins.target;
            continue;
          }
          break;
        case 'jmp':
          pc = ins.target;
          continue;
        case 'forInit': {
          const start = evalScalar(ins.start, 'For start');
          const end = evalScalar(ins.end, 'For end');
          const step = ins.step ? evalScalar(ins.step, 'For step') : ({ kind: 'scalar', n: 1, r: { n: 1n, d: 1n } } as Scalar);
          if (step.n === 0) throw new MathError('DOMAIN', 'For step cannot be 0');
          loops.set(ins.id, { end, step });
          assign(ins.v, start);
          break;
        }
        case 'forTest': {
          const loop = loops.get(ins.id)!;
          const cur = ctx.vars[ins.v];
          const done = loop.step.n > 0 ? cur.n > loop.end.n + 1e-12 * Math.abs(loop.end.n) : cur.n < loop.end.n - 1e-12 * Math.abs(loop.end.n);
          if (done) {
            pc = ins.exit;
            continue;
          }
          break;
        }
        case 'forNext': {
          const loop = loops.get(ins.id);
          if (!loop) throw new MathError('SYNTAX', 'End reached without entering its For loop (Goto into a loop?)');
          const cur = ctx.vars[ins.v];
          let sum: Scalar = { kind: 'scalar', n: cur.n + loop.step.n, r: null };
          if (cur.r && loop.step.r) {
            // keep exact arithmetic for fractional steps such as 0.1
            const n = cur.r.n * loop.step.r.d + loop.step.r.n * cur.r.d;
            const d = cur.r.d * loop.step.r.d;
            sum = { kind: 'scalar', n: Number(n) / Number(d), r: { n, d } };
          }
          assign(ins.v, sum);
          pc = ins.test;
          continue;
        }
        case 'pause':
          if (ins.item) show(ins.item);
          await io.pause();
          break;
        case 'clrhome':
          io.clear();
          break;
        case 'stop':
          throw new StopSignal();
        case 'return':
          return;
        case 'call':
          await execute(ins.name, ctx, io, state, depth + 1);
          break;
        case 'nop':
          break;
      }
    } catch (e) {
      if (e instanceof StopSignal || e instanceof BreakSignal || e instanceof ProgramError) throw e;
      const kind = e instanceof MathError ? e.kind : 'ERROR';
      throw new ProgramError(kind, e instanceof Error ? e.message : String(e), ins.line, name);
    }
    pc++;
  }
}

/** Example programs offered to first-time users. */
export const EXAMPLE_PROGRAMS: Array<{ name: string; source: string }> = [
  {
    name: 'QUAD',
    source: `Disp "AX²+BX+C=0"
Prompt A,B,C
B²-4AC→D
If D<0
Then
Disp "NO REAL ROOTS"
Else
Disp (-B+√(D))/(2A)
Disp (-B-√(D))/(2A)
End`,
  },
  {
    name: 'FIB',
    source: `Input "HOW MANY?",N
1→A:1→B
For(K,1,N)
Disp A
A+B→C
B→A
C→B
End`,
  },
  {
    name: 'GUESS',
    source: `randInt(1,100)→S
0→T
Disp "GUESS 1-100"
Repeat G=S
Input "GUESS?",G
T+1→T
If G<S
Disp "HIGHER"
If G>S
Disp "LOWER"
End
Disp "CORRECT! TRIES:",T`,
  },
];
