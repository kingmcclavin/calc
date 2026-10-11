import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons';

/* ---------------------------------- Dialog -------------------------------- */

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Dialog({ title, onClose, children, footer, wide }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, button:not([data-close]), select');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && ref.current) {
        // simple focus trap
        const items = ref.current.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!items.length) return;
        const firstEl = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="popover dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(760px, calc(100vw - 24px))' } : undefined}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn sm" data-close onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 0, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ---------------------------------- Toast --------------------------------- */

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const l: Listener = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 1800);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
      clearTimeout(t);
    };
  }, []);
  return msg ? (
    <div className="toast" role="status" aria-live="polite">
      {msg}
    </div>
  ) : null;
}

export async function copyText(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    // Fallback for browsers without async clipboard permission
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(label);
    } catch {
      toast('Copy failed');
    }
    ta.remove();
  }
}

/* ------------------------------ Numeric input ------------------------------ */

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  validate?: (v: number) => string | null;
  /** Evaluate expressions such as "2π" */
  evaluate: (s: string) => number | null;
  id?: string;
}

/** A text field that accepts expressions (e.g. "-2π") and commits a number on blur/enter. */
export function NumberField({ label, value, onCommit, validate, evaluate, id }: NumberFieldProps) {
  const [text, setText] = useState(fmtPlain(value));
  const [err, setErr] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtPlain(value));
  }, [value]);
  const commit = () => {
    const v = evaluate(text);
    if (v === null || !Number.isFinite(v)) {
      setErr('Not a number');
      return;
    }
    const msg = validate?.(v) ?? null;
    setErr(msg);
    if (!msg) onCommit(v);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        id={id}
        className={`input${err ? ' invalid' : ''}`}
        value={text}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        aria-invalid={!!err}
        title={err ?? undefined}
      />
      {err && <small className="error-text">{err}</small>}
    </label>
  );
}

export function fmtPlain(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return String(Number(v.toPrecision(12)));
}
