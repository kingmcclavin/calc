import { memo, useState } from 'react';
import { KEYS, MATH_MENU, type KeyAction, type KeyFace } from './keypad';
import { Dialog } from './ui';
import { formatNumber } from '../math/format';
import { fromStored, LIST_NAMES, useStore } from '../state/store';

interface Props {
  onAction: (action: KeyAction, face: KeyFace) => void;
  /** Hide keys that make no sense for the current target */
  compact?: boolean;
}

export const Keypad = memo(function Keypad({ onAction }: Props) {
  const [second, setSecond] = useState(false);
  const angle = useStore((s) => s.settings.angle);
  const updateSettings = useStore((s) => s.updateSettings);
  const [menu, setMenu] = useState<null | 'math' | 'vars'>(null);

  const press = (face: KeyFace) => {
    const a = face.action;
    if (a.type === 'second') {
      setSecond((s) => !s);
      return;
    }
    setSecond(false);
    if (a.type === 'angle') {
      updateSettings({ angle: angle === 'rad' ? 'deg' : 'rad' });
      return;
    }
    if (a.type === 'menu') {
      setMenu(a.menu);
      return;
    }
    onAction(a, face);
  };

  const insert = (text: string) => {
    setMenu(null);
    onAction({ type: 'insert', text, wrap: text.endsWith('(') }, { label: text, action: { type: 'none' }, title: text });
  };

  return (
    <>
      <div className={`keypad${second ? ' second-on' : ''}`} role="group" aria-label="Calculator keypad">
        {KEYS.map((k) => {
          const face = second && k.second ? k.second : k;
          const label = k.id === 'mode' ? (angle === 'rad' ? 'RAD' : 'DEG') : face.label;
          return (
            <button
              key={k.id}
              type="button"
              className={`key key-${k.variant}${k.id === 'enter' ? ' key-enter' : ''}${second && k.second ? ' showing-second' : ''}`}
              data-key={k.id}
              title={k.id === 'mode' ? `Angle mode: ${angle === 'rad' ? 'radians' : 'degrees'} (tap to switch)` : face.title}
              aria-label={face === k ? k.ariaLabel ?? face.title : face.title}
              aria-pressed={k.id === '2nd' ? second : undefined}
              // keep focus in the entry line
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => press(face)}
            >
              {k.second && <span className="key-second" aria-hidden="true">{k.second.label}</span>}
              <span className="key-main">{label}</span>
            </button>
          );
        })}
      </div>
      {menu === 'math' && <MathMenu onClose={() => setMenu(null)} onPick={insert} />}
      {menu === 'vars' && <VarsMenu onClose={() => setMenu(null)} onPick={insert} />}
    </>
  );
});

export function MathMenu({ onClose, onPick }: { onClose: () => void; onPick: (s: string) => void }) {
  const [tab, setTab] = useState(MATH_MENU[0].id);
  const current = MATH_MENU.find((t) => t.id === tab)!;
  return (
    <Dialog title="Math functions" onClose={onClose}>
      <div className="tabs" role="tablist" style={{ padding: '0 0 12px' }}>
        {MATH_MENU.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === tab} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="menu-grid">
        {current.items.map((it) => (
          <button key={it.label} className="menu-item" onClick={() => onPick(it.insert)} title={it.description}>
            <b>{it.label}</b>
            <small>{it.description}</small>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function VarsMenu({ onClose, onPick }: { onClose: () => void; onPick: (s: string) => void }) {
  const vars = useStore((s) => s.vars);
  const functions = useStore((s) => s.functions);
  const lists = useStore((s) => s.lists);
  const fmt = useStore((s) => s.settings.format);
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'θ'];
  return (
    <Dialog title="Variables" onClose={onClose}>
      <div className="stack">
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Answer &amp; graph variable</div>
          <div className="menu-grid">
            <button className="menu-item" onClick={() => onPick('Ans')}>
              <b>Ans</b>
              <small>{vars.Ans ? formatNumber(fromStored(vars.Ans).n, fmt) : 'No answer yet'}</small>
            </button>
            <button className="menu-item" onClick={() => onPick('x')}>
              <b>x</b>
              <small>{vars.x ? formatNumber(fromStored(vars.x).n, fmt) : 'Graph variable'}</small>
            </button>
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Graph functions</div>
          <div className="menu-grid">
            {functions.map((f, i) => (
              <button key={f.id} className="menu-item" onClick={() => onPick(`Y${i + 1}(`)}>
                <b style={{ color: f.color }}>Y{i + 1}</b>
                <small>{f.expr || 'empty'}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Lists (edit in Statistics)</div>
          <div className="menu-grid">
            {LIST_NAMES.map((l) => (
              <button key={l} className="menu-item" onClick={() => onPick(l)}>
                <b>{l}</b>
                <small>{lists[l].length ? `${lists[l].length} values` : 'empty'}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Stored variables — store with STO→ (e.g. 5→A)</div>
          <div className="menu-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))' }}>
            {letters.map((l) => (
              <button key={l} className="menu-item" onClick={() => onPick(l)}>
                <b>{l}</b>
                <small>{vars[l] ? formatNumber(fromStored(vars[l]).n, fmt) : '—'}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
