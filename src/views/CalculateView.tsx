import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useKeypadHandler } from '../components/DeviceKeypad';
import { StatusBar } from './ModeView';
import type { KeyAction, KeyFace } from '../components/keypad';
import { MathInput, type MathInputHandle } from '../components/MathInput';
import { Tex } from '../components/Tex';
import { copyText } from '../components/ui';
import { IconCopy, IconTrash } from '../components/Icons';
import { calculate, toFailure } from '../math/engine';
import { evaluateComplex, formatComplex, usesI, type Complex } from '../math/complex';
import { parse } from '../math/parser';
import { toTex } from '../math/latex';
import type { Node } from '../math/ast';
import type { EvalContext, MatrixVal, Scalar, Value } from '../math/evaluate';
import { runProgram, ProgramError, type ProgramIO } from '../math/program';
import { formatValue, type FormatOptions } from '../math/format';
import { useEvalContext } from '../state/context';
import { nextTime, uid, useStore, type HistoryEntry, type ListName } from '../state/store';

/** Entries currently on the calculator screen (ClrHome / CLEAR hide older ones). */
/** Complex values held by Ans and stored variables (kept for this session). */
const complexVars: Record<string, Complex> = {};
/** Matrix values held by Ans and stored variables (kept for this session). */
const matrixVars: Record<string, MatrixVal> = {};

/** ▸F◂▸D and ▸n/d◂▸Un/d (ALPHA f1 FRAC menu) change how an answer is shown. */
const CONVERTERS = [
  { suffix: '▸F◂▸D', tex: '\\blacktriangleright\\mathrm{F}\\blacktriangleleft\\blacktriangleright\\mathrm{D}' },
  { suffix: '▸n/d◂▸Un/d', tex: '\\blacktriangleright\\tfrac{n}{d}\\blacktriangleleft\\blacktriangleright\\mathrm{U}\\tfrac{n}{d}' },
] as const;

/** Best fraction for a decimal (denominator up to 10000), like ▸Frac on the TI-84. */
function approxFraction(x: number): { n: bigint; d: bigint } | null {
  if (!Number.isFinite(x) || Math.abs(x) > 1e12) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 10000) return null;
    if (Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, Math.abs(x))) return { n: BigInt(h1), d: BigInt(k1) };
    const f = v - a;
    if (f < 1e-15) break;
    v = 1 / f;
  }
  return Math.abs(x - h1 / k1) <= 1e-12 * Math.max(1, Math.abs(x)) && k1 <= 10000 ? { n: BigInt(h1), d: BigInt(k1) } : null;
}

function mapScalars(v: Value, f: (s: Scalar) => Scalar): Value {
  if (v.kind === 'scalar') return f(v);
  if (v.kind === 'list') return { kind: 'list', items: v.items.map(f) };
  return { kind: 'matrix', rows: v.rows.map((r) => r.map(f)) };
}

/** Format a value after a ▸F◂▸D or ▸n/d◂▸Un/d conversion. */
function convertedFormat(v: Value, suffix: string, fmt: FormatOptions) {
  const shownExact = formatValue(v, fmt).exact;
  if (suffix === '▸F◂▸D') {
    const isFrac = (s: Scalar) => !!s.r && s.r.d !== 1n;
    const anyFrac = v.kind === 'scalar' ? isFrac(v) : v.kind === 'list' ? v.items.some(isFrac) : v.rows.some((r) => r.some(isFrac));
    // a fraction on screen becomes a decimal; a decimal becomes a fraction when one fits
    if (anyFrac && shownExact && fmt.answers !== 'dec') return formatValue(v, { ...fmt, answers: 'dec' });
    const asFrac = mapScalars(v, (s) => (s.r ? s : { ...s, r: approxFraction(s.n) }));
    return formatValue(asFrac, { ...fmt, answers: 'auto' });
  }
  const withFrac = mapScalars(v, (s) => (s.r ? s : { ...s, r: approxFraction(s.n) }));
  return formatValue(withFrac, { ...fmt, answers: 'auto', fracType: fmt.fracType === 'mixed' ? 'nd' : 'mixed' });
}

function refsComplexVar(n: Node): boolean {
  switch (n.type) {
    case 'var':
      return n.name in complexVars;
    case 'binary':
      return refsComplexVar(n.left) || refsComplexVar(n.right);
    case 'unary':
    case 'postfix':
      return refsComplexVar(n.arg);
    case 'call':
      return n.args.some(refsComplexVar);
    case 'list':
      return n.items.some(refsComplexVar);
    case 'store':
      return refsComplexVar(n.value);
    default:
      return false;
  }
}

const visibleHistory = () => {
  const st = useStore.getState();
  return st.history.filter((h) => h.time >= st.screenFrom);
};

const OPERATOR_KEYS = new Set(['+', '*', '/', '^']);

/** MATHPRINT shows typeset math; CLASSIC shows the plain one-line text, like the TI-84. */
function Show({ tex, text, classic }: { tex: string; text: string; classic: boolean }) {
  return classic ? <span className="classic-text">{text}</span> : <Tex tex={tex} label={text} />;
}

export function CalculateView() {
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const allHistory = useStore((s) => s.history);
  const screenFrom = useStore((s) => s.screenFrom);
  const history = useMemo(() => allHistory.filter((h) => h.time >= screenFrom), [allHistory, screenFrom]);
  const runRequest = useStore((s) => s.runRequest);
  const clearRunRequest = useStore((s) => s.clearRunRequest);
  const addHistory = useStore((s) => s.addHistory);
  const removeHistory = useStore((s) => s.removeHistory);
  const setVar = useStore((s) => s.setVar);
  const fmt = useStore((s) => s.settings.format);
  const keypadOnly = useStore((s) => s.settings.keypadOnly);
  const classic = useStore((s) => s.settings.display === 'classic');
  const hasAns = useStore((s) => !!s.vars.Ans);
  const ctx = useEvalContext();

  const inputRef = useRef<MathInputHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<{ kind: string; message: string; pos?: number } | null>(null);
  /** Highlighted screen line (TI-style ▲/▼ scrolling): 2·i = entry i's expression, 2·i+1 = its answer */
  const [sel, setSel] = useState<number | null>(null);
  const navigate = useStore((s) => s.navigate);
  const isTouch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, []);

  // Scroll to newest entry
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  useEffect(() => {
    if (!isTouch) inputRef.current?.focus();
  }, [isTouch]);

  // Undo / redo history for the entry line (UNDO/REDO keys, Ctrl+Z / Ctrl+Shift+Z)
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const record = (prev: string, next: string) => {
    if (prev === next) return;
    undoStack.current = [...undoStack.current.slice(-99), prev];
    redoStack.current = [];
  };
  const restore = (from: { current: string[] }, to: { current: string[] }) => {
    const v = from.current.pop();
    if (v === undefined) return;
    to.current.push(useStore.getState().input);
    setInput(v);
    setError(null);
    setSel(null);
    requestAnimationFrame(() => inputRef.current?.apply({ type: 'end' }));
  };

  const onChange = useCallback(
    (v: string) => {
      record(useStore.getState().input, v);
      setInput(v);
      setError(null);
      setSel(null);
    },
    [setInput],
  );

  const evaluateInput = useCallback(
    (fullSrc: string) => {
      const conv = CONVERTERS.find((c) => fullSrc.trimEnd().endsWith(c.suffix));
      // like the TI-84, a conversion on an empty line applies to Ans
      const src = conv ? fullSrc.trimEnd().slice(0, -conv.suffix.length).trim() || 'Ans' : fullSrc;
      // Complex numbers: expressions with i, earlier complex answers, or NONREAL results in a+bi / re^θi mode
      let ast: Node | null = null;
      try {
        ast = parse(src);
      } catch {
        ast = null;
      }
      const complexMode = useStore.getState().settings.complex;
      const wantsComplex = ast && (usesI(ast) || refsComplexVar(ast));
      const res = wantsComplex ? null : calculate(src, { ...ctx, matrices: { ...matrixVars } });
      if (!res || !res.ok) {
        if (ast && (wantsComplex || (res && res.kind === 'NONREAL' && complexMode !== 'real'))) {
          try {
            const z = evaluateComplex(ast, ctx, complexVars);
            const out = formatComplex(z, complexMode === 'polar' ? 'polar' : 'rect', fmt);
            addHistory({ id: uid(), input: src, inputTex: toTex(ast), resultTex: out.tex, resultText: out.text, exact: false, time: nextTime() });
            const target = ast.type === 'store' ? ast.target : null;
            if (z.im === 0) {
              delete complexVars.Ans;
              setVar('Ans', { kind: 'scalar', n: z.re, r: null });
              if (target) {
                delete complexVars[target];
                setVar(target, { kind: 'scalar', n: z.re, r: null });
              }
            } else {
              complexVars.Ans = z;
              if (target) complexVars[target] = z;
            }
            record(src, '');
            setInput('');
            setError(null);
            setSel(null);
          } catch (e) {
            const f = toFailure(e);
            setError({ kind: f.kind, message: f.error, pos: f.pos });
          }
          return;
        }
        if (res && !res.ok) {
          const hint = res.kind === 'NONREAL' && complexMode === 'real' ? ' (choose a+bi on the MODE screen for complex answers)' : '';
          setError({ kind: res.kind, message: res.error + hint, pos: res.pos });
        }
        return;
      }
      if (res.value.kind !== 'list') delete complexVars.Ans;
      if (res.storedTo) delete complexVars[res.storedTo];
      // a conversion shows only the converted form
      const f = conv ? { ...convertedFormat(res.value, conv.suffix, fmt), approxTex: undefined } : formatValue(res.value, fmt);
      const entry: HistoryEntry = {
        id: uid(),
        input: fullSrc,
        inputTex: conv ? `${res.inputTex}${conv.tex}` : res.inputTex,
        resultTex: f.tex,
        approxTex: f.approxTex,
        resultText: f.text,
        exact: f.exact,
        time: nextTime(),
      };
      const target = res.storedTo;
      if (target && /^L[1-6]$/.test(target) !== (res.value.kind === 'list')) {
        setError({ kind: 'DATA TYPE', message: res.value.kind === 'list' ? 'Lists can only be stored in L1–L6' : `Only a list can be stored in ${target}` });
        return;
      }
      addHistory(entry);
      if (res.value.kind === 'matrix') {
        // matrices live in Ans (and letters stored with STO→) for this session
        matrixVars.Ans = res.value;
        if (target) matrixVars[target] = res.value;
      } else {
        delete matrixVars.Ans;
        if (target) delete matrixVars[target];
      }
      if (res.value.kind === 'scalar') {
        setVar('Ans', res.value);
        if (target) setVar(target, res.value);
      } else if (target && res.value.kind === 'list') {
        useStore.getState().setList(target as ListName, res.value.items.map((it) => it.n));
      }
      record(src, '');
      setInput('');
      setError(null);
      setSel(null);
    },
    [ctx, fmt, addHistory, setVar, setInput],
  );

  const lineText = (row: number) => {
    const h = visibleHistory()[row >> 1];
    if (!h) return '';
    if (h.kind === 'text') return '';
    return row % 2 === 0 ? h.input : h.resultText ?? '';
  };

  /* ------------------------------ programs ------------------------------ */
  const [run, setRun] = useState<{ name: string; prompt: string | null; paused: boolean } | null>(null);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const resolverRef = useRef<((s: string) => void) | null>(null);
  const promptRef = useRef<string | null>(null);
  const fmtRef = useRef(fmt);
  fmtRef.current = fmt;
  const ctxRef = useRef<EvalContext>(ctx);
  ctxRef.current = ctx;

  const push = (e: Partial<HistoryEntry>) => addHistory({ id: uid(), input: '', inputTex: '', time: nextTime(), ...e });

  const startProgram = useCallback(
    async (rawName: string) => {
      const name = rawName.toUpperCase();
      if (runningRef.current) return;
      const st = useStore.getState();
      if (!st.programs.some((p) => p.name === name)) {
        setError({ kind: 'UNDEFINED', message: `There is no program named ${name} — create it with PRGM ▸ NEW` });
        return;
      }
      record(st.input, '');
      setInput('');
      setError(null);
      setSel(null);
      push({ input: `prgm${name}`, inputTex: `\\mathrm{prgm${name.replace('θ', '\\theta ')}}` });
      cancelRef.current = false;
      runningRef.current = true;
      setRun({ name, prompt: null, paused: false });
      const base = ctxRef.current;
      const local: EvalContext = { ...base, vars: { ...base.vars }, lists: { ...base.lists } };
      const io: ProgramIO = {
        text: (t) => push({ kind: 'text', text: t }),
        value: (v) => {
          const f = formatValue(v, fmtRef.current);
          push({ kind: 'value', resultTex: f.tex, resultText: f.text, approxTex: f.approxTex });
        },
        input: (prompt) =>
          new Promise((resolve) => {
            promptRef.current = prompt;
            resolverRef.current = resolve;
            setRun((r) => r && { ...r, prompt });
          }),
        pause: () =>
          new Promise((resolve) => {
            resolverRef.current = () => resolve();
            setRun((r) => r && { ...r, paused: true });
          }),
        clear: () => useStore.getState().clearScreen(),
        store: (n, v) => {
          if (v.kind === 'list') useStore.getState().setList(n as ListName, v.items.map((it) => it.n));
          else if (v.kind === 'scalar') useStore.getState().setVar(n, v);
        },
        getProgram: (n) => useStore.getState().programs.find((p) => p.name === n)?.source ?? null,
        cancelled: () => cancelRef.current,
      };
      try {
        const res = await runProgram(name, local, io);
        push({ kind: 'value', resultTex: res.stoppedByUser ? '\\text{Break}' : '\\text{Done}', resultText: '' });
      } catch (e) {
        const pe = e as ProgramError;
        const where = pe.line ? ` (prgm${pe.program ?? name}, line ${pe.line})` : '';
        push({ kind: 'text', text: `ERR:${pe.kind ?? 'ERROR'} ${pe.message}${where}` });
      } finally {
        runningRef.current = false;
        resolverRef.current = null;
        promptRef.current = null;
        setRun(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setInput],
  );

  const stopProgram = useCallback(() => {
    cancelRef.current = true;
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.('0');
  }, []);

  // "Run" from the program editor
  useEffect(() => {
    if (!runRequest) return;
    clearRunRequest();
    void startProgram(runRequest);
  }, [runRequest, clearRunRequest, startProgram]);

  // Stop a running program when leaving the calculator
  useEffect(() => () => stopProgram(), [stopProgram]);

  const submit = useCallback(() => {
    if (runningRef.current) {
      // A running program is waiting for Input / Prompt / Pause
      const resolve = resolverRef.current;
      if (!resolve) return;
      const src = useStore.getState().input;
      if (promptRef.current !== null) {
        if (!src.trim()) return;
        push({ kind: 'text', text: `${promptRef.current}${src}` });
        record(src, '');
        setInput('');
      }
      resolverRef.current = null;
      promptRef.current = null;
      setRun((r) => r && { ...r, prompt: null, paused: false });
      resolve(src);
      return;
    }
    if (sel !== null) {
      // ENTER on a highlighted line pastes it into the entry line, like the TI-84
      inputRef.current?.apply({ type: 'insert', text: lineText(sel) });
      setSel(null);
      return;
    }
    const src = useStore.getState().input;
    if (!src.trim()) {
      // Enter on an empty line repeats the last entry (handy for Ans+1 iterations)
      const last = [...visibleHistory()].reverse().find((h) => !h.kind && h.input);
      if (last) {
        const pm = /^prgm(.+)$/.exec(last.input);
        if (pm) void startProgram(pm[1]);
        else evaluateInput(last.input);
      }
      return;
    }
    const pm = /^\s*prgm\s*([A-Za-z0-9θ]+)\s*$/i.exec(src);
    if (pm) {
      void startProgram(pm[1]);
      return;
    }
    evaluateInput(src);
  }, [evaluateInput, sel, startProgram]);

  /** ▲/▼: move the highlight through the screen's lines. */
  const moveSel = useCallback((dir: -1 | 1, page = false) => {
    const rows = visibleHistory().length * 2;
    if (!rows) return;
    const step = page ? 6 : 1;
    setSel((cur) => {
      if (cur === null) return dir === -1 ? Math.max(0, rows - step) : null;
      const next = cur + dir * step;
      if (next >= rows) return null;
      return Math.max(0, next);
    });
  }, []);

  // Keep the highlighted line visible; return to the bottom when the highlight clears
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (sel === null) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    el.querySelector(`[data-row="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onAction = useCallback(
    (a: KeyAction, face: KeyFace) => {
      const t = inputRef.current;
      if (!t) return;
      // Show the caret on the screen once the keypad is used (inputMode="none" keeps the phone keyboard hidden)
      const el = t.el();
      if (el && document.activeElement !== el && a.type !== 'nav') el.focus({ preventScroll: true });
      switch (a.type) {
        case 'enter':
          return submit();
        case 'entry': {
          const last = useStore.getState().history.at(-1);
          if (last) {
            setInput(last.input);
            setSel(null);
            requestAnimationFrame(() => inputRef.current?.apply({ type: 'end' }));
          }
          return;
        }
        case 'scroll':
          return moveSel(a.dir, a.page);
        case 'nav':
          return navigate(a.view, a.intent);
        case 'undo':
          return restore(undoStack, redoStack);
        case 'redo':
          return restore(redoStack, undoStack);
        case 'quit':
          record(useStore.getState().input, '');
          setInput('');
          setError(null);
          setSel(null);
          return;
        case 'none':
        case 'second':
        case 'alpha':
        case 'alphaLock':
        case 'menu':
          return;
      }
      setSel(null);
      if (a.type === 'insert' && face.binaryOp && !useStore.getState().input && useStore.getState().vars.Ans) {
        t.apply({ type: 'insert', text: `Ans${a.text.trimStart()}` });
        return;
      }
      if (a.type === 'clear') {
        setError(null);
        // CLEAR on an empty entry line clears the screen, as on the TI-84
        if (!useStore.getState().input && !runningRef.current) {
          useStore.getState().clearScreen();
          return;
        }
      }
      t.apply(a);
    },
    [submit, moveSel, navigate, setInput],
  );

  // The always-visible keypad sends its keys here while the home screen is open
  useKeypadHandler((a, face) => {
    onAction(a, face);
    return true;
  });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) restore(redoStack, undoStack);
      else restore(undoStack, redoStack);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      moveSel(-1, e.key === 'PageUp');
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      moveSel(1, e.key === 'PageDown');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (runningRef.current) stopProgram();
      else if (sel !== null) setSel(null);
      else {
        record(input, '');
        setInput('');
        setError(null);
      }
    } else if (OPERATOR_KEYS.has(e.key) && !input && hasAns && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      inputRef.current?.apply({ type: 'insert', text: `Ans${e.key}` });
    }
  };

  const insertText = (text: string) => {
    setSel(null);
    inputRef.current?.apply({ type: 'insert', text });
    if (!isTouch) inputRef.current?.focus();
  };

  return (
    <div className="calc-layout">
      <section className="calc-display" aria-label="Calculator screen" onClick={() => !isTouch && inputRef.current?.focus()}>
        <StatusBar />
        <div className="history-scroll" ref={scrollRef} role="log" aria-label="Calculator screen">
          {history.map((h, i) =>
            h.kind === 'text' ? (
              <div key={h.id} className={`hist-line${h.text?.startsWith('ERR:') ? ' err' : ''}`}>
                {h.text || '\u00a0'}
              </div>
            ) : h.kind === 'value' ? (
              <div key={h.id} className="hist-line value">
                <button className={`hist-result${sel === i * 2 + 1 ? ' selected' : ''}`} data-row={i * 2 + 1} onClick={() => h.resultText && insertText(h.resultText)}>
                  <Show tex={h.resultTex ?? ''} text={h.resultText ?? ''} classic={classic} />
                </button>
              </div>
            ) : (
              <div key={h.id} className="hist-entry">
                <button className={`hist-input${sel === i * 2 ? ' selected' : ''}`} data-row={i * 2} title="Reuse this expression" onClick={() => insertText(h.input)}>
                  <Show tex={h.inputTex} text={h.input} classic={classic} />
                </button>
                {h.resultTex !== undefined && (
                  <div className="hist-result-row">
                    <div className="hist-actions">
                      <button className="icon-btn sm" title="Copy result" aria-label="Copy result" onClick={() => copyText(h.resultText ?? '')}>
                        <IconCopy />
                      </button>
                      <button className="icon-btn sm" title="Remove from history" aria-label="Remove from history" onClick={() => removeHistory(h.id)}>
                        <IconTrash />
                      </button>
                    </div>
                    <button className={`hist-result${sel === i * 2 + 1 ? ' selected' : ''}`} data-row={i * 2 + 1} title="Insert this result" onClick={() => insertText(h.resultText ?? '')}>
                      <Show tex={h.resultTex ?? ''} text={h.resultText ?? ''} classic={classic} />
                    </button>
                  </div>
                )}
                {h.approxTex && !classic && (
                  <div className="hist-approx" title="The answer above is exact; this is its decimal value">
                    <Tex tex={`\\approx ${h.approxTex}`} />
                  </div>
                )}
              </div>
            ),
          )}

          {/* The entry line is typed straight onto the screen, like a TI-84 */}
          {run && (
            <div className="run-status" role="status">
              <span>
                {run.paused ? 'Paused — press ENTER' : run.prompt !== null ? `prgm${run.name} is waiting for input` : `Running prgm${run.name}…`}
              </span>
              <button className="btn sm danger" onClick={stopProgram} title="Break the program (Esc)">
                ■ Stop
              </button>
            </div>
          )}
          <div className={`entry${error ? ' has-error' : ''}${run?.prompt !== null && run ? ' prompting' : ''}`}>
            {run?.prompt != null && <span className="entry-prompt">{run.prompt}</span>}
            <MathInput
              ref={inputRef}
              value={input}
              onChange={onChange}
              onSubmit={submit}
              onKeyDown={onKeyDown}
              ariaLabel="Expression"
              className="entry-input"
              noSystemKeyboard={isTouch && keypadOnly}
              invalid={!!error}
              ariaDescribedBy={error ? 'calc-error' : undefined}
            />
            {error && (
              <div className="entry-error" id="calc-error" role="alert">
                <b>ERR: {error.kind}</b> {error.message}
                {error.pos !== undefined && input && (
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      const el = inputRef.current?.el();
                      el?.focus();
                      el?.setSelectionRange(error.pos!, Math.min(error.pos! + 1, input.length));
                    }}
                  >
                    Go to error
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
