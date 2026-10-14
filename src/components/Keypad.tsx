import { memo, useState } from 'react';
import { ARROWS, KEYS, MATH_MENU, SHORTCUT_TABS, type KeyAction, type KeyDef, type KeyFace, type MenuId, type ShortcutItem, type ShortcutTabId } from './keypad';
import { ShortcutMenu } from './ShortcutMenu';
import { Dialog } from './ui';
import { PROGRAM_NAME_RE } from '../math/program';
import { MODE_VARIABLE } from '../graph/modes';
import { formatNumber } from '../math/format';
import { fromStored, LIST_NAMES, useStore } from '../state/store';

interface Props {
  onAction: (action: KeyAction, face: KeyFace) => void;
}

type AlphaState = 'off' | 'once' | 'lock';

/** TI-84 Plus CE style keypad: every key and its 2nd/ALPHA labels are always visible. */
export const Keypad = memo(function Keypad({ onAction }: Props) {
  const [second, setSecond] = useState(false);
  const [alpha, setAlpha] = useState<AlphaState>('off');
  const [menu, setMenu] = useState<null | { id: MenuId; tab?: string }>(null);
  const [wizard, setWizard] = useState<string | null>(null);
  const [fTab, setFTab] = useState<ShortcutTabId>('frac');

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
    if (a.type === 'nav') setMenu(null);
    if (a.type === 'menu') {
      setMenu({ id: a.menu, tab: a.tab });
      return;
    }
    onAction(a, face);
  };

  const press = (k: KeyDef) => {
    // ALPHA + Y=/WINDOW/ZOOM/TRACE/GRAPH = f1–f5: the FRAC, FUNC, MTRX and YVAR shortcut menus
    if (alpha !== 'off' && k.fkey && !second) {
      if (alpha === 'once') setAlpha('off');
      const t = SHORTCUT_TABS.find((s) => s.fkey === k.fkey);
      if (t) setFTab(t.id);
      setMenu({ id: 'fmenu' });
      return;
    }
    if (alpha !== 'off' && k.alpha && !second) {
      if (alpha === 'once') setAlpha('off');
      onAction({ type: 'insert', text: k.alpha }, { label: k.alpha, action: { type: 'none' }, title: k.alpha });
      return;
    }
    if (alpha === 'once' && k.id !== 'alpha') setAlpha('off');
    // X,T,θ,n types the independent variable of the current graph mode
    if (k.id === 'xt' && !second) {
      const v = MODE_VARIABLE[useStore.getState().settings.graphMode];
      onAction({ type: 'insert', text: v }, { label: v, action: { type: 'none' }, title: v });
      return;
    }
    run(second && k.second ? k.second.action : k.action, second && k.second ? k.second : k);
  };

  const insert = (text: string) => {
    setMenu(null);
    const tmpl = text === '()/()';
    onAction({ type: 'insert', text, wrap: text.endsWith('(') && !tmpl, caret: tmpl ? 1 : undefined }, { label: text, action: { type: 'none' }, title: text });
  };

  const renderKey = (k: KeyDef) => {
    const showSecond = second && !!k.second;
    const alphaLabel = k.alpha ?? (k.fkey ? `f${k.fkey}` : undefined);
    const showAlpha = alpha !== 'off' && !!alphaLabel && !second;
    const main = showSecond ? k.second!.label : showAlpha ? alphaLabel! : k.label;
    const fTitle = k.fkey ? `f${k.fkey}: ${SHORTCUT_TABS.find((s) => s.fkey === k.fkey)?.label ?? 'shortcut'} menu` : '';
    const title = showSecond ? k.second!.title : showAlpha ? (k.alpha ? `Letter ${k.alpha}` : fTitle) : k.title;
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
        {(k.second || alphaLabel) && (
          <span className="key-labels" aria-hidden="true">
            <span className="lbl-2nd">{k.second?.label ?? ''}</span>
            <span className={`lbl-alpha${k.fkey ? ' lbl-f' : ''}`}>{alphaLabel ?? ''}</span>
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
      </div>
      {menu?.id === 'math' && (
        <MathMenu
          initialTab={menu.tab}
          onClose={() => setMenu(null)}
          onPick={(text) => {
            // STAT WIZARDS (MODE): fill in the arguments in a form, then paste
            if (useStore.getState().settings.statWizards && WIZARDS[text]) {
              setMenu(null);
              setWizard(text);
            }
            else insert(text);
          }}
        />
      )}
      {wizard && (
        <Wizard
          name={wizard}
          onClose={() => setWizard(null)}
          onPaste={(text) => {
            setWizard(null);
            setMenu(null);
            onAction({ type: 'insert', text }, { label: text, action: { type: 'none' }, title: text });
          }}
        />
      )}
      {menu?.id === 'fmenu' && (
        <ShortcutMenu
          tab={fTab}
          setTab={setFTab}
          onClose={() => setMenu(null)}
          onPick={(it: ShortcutItem) => {
            setMenu(null);
            if (it.wizard && useStore.getState().settings.statWizards && WIZARDS[it.wizard]) {
              setWizard(it.wizard);
              return;
            }
            const wrap = it.insert.endsWith('(') && it.caret === undefined;
            onAction({ type: 'insert', text: it.insert, wrap, caret: it.caret }, { label: it.label, action: { type: 'none' }, title: it.label });
          }}
        />
      )}
      {menu?.id === 'vars' && <VarsMenu onClose={() => setMenu(null)} onPick={insert} />}
      {menu?.id === 'prgm' && <PrgmMenu onClose={() => setMenu(null)} onExec={(name) => insert(`prgm${name}`)} />}
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

const APPS: Array<{ label: string; description: string; action: KeyAction }> = [
  { label: 'Y= editor', description: 'Enter the functions to graph', action: { type: 'nav', view: 'yeq' } },
  { label: 'Graph', description: 'Show the graph', action: { type: 'nav', view: 'graph', intent: 'graph' } },
  { label: 'Table', description: 'X/Y table of values', action: { type: 'nav', view: 'table' } },
  { label: 'Statistics', description: 'Lists, 1-Var/2-Var stats, regression, distributions', action: { type: 'nav', view: 'stats' } },
  { label: 'Solver', description: 'Equations, quadratics and 2×2 systems with steps', action: { type: 'nav', view: 'solver' } },
  { label: 'Programs', description: 'Write and edit TI-BASIC-style programs', action: { type: 'nav', view: 'programs' } },
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

/** TI-style PRGM menu: EXEC pastes prgmNAME, EDIT opens the editor, NEW creates a program. */
function PrgmMenu({ onClose, onExec }: { onClose: () => void; onExec: (name: string) => void }) {
  const programs = useStore((s) => s.programs);
  const openProgram = useStore((s) => s.openProgram);
  const addProgram = useStore((s) => s.addProgram);
  const setView = useStore((s) => s.setView);
  const [tab, setTab] = useState<'exec' | 'edit' | 'new'>('exec');
  const [name, setName] = useState('');
  const upper = name.toUpperCase();
  const nameError = !upper
    ? null
    : !PROGRAM_NAME_RE.test(upper)
      ? 'Up to 8 letters/digits, starting with a letter'
      : programs.some((p) => p.name === upper)
        ? 'A program with this name already exists'
        : null;
  const create = () => {
    if (!upper || nameError) return;
    addProgram(upper);
    setView('programs');
    onClose();
  };
  const sorted = [...programs].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Dialog title="Programs" onClose={onClose}>
      <div className="tabs" role="tablist" style={{ padding: '0 0 12px' }}>
        {(['exec', 'edit', 'new'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      {tab !== 'new' &&
        (sorted.length ? (
          <div className="menu-grid">
            {sorted.map((p) => (
              <button
                key={p.id}
                className="menu-item"
                onClick={() => {
                  if (tab === 'exec') onExec(p.name);
                  else {
                    openProgram(p.id);
                    onClose();
                  }
                }}
              >
                <b>{p.name}</b>
                <small>{p.source.split('\n').length} lines</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">No programs yet — use NEW.</p>
        ))}
      {tab === 'exec' && sorted.length > 0 && <p className="muted small">Choosing a program pastes prgmNAME; press ENTER to run it.</p>}
      {tab === 'new' && (
        <div className="stack">
          <label className="field">
            <span>Program name</span>
            <input
              className={`input${nameError ? ' invalid' : ''}`}
              value={name}
              maxLength={8}
              autoCapitalize="characters"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="e.g. AREA"
            />
          </label>
          {nameError && <div className="error-text">{nameError}</div>}
          <div>
            <button className="btn primary" disabled={!upper || !!nameError} onClick={create}>
              Create &amp; edit
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* STAT WIZARDS: argument forms for distribution and calculus functions        */
/* ------------------------------------------------------------------------ */

type WizardField = { label: string; value?: string };
const WIZARDS: Record<string, { title: string; fields: WizardField[]; paste?: string }> = {
  'Σ(': { title: 'Σ summation', paste: 'sum(', fields: [{ label: 'expression' }, { label: 'variable', value: 'K' }, { label: 'start' }, { label: 'end' }] },
  'logBASE(': { title: 'logBASE', fields: [{ label: 'value' }, { label: 'base' }] },
  'root(': { title: 'ˣ√ root', fields: [{ label: 'radicand' }, { label: 'index x' }] },
  'mixed(': { title: 'Un/d mixed number', fields: [{ label: 'whole number U' }, { label: 'numerator n' }, { label: 'denominator d' }] },
  'normalpdf(': { title: 'normalpdf', fields: [{ label: 'x value' }, { label: 'μ', value: '0' }, { label: 'σ', value: '1' }] },
  'normalcdf(': { title: 'normalcdf', fields: [{ label: 'lower' }, { label: 'upper' }, { label: 'μ', value: '0' }, { label: 'σ', value: '1' }] },
  'invNorm(': { title: 'invNorm', fields: [{ label: 'area' }, { label: 'μ', value: '0' }, { label: 'σ', value: '1' }] },
  'binompdf(': { title: 'binompdf', fields: [{ label: 'trials' }, { label: 'p' }, { label: 'x value' }] },
  'binomcdf(': { title: 'binomcdf', fields: [{ label: 'trials' }, { label: 'p' }, { label: 'x value' }] },
  'poissonpdf(': { title: 'poissonpdf', fields: [{ label: 'μ' }, { label: 'x value' }] },
  'poissoncdf(': { title: 'poissoncdf', fields: [{ label: 'μ' }, { label: 'x value' }] },
  'nDeriv(': { title: 'nDeriv', fields: [{ label: 'expression' }, { label: 'variable', value: 'x' }, { label: 'at value' }] },
  'fnInt(': { title: 'fnInt', fields: [{ label: 'expression' }, { label: 'variable', value: 'x' }, { label: 'lower' }, { label: 'upper' }] },
  'randInt(': { title: 'randInt', fields: [{ label: 'lower' }, { label: 'upper' }] },
};

function Wizard({ name, onClose, onPaste }: { name: string; onClose: () => void; onPaste: (text: string) => void }) {
  const spec = WIZARDS[name];
  const [values, setValues] = useState(() => spec.fields.map((f) => f.value ?? ''));
  const missing = values.some((v) => !v.trim());
  const paste = () => {
    if (!missing) onPaste(`${spec.paste ?? name}${values.map((v) => v.trim()).join(',')})`);
  };
  return (
    <Dialog
      title={spec.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={missing} onClick={paste}>
            Paste
          </button>
        </>
      }
    >
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {spec.fields.map((f, i) => (
          <label key={f.label} className="field">
            <span>{f.label}</span>
            <input
              className="input"
              value={values[i]}
              autoFocus={i === 0}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => e.key === 'Enter' && paste()}
            />
          </label>
        ))}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        STAT WIZARDS are on (MODE screen). Turn them off to paste the bare function instead.
      </p>
    </Dialog>
  );
}
