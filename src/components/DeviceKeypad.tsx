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

/** Handlers of the screens currently shown; the most recently mounted is asked first (split screens show two). */
const handlers: KeyHandler[] = [];

/** Let the active section handle keypad presses. Return true when handled. */
export function useKeypadHandler(fn: KeyHandler) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h: KeyHandler = (a, f) => ref.current(a, f);
    handlers.push(h);
    return () => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    };
  }, []);
}

function runHandlers(a: KeyAction, face: KeyFace): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i](a, face)) return true;
  return false;
}

const EDIT_TYPES = new Set(['insert', 'backspace', 'delete', 'clear', 'left', 'right', 'home', 'end']);

type Field = HTMLInputElement | HTMLTextAreaElement;

function isEditable(el: Element | null): el is Field {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && !['text', 'search', ''].includes(el.type)) return false;
  if (el.readOnly || el.disabled) return false;
  // must be on the current screen and visible
  return !!document.getElementById('main')?.contains(el) && el.isConnected && el.getClientRects().length > 0;
}

/**
 * The last text field used on the screen. On phones a field easily loses focus
 * (a tap elsewhere, a menu or form closing), so keypad presses keep going to it,
 * like the cursor on a TI-84 screen stays where it was.
 */
let lastField: Field | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target as Element)) lastField = e.target as Field;
  });
}

/** The field that has keyboard focus right now (not a remembered one). */
export function activeField(): Field | null {
  const el = document.activeElement;
  return isEditable(el) ? el : null;
}

/** The text field the user is editing inside the current section, if any. */
export function focusedField(): Field | null {
  const el = document.activeElement;
  if (isEditable(el)) return el;
  // the field had focus most recently and is still on screen
  if (lastField && isEditable(lastField) && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return lastField;
  return null;
}

/** On the Y= screen the cursor starts on Y1 (or the first line), as on a TI-84. */
function defaultField(view: string): Field | null {
  if (view !== 'yeq') return null;
  const el = document.querySelector('#main .fn-input-row input, #main .graph-side-scroll input.input');
  return isEditable(el) ? el : null;
}

/** Apply an edit to a (React-controlled) field by setting its value natively and firing "input". */
function editField(el: Field, op: EditOp) {
  if (document.activeElement !== el) el.focus({ preventScroll: true });
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
    if (runHandlers(a, face)) return;
    if (st.view === 'calc') return;

    const field = focusedField() ?? defaultField(st.view);
    // Y= screen: ENTER and ▲▼ move between the Y1, Y2, … lines
    if (st.view === 'yeq' && (a.type === 'enter' || a.type === 'scroll')) {
      const lines = [...document.querySelectorAll<HTMLInputElement>('#main .graph-side-scroll input.input')].filter(isEditable);
      if (lines.length) {
        const i = field ? lines.indexOf(field as HTMLInputElement) : -1;
        const d = a.type === 'enter' ? 1 : a.dir;
        const next = lines[Math.min(lines.length - 1, Math.max(0, i < 0 ? 0 : i + d))];
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
        const end = next.value.length;
        next.setSelectionRange(end, end);
        return;
      }
    }
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
