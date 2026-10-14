import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKeypadHandler } from './DeviceKeypad';
import { matrixTemplate, SHORTCUT_ITEMS, SHORTCUT_TABS, type ShortcutItem, type ShortcutTabId } from './keypad';

interface Props {
  tab: ShortcutTabId;
  setTab: (t: ShortcutTabId) => void;
  onClose: () => void;
  onPick: (item: ShortcutItem) => void;
}

const MAX_DIM = 6;

/**
 * The TI-84 Plus CE ALPHA f1–f4 shortcut menus, drawn over the bottom of the
 * screen with the FRAC / FUNC / MTRX / YVAR tabs beneath. Driven by the
 * keypad (◀▶ tabs, ▲▼ items, ENTER or a number to choose, CLEAR to close),
 * the keyboard, or by tapping.
 */
export function ShortcutMenu({ tab, setTab, onClose: close, onPick: pick }: Props) {
  // once an item is chosen the menu stops taking keys, so the pasted text reaches the entry line
  const done = useRef(false);
  const onClose = () => {
    done.current = true;
    close();
  };
  const onPick = (it: ShortcutItem) => {
    done.current = true;
    pick(it);
  };
  const [cursor, setCursor] = useState(0);
  // MTRX tab: rows/cols chooser; field 0 = Row, 1 = Col, 2 = OK
  const [dim, setDim] = useState({ rows: 2, cols: 2 });
  const [field, setField] = useState<0 | 1 | 2>(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCursor(0);
    setField(0);
  }, [tab]);

  useEffect(() => {
    listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, tab]);

  const items = tab === 'mtrx' ? [] : SHORTCUT_ITEMS[tab];
  const tabIndex = SHORTCUT_TABS.findIndex((t) => t.id === tab);
  const moveTab = (d: number) => setTab(SHORTCUT_TABS[(tabIndex + d + SHORTCUT_TABS.length) % SHORTCUT_TABS.length].id);
  const pickMatrix = () => onPick({ label: 'matrix', glyph: '', insert: matrixTemplate(dim.rows, dim.cols), caret: 2 });

  // returns true when the key was used
  const key = (k: 'left' | 'right' | 'up' | 'down' | 'enter' | 'close' | string): boolean => {
    if (k === 'close') {
      onClose();
      return true;
    }
    if (tab === 'mtrx') {
      if (k === 'left') {
        if (field === 0) moveTab(-1);
        else setField((field - 1) as 0 | 1);
      } else if (k === 'right') {
        if (field === 2) moveTab(1);
        else setField((field + 1) as 1 | 2);
      } else if (k === 'up' || k === 'down') {
        const d = k === 'up' ? -1 : 1;
        if (field === 2) setField(0);
        else {
          const key = field === 0 ? 'rows' : 'cols';
          setDim((s) => ({ ...s, [key]: Math.min(MAX_DIM, Math.max(1, s[key] + d)) }));
        }
      } else if (k === 'enter') pickMatrix();
      else if (/^[1-6]$/.test(k) && field !== 2) {
        setDim((s) => ({ ...s, [field === 0 ? 'rows' : 'cols']: Number(k) }));
        setField((field + 1) as 1 | 2);
      } else return false;
      return true;
    }
    if (k === 'left') moveTab(-1);
    else if (k === 'right') moveTab(1);
    else if (k === 'up') setCursor((c) => (c - 1 + items.length) % items.length);
    else if (k === 'down') setCursor((c) => (c + 1) % items.length);
    else if (k === 'enter') onPick(items[cursor]);
    else if (/^[0-9]$/.test(k)) {
      const i = k === '0' ? 9 : Number(k) - 1;
      if (items[i]) onPick(items[i]);
    } else return false;
    return true;
  };

  // The calculator keypad drives the menu while it is open
  useKeypadHandler((a) => {
    if (done.current) return false;
    switch (a.type) {
      case 'left':
      case 'right':
      case 'enter':
        key(a.type);
        return true;
      case 'scroll':
        key(a.dir < 0 ? 'up' : 'down');
        return true;
      case 'clear':
      case 'quit':
        key('close');
        return true;
      case 'insert':
        key(a.text);
        return true;
      default:
        return true;
    }
  });

  // …and so does the computer keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'enter', Escape: 'close' };
      const k = map[e.key] ?? (/^[0-9]$/.test(e.key) ? e.key : null);
      if (!k || done.current) return;
      e.preventDefault();
      e.stopPropagation();
      keyRef.current(k);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const keyRef = useRef(key);
  keyRef.current = key;

  const host = document.querySelector('.screen-frame') ?? document.body;
  return createPortal(
    <div className="fmenu-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fmenu" role="dialog" aria-label={`${SHORTCUT_TABS[tabIndex].label} shortcut menu`}>
        {tab === 'mtrx' ? (
          <div className="fmenu-matrix">
            <div className="fmenu-dims">
              {(['rows', 'cols'] as const).map((k, fi) => (
                <div key={k} className="fmenu-dim-col">
                  <div className="fmenu-dim-head">{k === 'rows' ? 'Row' : 'Col'}</div>
                  {Array.from({ length: MAX_DIM }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`fmenu-dim${dim[k] === n ? ' sel' : ''}${dim[k] === n && field === fi ? ' on' : ''}`}
                      aria-pressed={dim[k] === n}
                      aria-label={`${n} ${k}`}
                      onClick={() => {
                        setDim((s) => ({ ...s, [k]: n }));
                        setField(fi as 0 | 1);
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button type="button" className={`fmenu-ok${field === 2 ? ' on' : ''}`} onClick={pickMatrix}>
              OK
            </button>
          </div>
        ) : (
          <div className={`fmenu-list${tab === 'yvar' ? ' two-col' : ''}`} ref={listRef} role="menu">
            {items.map((it, i) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={`fmenu-item${i === cursor ? ' on' : ''}`}
                onPointerEnter={() => setCursor(i)}
                onClick={() => onPick(it)}
              >
                <span className="fmenu-num">{i === 9 ? 0 : i + 1}:</span>
                <span className="fmenu-label">{it.label}</span>
                {it.glyph && <span className="fmenu-glyph">{it.glyph}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="fmenu-tabs" role="tablist">
        {SHORTCUT_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''} title={`ALPHA f${t.fkey}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>,
    host,
  );
}
