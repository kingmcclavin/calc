import { useMemo, useState } from 'react';
import { NumberField } from '../components/ui';
import { focusedField, useKeypadHandler } from '../components/DeviceKeypad';
import { formatNumber } from '../math/format';
import { useNumberEvaluator, useParsedFunctions } from '../state/context';
import { useStore } from '../state/store';

const PAGE = 40;

export function TableView() {
  const { parsed } = useParsedFunctions();
  const start = useStore((s) => s.tableStart);
  const step = useStore((s) => s.tableStep);
  const setTable = useStore((s) => s.setTable);
  const requestTrace = useStore((s) => s.requestTrace);
  const setView = useStore((s) => s.setView);
  const fmt = useStore((s) => s.settings.format);
  const ev = useNumberEvaluator();
  const [rows, setRows] = useState(PAGE);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [askX, setAskX] = useState('');

  // ▲/▼ on the keypad scroll the table one step, like the TI-84 TABLE screen
  useKeypadHandler((a) => {
    if (a.type !== 'scroll' || focusedField()) return false;
    setTable(start + a.dir * step * (a.page ? 6 : 1), step);
    return true;
  });

  const usable = parsed.filter((p) => p.fn.expr.trim());
  const cols = usable.filter((p) => !hidden.has(p.fn.id));

  const xs = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rows; i++) out.push(Number((start + i * step).toPrecision(12)));
    return out;
  }, [start, step, rows]);

  const askValue = askX.trim() ? ev(askX) : null;

  const cell = (f: ((x: number) => number) | null, x: number) => {
    if (!f) return { text: 'error', undef: true };
    const y = f(x);
    return Number.isFinite(y) ? { text: formatNumber(y, fmt), undef: false } : { text: 'undefined', undef: true };
  };

  if (!usable.length) {
    return (
      <div className="page">
        <div className="card empty">
          <p>No functions yet. Enter functions in the Graph view to build a table.</p>
          <button className="btn primary" onClick={() => setView('graph')}>
            Go to Graph
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card-body stack">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            <NumberField label="Start x (TblStart)" value={start} evaluate={ev} onCommit={(v) => setTable(v, step)} />
            <NumberField label="Step (ΔTbl)" value={step} evaluate={ev} onCommit={(v) => setTable(start, v)} validate={(v) => (v === 0 ? 'Step cannot be 0' : null)} />
            <label className="field">
              <span>Evaluate at x</span>
              <input className="input" value={askX} placeholder="e.g. 2.5 or π/4" onChange={(e) => setAskX(e.target.value)} />
            </label>
          </div>
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Columns">
            <span className="label">Columns</span>
            {usable.map((p) => {
              const on = !hidden.has(p.fn.id);
              return (
                <button
                  key={p.fn.id}
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  style={on ? { color: p.fn.color, background: `color-mix(in srgb, ${p.fn.color} 16%, transparent)` } : undefined}
                  onClick={() => {
                    const next = new Set(hidden);
                    if (on) next.add(p.fn.id);
                    else next.delete(p.fn.id);
                    setHidden(next);
                  }}
                >
                  Y{p.index + 1}
                </button>
              );
            })}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Tip: tap any value to see that point on the graph.
          </p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">x</th>
                {cols.map((p) => (
                  <th key={p.fn.id} scope="col" style={{ color: p.fn.color }} title={p.fn.expr}>
                    Y{p.index + 1}
                    {p.error && ' ⚠'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {askValue !== null && Number.isFinite(askValue) && (
                <tr style={{ background: 'var(--accent-soft)' }}>
                  <td>{formatNumber(askValue, fmt)}</td>
                  {cols.map((p) => {
                    const c = cell(p.f, askValue);
                    return (
                      <td key={p.fn.id} className={`clickable${c.undef ? ' undef' : ''}`} onClick={() => p.f && requestTrace(p.fn.id, askValue)}>
                        {c.text}
                      </td>
                    );
                  })}
                </tr>
              )}
              {xs.map((x) => (
                <tr key={x}>
                  <td>{formatNumber(x, fmt)}</td>
                  {cols.map((p) => {
                    const c = cell(p.f, x);
                    return (
                      <td
                        key={p.fn.id}
                        className={`clickable${c.undef ? ' undef' : ''}`}
                        tabIndex={0}
                        onClick={() => p.f && requestTrace(p.fn.id, x)}
                        onKeyDown={(e) => e.key === 'Enter' && p.f && requestTrace(p.fn.id, x)}
                        title={`Show (${formatNumber(x, fmt)}, ${c.text}) on the graph`}
                      >
                        {c.text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ padding: 10, justifyContent: 'center', borderTop: '1px solid var(--border)' }}>
          <button className="btn sm" onClick={() => setTable(start - step * PAGE, step)}>
            ↑ Earlier
          </button>
          <button className="btn sm" onClick={() => setRows((r) => Math.min(r + PAGE, 1000))}>
            Show more rows
          </button>
        </div>
      </div>
    </div>
  );
}
