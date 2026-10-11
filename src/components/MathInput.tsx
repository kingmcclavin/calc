import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { applyEdit, setActiveTarget, type EditOp, type EditTarget } from './editing';

export interface MathInputHandle extends EditTarget {
  focus: () => void;
  el: () => HTMLInputElement | null;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  invalid?: boolean;
  /** Suppress the on-screen system keyboard (keypad provides input) */
  noSystemKeyboard?: boolean;
  autoFocus?: boolean;
  id?: string;
  ariaDescribedBy?: string;
}

/** Normalises characters typed on a physical keyboard into calculator notation. */
function normaliseTyped(s: string): string {
  return s.replace(/\*\*/g, '^').replace(/->/g, '→');
}

export const MathInput = forwardRef<MathInputHandle, Props>(function MathInput(
  { value, onChange, onSubmit, onKeyDown, placeholder, ariaLabel, className, invalid, noSystemKeyboard, autoFocus, id, ariaDescribedBy },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const lastSel = useRef<{ start: number; end: number }>({ start: value.length, end: value.length });
  const valueRef = useRef(value);
  valueRef.current = value;

  const apply = useCallback(
    (op: EditOp) => {
      const el = inputRef.current;
      const focused = el && document.activeElement === el;
      const start = focused ? el.selectionStart ?? valueRef.current.length : Math.min(lastSel.current.start, valueRef.current.length);
      const end = focused ? el.selectionEnd ?? start : Math.min(lastSel.current.end, valueRef.current.length);
      const res = applyEdit({ value: valueRef.current, start, end }, op);
      pendingCaret.current = res.caret;
      lastSel.current = { start: res.caret, end: res.caret };
      if (res.value !== valueRef.current) onChange(res.value);
      else if (el) {
        // caret-only move
        el.setSelectionRange(res.caret, res.caret);
        pendingCaret.current = null;
      }
    },
    [onChange],
  );

  const target = useRef<EditTarget>({ apply, submit: onSubmit });
  target.current.apply = apply;
  target.current.submit = onSubmit;

  useImperativeHandle(
    ref,
    () => ({
      apply: (op) => target.current.apply(op),
      submit: () => target.current.submit?.(),
      focus: () => inputRef.current?.focus({ preventScroll: true }),
      el: () => inputRef.current,
    }),
    [],
  );

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && pendingCaret.current !== null) {
      const c = Math.min(pendingCaret.current, value.length);
      if (document.activeElement === el) el.setSelectionRange(c, c);
      // keep caret visible when the text is wider than the field
      if (c >= value.length - 1) el.scrollLeft = el.scrollWidth;
      pendingCaret.current = null;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const remember = () => {
    const el = inputRef.current;
    if (el) lastSel.current = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  };

  return (
    <input
      ref={inputRef}
      id={id}
      className={`${className ?? 'input'}${invalid ? ' invalid' : ''}`}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
      inputMode={noSystemKeyboard ? 'none' : 'text'}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="done"
      onChange={(e) => {
        const v = normaliseTyped(e.target.value);
        if (v !== e.target.value) pendingCaret.current = (e.target.selectionStart ?? v.length) - (e.target.value.length - v.length);
        onChange(v);
      }}
      onSelect={remember}
      onKeyUp={remember}
      onFocus={() => setActiveTarget(target.current)}
      onBlur={remember}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit?.();
        }
      }}
    />
  );
});
