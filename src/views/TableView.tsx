import { useMemo, useState } from 'react';
import { NumberField } from '../components/ui';
import { activeField, useKeypadHandler } from '../components/DeviceKeypad';
import { formatNumber } from '../math/format';
import { compileMode, evaluateSequences, modeLabels, modeWindow, SEQ_NAMES } from '../graph/modes';
import { useNumberEvaluator, useParsedFunctions } from '../state/context';
import { useStore } from '../state/store';

const PAGE = 40;

/** One table column: belongs to a graph entry (fnId) and maps the table's first column to a value. */
interface Column {
  key: string;
  fnId: string;
  label: string;
  color: string;
  title: string;
  error?: string | null;
  value: ((s: number) => number) | null;
}

export function TableView() {
  const { ctx, parsed } = useParsedFunctions();
  const start = useStore((s) => s.tableStart);
  const step = useStore((s) => s.tableStep);
  const setTable = useStore((s) => s.setTable);
  const requestTrace = useStore((s) => s.requestTrace);
  const navigate = useStore((s) => s.navigate);
  const fmt = useStore((s) => s.settings.format);
  const graphMode = useStore((s) => s.settings.graphMode);
  const modeFns = useStore((s) => s.modeFns);
  const graphWindow = useStore((s) => s.window);
  const ev = useNumberEvaluator();
  const [rows, setRows] = useState(PAGE);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [askX, setAskX] = useState('');

  // ▲/▼ on the keypad scroll the table one step, like the TI-84 TABLE screen
  useKeypadHandler((a) => {
    if (a.type !== 'scroll' || activeField()) return false;
    setTable(start + a.dir * step * (a.page ? 6 : 1), step);
    return true;
  });

  const seq = graphMode === 'seq';
  const indep = graphMode === 'func' ? 'x' : graphMode === 'par' ? 'T' : graphMode === 'pol' ? 'θ' : 'n';

  const xs = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < rows; i++) {
      const v = Number((start + i * step).toPrecision(12));
      out.push(seq ? Math.round(v) : v);
    }
    return out;
  }, [start, step, rows, seq]);

  const columns: Column[] = useMemo(() => {
    if (graphMode === 'func') {
      return parsed
        .filter((p) => p.fn.expr.trim())
        .map((p) => ({ key: p.fn.id, fnId: p.fn.id, label: `Y${p.index + 1}`, color: p.fn.color, title: p.fn.expr, error: p.error, value: p.f }));
    }
    const fns = modeFns[graphMode];
    if (graphMode === 'seq') {
      // compute terms from nMin up to the last row
      const nMin = modeWindow(graphWindow, ctx.angle === 'deg').nMin;
      const last = Math.max(...xs, nMin);
      const { values, errors } = evaluateSequences(fns, ctx, nMin, Math.min(last, nMin + 5000));
      return fns
        .map((fn, i) => ({ fn, i }))
        .filter(({ fn }) => fn.a.trim())
        .map(({ fn, i }) => ({
          key: fn.id,
          fnId: fn.id,
          label: SEQ_NAMES[i],
          color: fn.color,
          title: fn.a,
          error: errors[fn.id],
          value: values[fn.id] ? (n: number) => values[fn.id][Math.round(n) - Math.ceil(nMin)] ?? NaN : null,
        }));
    }
    const compiled = compileMode(graphMode, fns.map((f) => ({ ...f, visible: true })), ctx, graphWindow);
    const out: Column[] = [];
    fns.forEach((fn, i) => {
      if (!fn.a.trim()) return;
      const at = compiled.pointAt[fn.id];
      const labels = modeLabels(graphMode, i);
      const err = compiled.errors[fn.id];
      if (graphMode === 'par') {
        out.push({ key: `${fn.id}x`, fnId: fn.id, label: labels[0], color: fn.color, title: fn.a, error: err, value: at ? (t) => at(t).x : null });
        out.push({ key: `${fn.id}y`, fnId: fn.id, label: labels[1], color: fn.color, title: fn.b ?? '', error: err, value: at ? (t) => at(t).y : null });
      } else out.push({ key: fn.id, fnId: fn.id, label: labels[0], color: fn.color, title: fn.a, error: err, value: at ? (th) => at(th).extra ?? NaN : null });
    });
    return out;
  }, [graphMode, parsed, modeFns, ctx, graphWindow, xs]);

  const groups = useMemo(() => {
    const seen = new Map<string, { fnId: string; label: string; color: string }>();
    for (const c of columns) if (!seen.has(c.fnId)) seen.set(c.fnId, { fnId: c.fnId, label: graphMode === 'par' ? c.label.replace(/^X/, '') : c.label, color: c.color });
    return [...seen.values()];
  }, [columns, graphMode]);
  const cols = columns.filter((c) => !hidden.has(c.fnId));

  const askValue = askX.trim() ? ev(askX) : null;

  const cell = (f: Column['value'], x: number) => {
    if (!f) return { text: 'error', undef: true };
    const y = f(x);
    return Number.isFinite(y) ? { text: formatNumber(y, fmt), undef: false } : { text: 'undefined', undef: true };
  };

  if (!columns.length) {
    return (
      <div className="page">
        <div className="card empty">
          <p>Nothing to tabulate yet. Enter equations with the Y= key to build a table.</p>
          <button className="btn primary" onClick={() => navigate('yeq')}>
            Go to Y=
          </button>
        </div>
      </div>
    );
  }

  const row = (x: number, highlight = false) => (
    <tr key={`${highlight ? 'ask' : ''}${x}`} style={highlight ? { background: 'var(--accent-soft)' } : undefined}>
      <td>{formatNumber(x, fmt)}</td>
      {cols.map((c) => {
        const v = cell(c.value, x);
        return (
          <td
            key={c.key}
            className={`clickable${v.undef ? ' undef' : ''}`}
            tabIndex={0}
            onClick={() => c.value && requestTrace(c.fnId, x)}
            onKeyDown={(e) => e.key === 'Enter' && c.value && requestTrace(c.fnId, x)}
            title={`Show ${indep} = ${formatNumber(x, fmt)} on the graph`}
          >
            {v.text}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="page">
      <div className="card">
        <div className="card-body stack">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            <NumberField label={`Start ${indep} (TblStart)`} value={start} evaluate={ev} onCommit={(v) => setTable(seq ? Math.round(v) : v, step)} />
            <NumberField label="Step (ΔTbl)" value={step} evaluate={ev} onCommit={(v) => setTable(start, seq ? Math.max(1, Math.round(v)) : v)} validate={(v) => (v === 0 ? 'Step cannot be 0' : null)} />
            <label className="field">
              <span>Evaluate at {indep}</span>
              <input className="input" value={askX} placeholder="e.g. 2.5 or π/4" onChange={(e) => setAskX(e.target.value)} />
            </label>
          </div>
          <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Columns">
            <span className="label">Columns</span>
            {groups.map((g) => {
              const on = !hidden.has(g.fnId);
              return (
                <button
                  key={g.fnId}
                  className={`chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  style={on ? { color: g.color, background: `color-mix(in srgb, ${g.color} 16%, transparent)` } : undefined}
                  onClick={() => {
                    const next = new Set(hidden);
                    if (on) next.add(g.fnId);
                    else next.delete(g.fnId);
                    setHidden(next);
                  }}
                >
                  {g.label}
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
                <th scope="col">{indep}</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" style={{ color: c.color }} title={c.title}>
                    {c.label}
                    {c.error && ' ⚠'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {askValue !== null && Number.isFinite(askValue) && row(seq ? Math.round(askValue) : askValue, true)}
              {xs.map((x) => row(x))}
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
