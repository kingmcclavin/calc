import { memo, useState } from 'react';
import { ARROWS, KEYS, MATH_MENU, type KeyAction, type KeyDef, type KeyFace, type MenuId } from './keypad';
import { Dialog } from './ui';
import { formatNumber } from '../math/format';
import { fromStored, LIST_NAMES, useStore, type ThemePref } from '../state/store';

interface Props {
  onAction: (action: KeyAction, face: KeyFace) => void;
}

type AlphaState = 'off' | 'once' | 'lock';

/** TI-84 Plus CE style keypad: every key and its 2nd/ALPHA labels are always visible. */
export const Keypad = memo(function Keypad({ onAction }: Props) {
  const [second, setSecond] = useState(false);
  const [alpha, setAlpha] = useState<AlphaState>('off');
  const angle = useStore((s) => s.settings.angle);
  const [menu, setMenu] = useState<null | { id: MenuId; tab?: string }>(null);

  const run = (a: KeyAction, face: KeyFace) => {
    if (a.type === 'second') {
      setSecond((v) => !v);
      return;
    }
    if (a.type === 'alpha') {
      setSecond(false);
      setAlpha((v) => (v === 'off' ? 'once' : 'off'));
      return;
    }
    if (a.type === 'alphaLock') {
      setSecond(false);
      setAlpha('lock');
      return;
    }
    setSecond(false);
    if (a.type === 'menu') {
      setMenu({ id: a.menu, tab: a.tab });
      return;
    }
    onAction(a, face);
  };

  const press = (k: KeyDef) => {
    if (alpha !== 'off' && k.alpha && !second) {
      if (alpha === 'once') setAlpha('off');
      onAction({ type: 'insert', text: k.alpha }, { label: k.alpha, action: { type: 'none' }, title: k.alpha });
      return;
    }
    if (alpha === 'once' && k.id !== 'alpha') setAlpha('off');
    run(second && k.second ? k.second.action : k.action, second && k.second ? k.second : k);
  };

  const insert = (text: string) => {
    setMenu(null);
    const tmpl = text === '()/()';
    onAction({ type: 'insert', text, wrap: text.endsWith('(') && !tmpl, caret: tmpl ? 1 : undefined }, { label: text, action: { type: 'none' }, title: text });
  };

  const renderKey = (k: KeyDef) => {
    const showSecond = second && !!k.second;
    const showAlpha = alpha !== 'off' && !!k.alpha && !second;
    const main = showSecond ? k.second!.label : showAlpha ? k.alpha! : k.label;
    const title = showSecond ? k.second!.title : showAlpha ? `Letter ${k.alpha}` : k.title;
    return (
      <button
        key={k.id}
        type="button"
        className={`key key-${k.variant}${showSecond ? ' showing-second' : ''}${showAlpha ? ' showing-alpha' : ''}`}
        data-key={k.id}
        title={title}
        aria-label={showSecond || showAlpha ? title : k.ariaLabel ?? k.title}
        aria-pressed={k.id === '2nd' ? second : k.id === 'alpha' ? alpha !== 'off' : undefined}
        // keep focus in the entry line
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => press(k)}
      >
        {(k.second || k.alpha) && (
          <span className="key-labels" aria-hidden="true">
            <span className="lbl-2nd">{k.second?.label ?? ''}</span>
            <span className="lbl-alpha">{k.alpha ?? ''}</span>
          </span>
        )}
        <span className="key-main">{main}</span>
      </button>
    );
  };

  return (
    <>
      <div className={`keypad ti${second ? ' second-on' : ''}${alpha !== 'off' ? ' alpha-on' : ''}`} role="group" aria-label="Calculator keypad">
        <div className="dpad" role="group" aria-label="Arrow keys">
          {ARROWS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`dpad-btn dpad-${a.id}`}
              data-key={a.id}
              title={a.title}
              aria-label={a.title}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                const act = second ? a.second : a.action;
                setSecond(false);
                onAction(act, { label: a.label, action: act, title: a.title });
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        {KEYS.map(renderKey)}
      </div>
      <div className="keypad-status" aria-live="polite">
        {second && <span className="ind ind-2nd">2nd</span>}
        {alpha !== 'off' && <span className="ind ind-alpha">{alpha === 'lock' ? 'A-LOCK' : 'ALPHA'}</span>}
        <span className="ind">{angle === 'rad' ? 'RADIAN' : 'DEGREE'}</span>
      </div>
      {menu?.id === 'math' && <MathMenu initialTab={menu.tab} onClose={() => setMenu(null)} onPick={insert} />}
      {menu?.id === 'vars' && <VarsMenu onClose={() => setMenu(null)} onPick={insert} />}
      {menu?.id === 'mode' && <ModeMenu onClose={() => setMenu(null)} />}
      {menu?.id === 'apps' && (
        <AppsMenu
          onClose={() => setMenu(null)}
          onPick={(a) => {
            setMenu(null);
            onAction(a, { label: '', action: a, title: '' });
          }}
        />
      )}
    </>
  );
});

export function MathMenu({ onClose, onPick, initialTab }: { onClose: () => void; onPick: (s: string) => void; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab ?? MATH_MENU[0].id);
  const current = MATH_MENU.find((t) => t.id === tab) ?? MATH_MENU[0];
  return (
    <Dialog title="Math functions" onClose={onClose}>
      <div className="tabs" role="tablist" style={{ padding: '0 0 12px' }}>
        {MATH_MENU.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === current.id} onClick={() => setTab(t.id)}>
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

function ModeMenu({ onClose }: { onClose: () => void }) {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const row = (label: string, children: React.ReactNode) => (
    <div className="setting-row">
      <div style={{ fontWeight: 560 }}>{label}</div>
      {children}
    </div>
  );
  return (
    <Dialog title="Mode" onClose={onClose}>
      {row(
        'Angle',
        <div className="segmented" role="group" aria-label="Angle mode">
          <button aria-pressed={s.angle === 'rad'} onClick={() => update({ angle: 'rad' })}>
            RADIAN
          </button>
          <button aria-pressed={s.angle === 'deg'} onClick={() => update({ angle: 'deg' })}>
            DEGREE
          </button>
        </div>,
      )}
      {row(
        'Numbers',
        <div className="segmented" role="group" aria-label="Number display">
          <button aria-pressed={s.format.mode === 'float'} onClick={() => update({ format: { mode: 'float', digits: 10 } })}>
            FLOAT
          </button>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button key={d} aria-pressed={s.format.mode === 'fix' && s.format.digits === d} onClick={() => update({ format: { mode: 'fix', digits: d } })}>
              {d}
            </button>
          ))}
        </div>,
      )}
      {row(
        'Theme',
        <div className="segmented" role="group" aria-label="Theme">
          {(['dark', 'light', 'system'] as ThemePref[]).map((t) => (
            <button key={t} aria-pressed={s.theme === t} onClick={() => update({ theme: t })}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>,
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>More options (significant digits, graph display) are in Settings.</p>
    </Dialog>
  );
}

const APPS: Array<{ label: string; description: string; action: KeyAction }> = [
  { label: 'Graph', description: 'Y= editor and interactive graph', action: { type: 'nav', view: 'graph', intent: 'graph' } },
  { label: 'Table', description: 'X/Y table of values', action: { type: 'nav', view: 'table' } },
  { label: 'Statistics', description: 'Lists, 1-Var/2-Var stats, regression, distributions', action: { type: 'nav', view: 'stats' } },
  { label: 'Solver', description: 'Equations, quadratics and 2×2 systems with steps', action: { type: 'nav', view: 'solver' } },
  { label: 'History', description: 'Past calculations and saved graphs', action: { type: 'nav', view: 'history' } },
  { label: 'Settings', description: 'Appearance, precision and data', action: { type: 'nav', view: 'settings' } },
];

function AppsMenu({ onClose, onPick }: { onClose: () => void; onPick: (a: KeyAction) => void }) {
  return (
    <Dialog title="Apps" onClose={onClose}>
      <div className="menu-grid">
        {APPS.map((a) => (
          <button key={a.label} className="menu-item" onClick={() => onPick(a.action)}>
            <b style={{ fontFamily: 'var(--font-sans)' }}>{a.label}</b>
            <small>{a.description}</small>
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
