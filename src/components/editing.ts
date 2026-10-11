/**
 * Pure text-editing operations used by the keypad and the symbol bar.
 * Each returns the new value and caret position so components can apply
 * them to a controlled <input>.
 */
export interface EditState {
  value: string;
  start: number;
  end: number;
}
export interface EditResult {
  value: string;
  caret: number;
}

export type EditOp =
  | { type: 'insert'; text: string; caret?: number; wrap?: boolean }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'clear' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'home' }
  | { type: 'end' };

/** Tokens removed as a unit by backspace. */
const TOKEN_BEFORE = /(?:[A-Za-z]+⁻¹\(|[A-Za-z]+\(|√\(|∛\(|Ans|→|ᴇ|⁻¹)$/;

export function applyEdit(s: EditState, op: EditOp): EditResult {
  const { value, start, end } = s;
  const hasSel = end > start;
  switch (op.type) {
    case 'insert': {
      const sel = value.slice(start, end);
      let text = op.text;
      let caret = op.caret ?? text.length;
      if (hasSel && op.wrap) {
        // wrap the selection: "sin(" + sel + ")"
        text = `${op.text}${sel}${op.text.endsWith('(') ? ')' : ''}`;
        caret = text.length;
      }
      return { value: value.slice(0, start) + text + value.slice(end), caret: start + caret };
    }
    case 'backspace': {
      if (hasSel) return { value: value.slice(0, start) + value.slice(end), caret: start };
      if (start === 0) return { value, caret: 0 };
      const before = value.slice(0, start);
      const m = TOKEN_BEFORE.exec(before);
      const n = m ? m[0].length : 1;
      // keep surrogate pairs together
      return { value: value.slice(0, start - n) + value.slice(start), caret: start - n };
    }
    case 'delete': {
      if (hasSel) return { value: value.slice(0, start) + value.slice(end), caret: start };
      return { value: value.slice(0, start) + value.slice(start + 1), caret: start };
    }
    case 'clear':
      return { value: '', caret: 0 };
    case 'left':
      return { value, caret: hasSel ? start : Math.max(0, start - 1) };
    case 'right':
      return { value, caret: hasSel ? end : Math.min(value.length, end + 1) };
    case 'home':
      return { value, caret: 0 };
    case 'end':
      return { value, caret: value.length };
  }
}

/* ------------------------------------------------------------------------ */
/* Active input registry: the symbol bar inserts into the last focused field */
/* ------------------------------------------------------------------------ */

export interface EditTarget {
  apply: (op: EditOp) => void;
  submit?: () => void;
}

let activeTarget: EditTarget | null = null;
const subs = new Set<() => void>();

export function setActiveTarget(t: EditTarget | null) {
  activeTarget = t;
  subs.forEach((f) => f());
}
export function getActiveTarget() {
  return activeTarget;
}
export function subscribeActiveTarget(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
