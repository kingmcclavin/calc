import { useMemo, useState } from 'react';
import { Tex } from '../components/Tex';
import { copyText, toast } from '../components/ui';
import { IconCopy, IconTrash } from '../components/Icons';
import { useStore } from '../state/store';

export function HistoryView() {
  const history = useStore((s) => s.history);
  const removeHistory = useStore((s) => s.removeHistory);
  const clearHistory = useStore((s) => s.clearHistory);
  const setInput = useStore((s) => s.setInput);
  const setView = useStore((s) => s.setView);
  const saved = useStore((s) => s.savedGraphs);
  const loadGraph = useStore((s) => s.loadGraph);
  const deleteGraph = useStore((s) => s.deleteGraph);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [...history].reverse();
    return needle ? list.filter((h) => h.input.toLowerCase().includes(needle) || (h.resultText ?? '').toLowerCase().includes(needle)) : list;
  }, [history, q]);

  return (
    <div className="page">
      <div className="page-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <section className="card" aria-labelledby="hist-h">
          <div className="card-head">
            <h2 id="hist-h">Calculation history</h2>
            <span className="muted small grow">{history.length} saved on this device</span>
            <button
              className="btn sm danger"
              disabled={!history.length}
              onClick={() => {
                if (confirm('Clear the entire calculation history?')) {
                  clearHistory();
                  toast('History cleared');
                }
              }}
            >
              Clear
            </button>
          </div>
          <div className="card-body stack" style={{ gap: 8 }}>
            <input className="input" placeholder="Search history…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search history" style={{ fontFamily: 'var(--font-sans)' }} />
            {filtered.length === 0 && <div className="empty">{history.length ? 'No matches.' : 'Calculations you evaluate appear here.'}</div>}
            {filtered.map((h) => (
              <div key={h.id} className="saved-item" style={{ alignItems: 'flex-start' }}>
                <button
                  className="grow"
                  style={{ background: 'none', border: 0, textAlign: 'left', padding: 0, minWidth: 0, overflowX: 'auto' }}
                  title="Open in calculator"
                  onClick={() => {
                    setInput(h.input);
                    setView('calc');
                  }}
                >
                  <div className="muted" style={{ overflowX: 'auto' }}>
                    <Tex tex={h.inputTex} />
                  </div>
                  <div style={{ fontSize: '1.08em', overflowX: 'auto' }}>
                    <Tex tex={`= ${h.resultTex ?? ''}`} />
                  </div>
                  <div className="muted small">{new Date(h.time).toLocaleString()}</div>
                </button>
                <button className="icon-btn sm" aria-label="Copy result" title="Copy result" onClick={() => copyText(h.resultText ?? '')}>
                  <IconCopy />
                </button>
                <button className="icon-btn sm" aria-label="Delete entry" title="Delete" onClick={() => removeHistory(h.id)}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="saved-h">
          <div className="card-head">
            <h2 id="saved-h">Saved graphs</h2>
            <span className="muted small grow">{saved.length}</span>
          </div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {saved.length === 0 && <div className="empty">Use “Save graph” in the Graph view to keep a set of functions and its window.</div>}
            {saved.map((g) => (
              <div key={g.id} className="saved-item">
                <div className="dots" aria-hidden="true">
                  {g.functions.slice(0, 5).map((f) => (
                    <span key={f.id} style={{ background: f.color }} />
                  ))}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div className="muted small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                    {g.functions.map((f) => f.expr).filter(Boolean).join('; ')}
                  </div>
                </div>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    loadGraph(g.id);
                    setView('graph');
                  }}
                >
                  Open
                </button>
                <button
                  className="icon-btn sm"
                  aria-label={`Delete ${g.name}`}
                  onClick={() => {
                    if (confirm(`Delete saved graph “${g.name}”?`)) deleteGraph(g.id);
                  }}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
