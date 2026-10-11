import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Keypad } from '../components/Keypad';
import type { KeyAction, KeyFace } from '../components/keypad';
import { MathInput, type MathInputHandle } from '../components/MathInput';
import { Tex } from '../components/Tex';
import { copyText } from '../components/ui';
import { IconCopy, IconTrash } from '../components/Icons';
import { calculate } from '../math/engine';
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
      record(src, '');
      setInput('');
      setError(null);
      setSel(null);
    },
    [ctx, fmt, addHistory, setVar, setInput],
  );

  const lineText = (row: number) => {
    const h = useStore.getState().history[row >> 1];
    if (!h) return '';
    return row % 2 === 0 ? h.input : h.resultText ?? '';
  };

  const submit = useCallback(() => {
    if (sel !== null) {
      // ENTER on a highlighted line pastes it into the entry line, like the TI-84
      inputRef.current?.apply({ type: 'insert', text: lineText(sel) });
      setSel(null);
      return;
    }
    const src = useStore.getState().input;
    if (!src.trim()) {
      // Enter on an empty line repeats the last entry (handy for Ans+1 iterations)
      const last = useStore.getState().history.at(-1);
      if (last) evaluateInput(last.input);
      return;
    }
    evaluateInput(src);
  }, [evaluateInput, sel]);

  /** ▲/▼: move the highlight through the screen's lines. */
  const moveSel = useCallback((dir: -1 | 1, page = false) => {
    const rows = useStore.getState().history.length * 2;
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
      if (a.type === 'clear') setError(null);
      t.apply(a);
    },
    [submit, moveSel, navigate, setInput],
  );

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
      if (sel !== null) setSel(null);
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
        <div className="history-scroll" ref={scrollRef} role="log" aria-label="Calculator screen">
          {history.map((h, i) => (
            <div key={h.id} className="hist-entry">
              <button className={`hist-input${sel === i * 2 ? ' selected' : ''}`} data-row={i * 2} title="Reuse this expression" onClick={() => insertText(h.input)}>
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
                <button className={`hist-result${sel === i * 2 + 1 ? ' selected' : ''}`} data-row={i * 2 + 1} title="Insert this result" onClick={() => insertText(h.resultText ?? '')}>
                  <Tex tex={h.resultTex ?? ''} label={h.resultText} />
                </button>
              </div>
              {h.approxTex && (
                <div className="hist-approx" title="The answer above is exact; this is its decimal value">
                  <Tex tex={`\\approx ${h.approxTex}`} />
                </div>
              )}
            </div>
          ))}

          {/* The entry line is typed straight onto the screen, like a TI-84 */}
          <div className={`entry${error ? ' has-error' : ''}`}>
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
      <section className="calc-keys">
        <Keypad onAction={onAction} />
      </section>
    </div>
  );
}
