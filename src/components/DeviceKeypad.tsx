import { useCallback, useEffect, useRef } from 'react';
import { Keypad } from './Keypad';
import { applyEdit, type EditOp } from './editing';
import type { KeyAction, KeyFace } from './keypad';
import { useStore } from '../state/store';

/**
 * The keypad is always on screen (like a real TI-84), whatever section is
 * open. Key presses are routed in this order:
 *   1. navigation keys (Y=, GRAPH, STAT, …) switch section
 *   2. the current section's own handler (home screen, graph, table)
 *   3. the focused text field in the section, if any
 *   4. TI-style fallbacks: typing returns to the home screen, CLEAR/QUIT go home
 */
export type KeyHandler = (action: KeyAction, face: KeyFace) => boolean;

let viewHandler: KeyHandler | null = null;

/** Let the active section handle keypad presses. Return true when handled. */
export function useKeypadHandler(fn: KeyHandler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h: KeyHandler = (a, f) => ref.current(a, f);
    viewHandler = h;
    return () => {
      if (viewHandler === h) viewHandler = null;
    };
  }, []);
}

const EDIT_TYPES = new Set(['insert', 'backspace', 'delete', 'clear', 'left', 'right', 'home', 'end']);

/** The text field the user is editing inside the current section, if any. */
export function focusedField(): HTMLInputElement | HTMLTextAreaElement | null {
  const el = document.activeElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  if (el instanceof HTMLInputElement && !['text', 'search', ''].includes(el.type)) return null;
  if (el.readOnly || el.disabled) return null;
  return document.getElementById('main')?.contains(el) ? el : null;
}

/** Apply an edit to a (React-controlled) field by setting its value natively and firing "input". */
function editField(el: HTMLInputElement | HTMLTextAreaElement, op: EditOp) {
  const res = applyEdit({ value: el.value, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length }, op);
  if (res.value !== el.value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, res.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  requestAnimationFrame(() => el.setSelectionRange(res.caret, res.caret));
}

export function DeviceKeypad() {
  const onAction = useCallback((a: KeyAction, face: KeyFace) => {
    const st = useStore.getState();
    if (a.type === 'nav') {
      st.navigate(a.view, a.intent);
      return;
    }
    if (viewHandler?.(a, face)) return;
    if (st.view === 'calc') return;

    const field = focusedField();
    if (field) {
      if (EDIT_TYPES.has(a.type)) {
        // CLEAR on an empty field leaves it, like CLEAR on a TI screen
        if (a.type === 'clear' && !field.value) field.blur();
        else editField(field, a as EditOp);
        return;
      }
      if (a.type === 'enter') {
        if (field instanceof HTMLTextAreaElement) editField(field, { type: 'insert', text: '\n' });
        else field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return;
      }
    }

    switch (a.type) {
      case 'insert':
        // Typing on another screen goes back to the home screen, as on the TI-84
        st.setInput(st.input + a.text);
        st.setView('calc');
        return;
      case 'clear':
      case 'quit':
      case 'entry':
        st.setView('calc');
        return;
      case 'scroll': {
        const view = document.getElementById('main');
        const scroller = view?.querySelector<HTMLElement>('.table-scroll, .graph-side-scroll') ?? view;
        scroller?.scrollBy({ top: a.dir * (a.page ? 240 : 60), behavior: 'smooth' });
        return;
      }
      default:
        return;
    }
  }, []);

  return (
    <aside className="device-keys" aria-label="Calculator keypad">
      <Keypad onAction={onAction} />
    </aside>
  );
}
