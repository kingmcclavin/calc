import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Keypad } from '../components/Keypad';
import type { KeyAction, KeyFace } from '../components/keypad';
import { MathInput, type MathInputHandle } from '../components/MathInput';
import { Tex } from '../components/Tex';
import { copyText } from '../components/ui';
import { IconCopy, IconTrash } from '../components/Icons';
import { calculate, previewTex } from '../math/engine';
import { formatValue } from '../math/format';
import { useEvalContext } from '../state/context';
import { uid, useStore, type HistoryEntry } from '../state/store';

const OPERATOR_KEYS = new Set(['+', '*', '/', '^']);

export function CalculateView() {
  const input = useStore((s) => s.input);
  const setInput = useStore((s) => s.setInput);
  const history = useStore((s) => s.history);
  const addHistory = useStore((s) => s.addHistory);
  const removeHistory = useStore((s) => s.removeHistory);
  const setVar = useStore((s) => s.setVar);
  const fmt = useStore((s) => s.settings.format);
  const keypadOnly = useStore((s) => s.settings.keypadOnly);
  const hasAns = useStore((s) => !!s.vars.Ans);
  const ctx = useEvalContext();

  const inputRef = useRef<MathInputHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<{ kind: string; message: string; pos?: number } | null>(null);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const isTouch = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches, []);

  // Scroll to newest entry
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length]);

  useEffect(() => {
    if (!isTouch) inputRef.current?.focus();
  }, [isTouch]);

  const onChange = useCallback(
    (v: string) => {
      setInput(v);
      setError(null);
      setHistIdx(null);
    },
    [setInput],
  );

  const evaluateInput = useCallback(
    (src: string) => {
      const res = calculate(src, ctx);
      if (!res.ok) {
        setError({ kind: res.kind, message: res.error, pos: res.pos });
        return;
      }
      const f = formatValue(res.value, fmt);
      const entry: HistoryEntry = {
        id: uid(),
        input: src,
        inputTex: res.inputTex,
        resultTex: f.tex,
        approxTex: f.approxTex,
        resultText: f.text,
        exact: f.exact,
        time: Date.now(),
      };
      addHistory(entry);
      if (res.value.kind === 'scalar') {
        setVar('Ans', res.value);
        if (res.storedTo) setVar(res.storedTo, res.value);
      } else if (res.storedTo) {
        setError({ kind: 'DATA TYPE', message: 'Only numbers can be stored in variables' });
      }
      setInput('');
      setError(null);
      setHistIdx(null);
    },
    [ctx, fmt, addHistory, setVar, setInput],
  );

  const submit = useCallback(() => {
    const src = useStore.getState().input;
    if (!src.trim()) {
      // Enter on an empty line repeats the last entry (handy for Ans+1 iterations)
      const last = useStore.getState().history.at(-1);
      if (last) evaluateInput(last.input);
      return;
    }
    evaluateInput(src);
  }, [evaluateInput]);

  const recall = useCallback(
    (dir: -1 | 1) => {
      const h = useStore.getState().history;
      if (!h.length) return;
      let idx = histIdx === null ? (dir === -1 ? h.length - 1 : null) : histIdx + dir;
      if (idx !== null && idx >= h.length) idx = null;
      if (idx !== null && idx < 0) idx = 0;
      setHistIdx(idx);
      setInput(idx === null ? '' : h[idx].input);
      inputRef.current?.apply({ type: 'end' });
    },
    [histIdx, setInput],
  );

  const onAction = useCallback(
    (a: KeyAction, face: KeyFace) => {
      const t = inputRef.current;
      if (!t) return;
      if (a.type === 'enter') return submit();
      if (a.type === 'entry') return recall(-1);
      if (a.type === 'none' || a.type === 'second' || a.type === 'angle' || a.type === 'menu') return;
      if (a.type === 'insert' && face.binaryOp && !useStore.getState().input && useStore.getState().vars.Ans) {
        t.apply({ type: 'insert', text: `Ans${a.text.trimStart()}` });
        return;
      }
      if (a.type === 'clear') setError(null);
      t.apply(a);
    },
    [submit, recall],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      recall(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      recall(1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      setError(null);
    } else if (OPERATOR_KEYS.has(e.key) && !input && hasAns && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      inputRef.current?.apply({ type: 'insert', text: `Ans${e.key}` });
    }
  };

  // Live preview of the rendered input and its value
  const live = useMemo(() => {
    if (!input.trim()) return null;
    const tex = previewTex(input);
    let value: string | null = null;
    if (tex && !/rand|→|->/i.test(input)) {
      const r = calculate(input, ctx);
      if (r.ok) value = formatValue(r.value, fmt).tex;
    }
    return { tex, value };
  }, [input, ctx, fmt]);

  const insertText = (text: string) => {
    inputRef.current?.apply({ type: 'insert', text });
    if (!isTouch) inputRef.current?.focus();
  };

  return (
    <div className="calc-layout">
      <section className="calc-display" aria-label="Calculator display">
        <div className="history-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="Calculation history">
          {history.length === 0 && (
            <div className="calc-welcome">
              <div className="calc-welcome-title">Ready when you are.</div>
              <p className="muted small">Type an expression or use the keypad. Try one of these:</p>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                {['1/3 + 1/6', '√(50)', 'sin(π/6)', '5!/(2!3!)', 'fnInt(x², x, 0, 3)', 'normalcdf(-1, 1)'].map((ex) => (
                  <button key={ex} className="chip" onClick={() => evaluateInput(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((h) => (
            <div key={h.id} className="hist-entry">
              <button className="hist-input" title="Reuse this expression" onClick={() => insertText(h.input)}>
                <Tex tex={h.inputTex} label={h.input} />
              </button>
              <div className="hist-result-row">
                <div className="hist-actions">
                  <button className="icon-btn sm" title="Copy result" aria-label="Copy result" onClick={() => copyText(h.resultText ?? '')}>
                    <IconCopy />
                  </button>
                  <button className="icon-btn sm" title="Remove from history" aria-label="Remove from history" onClick={() => removeHistory(h.id)}>
                    <IconTrash />
                  </button>
                </div>
                <button className="hist-result" title="Insert this result" onClick={() => insertText(h.resultText ?? '')}>
                  <span className="hist-eq">=</span>
                  <Tex tex={h.resultTex ?? ''} label={h.resultText} />
                </button>
              </div>
              {h.approxTex && (
                <div className="hist-approx">
                  <span className="badge exact" title="Exact rational result">exact</span>
                  <Tex tex={`\\approx ${h.approxTex}`} />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={`entry${error ? ' has-error' : ''}`}>
          <div className="entry-preview" aria-hidden="true">
            {live?.tex ? <Tex tex={live.tex} /> : <span className="muted">{input ? '…' : ' '}</span>}
            {live?.value && !error && (
              <span className="entry-live">
                <Tex tex={`= ${live.value}`} />
              </span>
            )}
          </div>
          <MathInput
            ref={inputRef}
            value={input}
            onChange={onChange}
            onSubmit={submit}
            onKeyDown={onKeyDown}
            ariaLabel="Expression"
            className="entry-input"
            placeholder="Enter an expression"
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
      </section>
      <section className="calc-keys">
        <Keypad onAction={onAction} />
      </section>
    </div>
  );
}
