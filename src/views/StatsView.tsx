import { useCallback, useMemo, useState } from 'react';
import { GraphCanvas, type PlotCurve } from '../graph/GraphCanvas';
import { Tex } from '../components/Tex';
import { Dialog, toast } from '../components/ui';
import { IconTrash } from '../components/Icons';
import { formatNumber, formatNumberTex } from '../math/format';
import { regress, oneVar, twoVar, expand, type RegressionKind } from '../math/stats';
import * as S from '../math/special';
import { useNumberEvaluator } from '../state/context';
import { LIST_NAMES, PALETTE, useStore, type GraphWindow, type ListName } from '../state/store';

type Tab = 'one' | 'two' | 'dist';

export function StatsView() {
  const [tab, setTab] = useState<Tab>('one');
  return (
    <div className="page">
      <ListEditor />
      <div className="card">
        <div className="tabs" role="tablist" aria-label="Statistics tools">
          <button role="tab" aria-selected={tab === 'one'} onClick={() => setTab('one')}>
            1-Var Stats
          </button>
          <button role="tab" aria-selected={tab === 'two'} onClick={() => setTab('two')}>
            2-Var Stats &amp; Regression
          </button>
          <button role="tab" aria-selected={tab === 'dist'} onClick={() => setTab('dist')}>
            Distributions
          </button>
        </div>
        <div className="card-body">
          {tab === 'one' && <OneVarPanel />}
          {tab === 'two' && <TwoVarPanel />}
          {tab === 'dist' && <DistributionPanel />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* List editor                                                                */
/* ------------------------------------------------------------------------ */

const SAMPLES: Array<{ name: string; lists: Partial<Record<ListName, number[]>> }> = [
  { name: 'Study hours (L1) vs. score (L2)', lists: { L1: [1, 2, 3, 4, 5, 6, 7, 8], L2: [52, 55, 61, 64, 70, 74, 79, 85] } },
  { name: 'Exam scores (L3)', lists: { L3: [72, 85, 90, 66, 85, 78, 95, 88, 70, 85, 61, 79] } },
  { name: 'Bacteria growth: hour (L4) vs. count (L5)', lists: { L4: [0, 1, 2, 3, 4, 5, 6], L5: [100, 150, 230, 340, 510, 760, 1150] } },
];

function ListEditor() {
  const lists = useStore((s) => s.lists);
  const setList = useStore((s) => s.setList);
  const ev = useNumberEvaluator();
  const [bulk, setBulk] = useState<ListName | null>(null);
  const [showSamples, setShowSamples] = useState(false);
  const maxLen = Math.max(...LIST_NAMES.map((l) => lists[l].length));

  const commit = (name: ListName, i: number, text: string) => {
    const list = [...lists[name]];
    if (!text.trim()) {
      if (i < list.length) {
        list.splice(i, 1);
        setList(name, list);
      }
      return true;
    }
    const v = ev(text);
    if (v === null || !Number.isFinite(v)) {
      toast(`"${text}" is not a number`);
      return false;
    }
    if (i >= list.length) list.push(v);
    else list[i] = v;
    setList(name, list);
    return true;
  };

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="card-head">
        <h2>Lists</h2>
        <span className="muted small grow">Tap a cell to edit. Leave a cell empty to delete it. Use L1–L6 in calculations, e.g. mean(L1).</span>
        <button className="btn sm" onClick={() => setShowSamples(true)}>
          Sample data
        </button>
      </div>
      <div className="list-scroll" style={{ marginTop: 12 }}>
        <div className="list-editor">
          {LIST_NAMES.map((name) => (
            <div className="list-col" key={name}>
              <div className="list-col-head">
                <span>{name}</span>
                <span className="row" style={{ gap: 0 }}>
                  <button className="btn ghost sm" style={{ padding: '0 6px', height: 24 }} title={`Edit ${name} as text (paste values)`} onClick={() => setBulk(name)}>
                    ✎
                  </button>
                  <button className="icon-btn sm" style={{ width: 24, height: 24 }} title={`Clear ${name}`} aria-label={`Clear ${name}`} onClick={() => setList(name, [])}>
                    <IconTrash width={14} height={14} />
                  </button>
                </span>
              </div>
              {Array.from({ length: maxLen + 1 }, (_, i) => {
                const v = lists[name][i];
                const present = i < lists[name].length;
                if (!present && i > lists[name].length) return <div key={i} className="list-cell" aria-hidden="true" />;
                return (
                  <input
                    key={`${i}-${v}`}
                    className="list-cell"
                    defaultValue={present ? String(v) : ''}
                    placeholder={present ? '' : '+'}
                    inputMode="decimal"
                    aria-label={`${name} row ${i + 1}`}
                    onBlur={(e) => {
                      if (e.target.value !== (present ? String(v) : '')) {
                        if (!commit(name, i, e.target.value)) e.target.value = present ? String(v) : '';
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                        // move to the next cell down
                        requestAnimationFrame(() => {
                          const next = document.querySelector<HTMLInputElement>(`[aria-label="${name} row ${i + 2}"]`);
                          next?.focus();
                        });
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {bulk && <BulkEdit name={bulk} onClose={() => setBulk(null)} />}
      {showSamples && (
        <Dialog title="Sample datasets" onClose={() => setShowSamples(false)}>
          <div className="menu-grid">
            {SAMPLES.map((s) => (
              <button
                key={s.name}
                className="menu-item"
                onClick={() => {
                  for (const [k, v] of Object.entries(s.lists)) setList(k as ListName, v!);
                  setShowSamples(false);
                  toast('Sample data loaded');
                }}
              >
                <b style={{ fontFamily: 'var(--font-sans)' }}>{s.name}</b>
                <small>{Object.entries(s.lists).map(([k, v]) => `${k}: ${v!.length} values`).join(', ')}</small>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

function BulkEdit({ name, onClose }: { name: ListName; onClose: () => void }) {
  const list = useStore((s) => s.lists[name]);
  const setList = useStore((s) => s.setList);
  const ev = useNumberEvaluator();
  const [text, setText] = useState(list.join(', '));
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    const vals: number[] = [];
    for (const p of parts) {
      const v = ev(p);
      if (v === null || !Number.isFinite(v)) {
        setErr(`"${p}" is not a number`);
        return;
      }
      vals.push(v);
    }
    setList(name, vals);
    onClose();
  };
  return (
    <Dialog
      title={`Edit ${name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Values separated by commas, spaces or new lines</span>
        <textarea className="input" style={{ height: 160, padding: 10, resize: 'vertical' }} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {err && <div className="error-text">{err}</div>}
    </Dialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Panels                                                                     */
/* ------------------------------------------------------------------------ */

function ListSelect({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const lists = useStore((s) => s.lists);
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">(none)</option>}
        {LIST_NAMES.map((l) => (
          <option key={l} value={l}>
            {l} ({lists[l].length})
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div className="stat" title={title}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function OneVarPanel() {
  const lists = useStore((s) => s.lists);
  const fmt = useStore((s) => s.settings.format);
  const [x, setX] = useState<ListName>(() => (lists.L3.length ? 'L3' : 'L1'));
  const [freq, setFreq] = useState('');
  const result = useMemo(() => {
    try {
      const freqList = freq ? lists[freq as ListName] : undefined;
      if (freqList && freqList.length !== lists[x].length) throw new Error(`${x} and ${freq} have different lengths`);
      return { stats: oneVar(expand(lists[x], freqList)), error: null };
    } catch (e) {
      return { stats: null, error: (e as Error).message };
    }
  }, [lists, x, freq]);
  const f = (n: number) => formatNumber(n, fmt);
  const s = result.stats;
  return (
    <div className="stack">
      <div className="form-grid">
        <ListSelect label="Data list" value={x} onChange={(v) => setX(v as ListName)} />
        <ListSelect label="Frequency list" value={freq} onChange={setFreq} allowNone />
      </div>
      {result.error && <div className="error-text">{result.error}</div>}
      {s && (
        <div className="stat-grid">
          <Stat k="n" v={f(s.n)} title="Number of values" />
          <Stat k="Mean x̄" v={f(s.mean)} />
          <Stat k="Σx" v={f(s.sum)} />
          <Stat k="Σx²" v={f(s.sumSq)} />
          <Stat k="Sample std dev Sx" v={s.n > 1 ? f(s.sx) : '—'} title="Divides by n − 1" />
          <Stat k="Population std dev σx" v={f(s.sigmaX)} title="Divides by n" />
          <Stat k="Sample variance Sx²" v={s.n > 1 ? f(s.variance) : '—'} />
          <Stat k="Min" v={f(s.min)} />
          <Stat k="Q1" v={f(s.q1)} title="TI-84 convention: median of the lower half" />
          <Stat k="Median" v={f(s.median)} />
          <Stat k="Q3" v={f(s.q3)} title="TI-84 convention: median of the upper half" />
          <Stat k="Max" v={f(s.max)} />
          <Stat k="Range" v={f(s.range)} />
          <Stat k="Mode" v={s.mode.length ? s.mode.map(f).join(', ') : 'none'} title="Most frequent value(s); none if all values are equally frequent" />
        </div>
      )}
    </div>
  );
}

const MODELS: Array<{ id: RegressionKind; label: string }> = [
  { id: 'linear', label: 'Linear  y = ax + b' },
  { id: 'quadratic', label: 'Quadratic  y = ax² + bx + c' },
  { id: 'cubic', label: 'Cubic  y = ax³ + bx² + cx + d' },
  { id: 'exponential', label: 'Exponential  y = a·bˣ' },
  { id: 'logarithmic', label: 'Logarithmic  y = a + b ln x' },
  { id: 'power', label: 'Power  y = a·xᵇ' },
];

function statWindow(xs: number[], ys: number[]): GraphWindow {
  const pad = (lo: number, hi: number) => {
    const r = hi - lo || Math.abs(hi) || 1;
    return [lo - r * 0.12, hi + r * 0.12];
  };
  const [xMin, xMax] = pad(Math.min(...xs), Math.max(...xs));
  const [yMin, yMax] = pad(Math.min(...ys), Math.max(...ys));
  return { xMin, xMax, yMin, yMax, xScl: 0, yScl: 0 };
}

function TwoVarPanel() {
  const lists = useStore((s) => s.lists);
  const fmt = useStore((s) => s.settings.format);
  const settings = useStore((s) => s.settings);
  const addFunction = useStore((s) => s.addFunction);
  const [xl, setXl] = useState<ListName>('L1');
  const [yl, setYl] = useState<ListName>('L2');
  const [model, setModel] = useState<RegressionKind>('linear');
  const [win, setWin] = useState<GraphWindow | null>(null);
  const xs = lists[xl];
  const ys = lists[yl];

  const result = useMemo(() => {
    try {
      const two = twoVar(xs, ys);
      const reg = regress(model, xs, ys);
      return { two, reg, error: null };
    } catch (e) {
      return { two: null, reg: null, error: (e as Error).message };
    }
  }, [xs, ys, model]);

  const autoWin = useMemo(() => (xs.length && xs.length === ys.length ? statWindow(xs, ys) : null), [xs, ys]);
  const view = win ?? autoWin;
  const f = (n: number) => formatNumber(n, fmt);
  const reg = result.reg;
  const curves: PlotCurve[] = useMemo(() => (reg ? [{ id: 'reg', label: 'Regression', f: reg.predict, color: PALETTE[1] }] : []), [reg]);
  const exprText = reg ? reg.expr((n) => formatNumber(n, { mode: 'float', digits: 10 }).replace('ᴇ', 'ᴇ')) : '';

  const onWin = useCallback((w: GraphWindow) => setWin(w), []);

  return (
    <div className="stack">
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        <ListSelect label="X list" value={xl} onChange={(v) => { setXl(v as ListName); setWin(null); }} />
        <ListSelect label="Y list" value={yl} onChange={(v) => { setYl(v as ListName); setWin(null); }} />
        <label className="field" style={{ gridColumn: 'span 2' }}>
          <span>Regression model</span>
          <select className="input" value={model} onChange={(e) => setModel(e.target.value as RegressionKind)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {result.error && <div className="error-text">{result.error}</div>}
      {result.two && reg && (
        <div className="page-grid" style={{ gap: 14 }}>
          <div className="stack">
            <div className="solution">
              <Tex tex={reg.modelTex} />
            </div>
            <div className="stat-grid">
              {Object.entries(reg.coef).map(([k, v]) => (
                <Stat key={k} k={k} v={f(v)} />
              ))}
              {reg.r !== undefined && <Stat k="r" v={f(reg.r)} title={model === 'linear' ? 'Correlation coefficient' : 'Correlation of the linearised data'} />}
              <Stat k="r²" v={f(reg.r2)} title="Coefficient of determination" />
              <Stat k="n" v={f(result.two.n)} />
              <Stat k="x̄" v={f(result.two.meanX)} />
              <Stat k="ȳ" v={f(result.two.meanY)} />
              <Stat k="Sx" v={f(result.two.sx)} />
              <Stat k="Sy" v={f(result.two.sy)} />
              <Stat k="Σxy" v={f(result.two.sumXY)} />
            </div>
            <div className="row wrap">
              <button
                className="btn primary sm"
                onClick={() => {
                  const id = addFunction(exprText);
                  toast(id ? 'Regression added to the Graph view' : 'Function list is full (10)');
                }}
              >
                Send equation to Graph
              </button>
              <span className="muted small" style={{ fontFamily: 'var(--font-mono)' }}>
                y = {exprText}
              </span>
            </div>
            {(model === 'exponential' || model === 'power' || model === 'logarithmic') && (
              <p className="muted small" style={{ margin: 0 }}>
                Like the TI-84, this model is fitted by least squares on log-transformed data.
              </p>
            )}
          </div>
          {view && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="mini-graph">
                <GraphCanvas
                  window={view}
                  onWindowChange={onWin}
                  curves={curves}
                  scatter={{ xs, ys, color: PALETTE[0] }}
                  showGrid={settings.showGrid}
                  showAxes={settings.showAxes}
                  showLabels={settings.showLabels}
                  lineWidth={settings.lineWidth}
                  ariaLabel="Scatter plot with regression curve"
                />
              </div>
              <button className="btn ghost sm" style={{ alignSelf: 'flex-end' }} onClick={() => setWin(null)}>
                Fit to data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DistributionPanel() {
  const ev = useNumberEvaluator();
  const fmt = useStore((s) => s.settings.format);
  const settings = useStore((s) => s.settings);
  const [kind, setKind] = useState<'normal' | 'binomial' | 'poisson'>('normal');
  const [v, setV] = useState<Record<string, string>>({ mu: '0', sigma: '1', lo: '-1', hi: '1', p: '0.95', n: '10', prob: '0.5', k: '5', lambda: '3', x: '0' });
  const num = (key: string) => ev(v[key]);
  const f = (n: number) => (Number.isFinite(n) ? formatNumber(n, fmt) : 'undefined');
  const field = (key: string, label: string) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input className={`input${num(key) === null ? ' invalid' : ''}`} value={v[key]} inputMode="decimal" onChange={(e) => setV({ ...v, [key]: e.target.value })} />
    </label>
  );

  let content: React.ReactNode = null;
  if (kind === 'normal') {
    const mu = num('mu') ?? NaN;
    const sigma = num('sigma') ?? NaN;
    const lo = num('lo') ?? NaN;
    const hi = num('hi') ?? NaN;
    const p = num('p') ?? NaN;
    const x = num('x') ?? NaN;
    const valid = sigma > 0 && Number.isFinite(mu);
    const area = valid ? S.normalCdf(lo, hi, mu, sigma) : NaN;
    const win: GraphWindow | null = valid ? { xMin: mu - 4 * sigma, xMax: mu + 4 * sigma, yMin: -0.08 / sigma, yMax: 0.48 / sigma, xScl: sigma, yScl: 0 } : null;
    content = (
      <div className="page-grid">
        <div className="stack">
          <div className="form-grid">
            {field('mu', 'Mean μ')}
            {field('sigma', 'Std dev σ')}
            {field('lo', 'Lower bound')}
            {field('hi', 'Upper bound')}
          </div>
          {!valid && <div className="error-text">σ must be positive.</div>}
          <div className="solution">
            <Tex tex={`P(${formatNumberTex(lo, fmt)} \\le X \\le ${formatNumberTex(hi, fmt)}) = ${valid ? formatNumberTex(area, fmt) : '?'}`} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Tip: use −1ᴇ99 or 1ᴇ99 for an open-ended tail.
          </p>
          <div className="form-grid">
            {field('x', 'Density at x')}
            {field('p', 'Inverse: left area')}
          </div>
          <div className="stat-grid">
            <Stat k="normalpdf(x)" v={valid ? f(S.normalPdf(x, mu, sigma)) : '—'} />
            <Stat k="invNorm(area)" v={valid && p > 0 && p < 1 ? f(S.invNorm(p, mu, sigma)) : '—'} title="Area must be between 0 and 1" />
          </div>
        </div>
        {win && (
          <div className="mini-graph">
            <GraphCanvas
              window={win}
              onWindowChange={() => undefined}
              curves={[{ id: 'pdf', label: 'Normal density', f: (t) => S.normalPdf(t, mu, sigma), color: PALETTE[0] }]}
              shade={{ f: (t) => S.normalPdf(t, mu, sigma), a: Math.max(lo, mu - 50 * sigma), b: Math.min(hi, mu + 50 * sigma), color: PALETTE[0] }}
              showGrid={settings.showGrid}
              showAxes
              showLabels={settings.showLabels}
              lineWidth={settings.lineWidth}
              ariaLabel="Normal distribution with shaded probability"
            />
          </div>
        )}
      </div>
    );
  } else if (kind === 'binomial') {
    const n = num('n') ?? NaN;
    const p = num('prob') ?? NaN;
    const k = num('k') ?? NaN;
    const valid = Number.isInteger(n) && n >= 0 && n <= 1e6 && p >= 0 && p <= 1 && Number.isInteger(k);
    content = (
      <div className="stack">
        <div className="form-grid">
          {field('n', 'Trials n')}
          {field('prob', 'Success prob. p')}
          {field('k', 'Successes k')}
        </div>
        {!valid && <div className="error-text">n and k must be non-negative integers and 0 ≤ p ≤ 1.</div>}
        {valid && (
          <div className="stat-grid">
            <Stat k="P(X = k)  binompdf" v={f(S.binomPdf(n, p, k))} />
            <Stat k="P(X ≤ k)  binomcdf" v={f(S.binomCdf(n, p, k))} />
            <Stat k="P(X < k)" v={f(S.binomCdf(n, p, k - 1))} />
            <Stat k="P(X ≥ k)" v={f(1 - S.binomCdf(n, p, k - 1))} />
            <Stat k="P(X > k)" v={f(1 - S.binomCdf(n, p, k))} />
            <Stat k="Mean np" v={f(n * p)} />
            <Stat k="Std dev √(np(1−p))" v={f(Math.sqrt(n * p * (1 - p)))} />
          </div>
        )}
      </div>
    );
  } else {
    const lambda = num('lambda') ?? NaN;
    const k = num('k') ?? NaN;
    const valid = lambda > 0 && Number.isInteger(k) && k >= 0;
    content = (
      <div className="stack">
        <div className="form-grid">
          {field('lambda', 'Mean μ (λ)')}
          {field('k', 'Count k')}
        </div>
        {!valid && <div className="error-text">μ must be positive and k a non-negative integer.</div>}
        {valid && (
          <div className="stat-grid">
            <Stat k="P(X = k)  poissonpdf" v={f(S.poissonPdf(lambda, k))} />
            <Stat k="P(X ≤ k)  poissoncdf" v={f(S.poissonCdf(lambda, k))} />
            <Stat k="P(X ≥ k)" v={f(1 - S.poissonCdf(lambda, k - 1))} />
            <Stat k="P(X > k)" v={f(1 - S.poissonCdf(lambda, k))} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="segmented" role="group" aria-label="Distribution" style={{ alignSelf: 'flex-start' }}>
        {(['normal', 'binomial', 'poisson'] as const).map((d) => (
          <button key={d} aria-pressed={kind === d} onClick={() => setKind(d)}>
            {d[0].toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>
      {content}
    </div>
  );
}
