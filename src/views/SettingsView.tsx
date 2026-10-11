import type { ReactNode } from 'react';
import { toast } from '../components/ui';
import { useStore, type ThemePref } from '../state/store';

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <div style={{ fontWeight: 560 }}>{title}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['Enter', 'Evaluate the expression (on an empty line: repeat the last entry)'],
  ['↑ / ↓', 'Scroll through the calculator screen; Enter pastes the highlighted line (PgUp/PgDn jump)'],
  ['Esc', 'Clear the entry line'],
  ['+ − * / ^', 'On an empty line, continue from the previous answer (Ans)'],
  ['->', 'Typed as →, store: 5->A'],
  ['Alt + 1…7', 'Switch section (Calculate, Table, Stats, Solver, Programs, History, Settings); Y= and GRAPH are on the keypad'],
  ['Esc (running program)', 'Break the program'],
  ['Ctrl/⌘ + Z', 'Undo function edits (Graph); Ctrl/⌘ + Shift + Z or Ctrl + Y to redo'],
  ['Graph: arrows', 'Pan the graph; with trace on, move along the curve (↑/↓ switch curves)'],
  ['Graph: + / −', 'Zoom in / out'],
  ['Graph: Enter / Esc', 'Start / stop tracing'],
];

export function SettingsView() {
  const s = useStore((st) => st.settings);
  const update = useStore((st) => st.updateSettings);
  const resetAll = useStore((st) => st.resetAll);

  return (
    <div className="page">
      <div className="page-grid">
        <section className="card">
          <div className="card-head">
            <h2>Appearance</h2>
          </div>
          <div className="card-body">
            <Row title="Theme">
              <div className="segmented" role="group" aria-label="Theme">
                {(['dark', 'light', 'system'] as ThemePref[]).map((t) => (
                  <button key={t} aria-pressed={s.theme === t} onClick={() => update({ theme: t })}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Graph line width">
              <input type="range" min={1} max={5} step={0.5} value={s.lineWidth} aria-label="Graph line width" onChange={(e) => update({ lineWidth: Number(e.target.value) })} />
            </Row>
            <Row title="Grid lines">
              <Switch label="Grid lines" on={s.showGrid} onChange={(v) => update({ showGrid: v })} />
            </Row>
            <Row title="Axes">
              <Switch label="Axes" on={s.showAxes} onChange={(v) => update({ showAxes: v })} />
            </Row>
            <Row title="Coordinate labels">
              <Switch label="Coordinate labels" on={s.showLabels} onChange={(v) => update({ showLabels: v })} />
            </Row>
            <Row title="On-screen keypad only (touch devices)" desc="Use the calculator keypad instead of the phone's keyboard in the calculator and math fields. Turn off to type with the phone keyboard.">
              <Switch label="On-screen keypad only" on={s.keypadOnly} onChange={(v) => update({ keypadOnly: v })} />
            </Row>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Math</h2>
          </div>
          <div className="card-body">
            <Row title="Angle mode" desc="Applies to trig functions in calculations, graphs, tables and the solver.">
              <div className="segmented" role="group" aria-label="Angle mode">
                <button aria-pressed={s.angle === 'rad'} onClick={() => update({ angle: 'rad' })}>
                  Radians
                </button>
                <button aria-pressed={s.angle === 'deg'} onClick={() => update({ angle: 'deg' })}>
                  Degrees
                </button>
              </div>
            </Row>
            <Row title="Number display" desc="Float shows significant digits; Fix shows a fixed number of decimal places.">
              <div className="segmented" role="group" aria-label="Number display">
                <button aria-pressed={s.format.mode === 'float'} onClick={() => update({ format: { ...s.format, mode: 'float', digits: Math.max(s.format.digits, 1) } })}>
                  Float
                </button>
                <button aria-pressed={s.format.mode === 'fix'} onClick={() => update({ format: { ...s.format, mode: 'fix', digits: Math.min(s.format.digits, 9) } })}>
                  Fix
                </button>
              </div>
            </Row>
            <Row title={s.format.mode === 'float' ? 'Significant digits' : 'Decimal places'}>
              <select
                className="input"
                style={{ width: 90 }}
                value={s.format.digits}
                onChange={(e) => update({ format: { ...s.format, digits: Number(e.target.value) } })}
                aria-label="Digits"
              >
                {(s.format.mode === 'float' ? [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Row>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Keyboard shortcuts</h2>
          </div>
          <div className="card-body">
            <div className="shortcut-list">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <span className="kbd">{k}</span>
                  <span className="muted">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Your data</h2>
          </div>
          <div className="card-body stack">
            <p className="muted small" style={{ margin: 0 }}>
              Everything — history, variables, functions, saved graphs, lists and settings — is stored only in this browser (localStorage). There is no
              account and nothing is sent to a server.
            </p>
            <div>
              <button
                className="btn danger"
                onClick={() => {
                  if (confirm('Erase all calculator data on this device? This cannot be undone.')) {
                    resetAll();
                    toast('All data cleared');
                  }
                }}
              >
                Clear all calculator data
              </button>
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Lumen v1.0 · Math engine: custom parser with exact rational arithmetic and numerical analysis · Rendering: KaTeX &amp; Canvas.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
