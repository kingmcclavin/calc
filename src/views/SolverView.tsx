import { useEffect, useState } from 'react';
import { MathInput } from '../components/MathInput';
import { SymbolBar } from '../components/SymbolBar';
import { Tex } from '../components/Tex';
import { toFailure } from '../math/engine';
import { solveEquation, solveQuadraticInputs, solveSystem2, type SolveResult } from '../math/solver';
import { useEvalContext, useNumberEvaluator } from '../state/context';
import { useStore } from '../state/store';

type Mode = 'equation' | 'quadratic' | 'system';

const EQUATION_EXAMPLES = ['3x + 5 = 2x - 7', 'x^2 - 5x + 6 = 0', '2x^2 + 3x = 4', 'x^3 - 6x^2 + 11x = 6', 'cos(x) = x', 'e^x = 3x', 'ln(x) = 1'];

export function SolverView() {
  const [mode, setMode] = useState<Mode>('equation');
  return (
    <div className="page">
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="tabs" role="tablist" aria-label="Solver type">
          <button role="tab" aria-selected={mode === 'equation'} onClick={() => setMode('equation')}>
            Equation
          </button>
          <button role="tab" aria-selected={mode === 'quadratic'} onClick={() => setMode('quadratic')}>
            Quadratic ax² + bx + c
          </button>
          <button role="tab" aria-selected={mode === 'system'} onClick={() => setMode('system')}>
            2×2 Linear system
          </button>
        </div>
        {mode === 'equation' && <EquationSolver />}
        {mode === 'quadratic' && <QuadraticSolver />}
        {mode === 'system' && <SystemSolver />}
      </div>
    </div>
  );
}

function Results({ result, error }: { result: SolveResult | null; error: string | null }) {
  if (error) return <div className="error-text" role="alert">{error}</div>;
  if (!result) return null;
  const anyApprox = result.solutions.some((s) => !s.exact);
  return (
    <div className="page-grid" style={{ gap: 14 }}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row wrap">
          <h3 style={{ margin: 0, fontSize: 15 }}>{result.summary}</h3>
          <span className={`badge ${anyApprox ? 'approx' : 'exact'}`}>{anyApprox ? '≈ numerical' : 'exact'}</span>
        </div>
        {result.solutions.map((s, i) => (
          <div key={i} className="solution">
            <Tex tex={s.tex} />
          </div>
        ))}
        {result.note && <p className="muted small" style={{ margin: 0 }}>{result.note}</p>}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="label">STEPS</div>
        <ol className="steps">
          {result.steps.map((st, i) => (
            <li key={i}>
              <div>
                <div>{st.text}</div>
                {st.tex && (
                  <div className="math">
                    <Tex tex={st.tex} display />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function EquationSolver() {
  const ctx = useEvalContext();
  const ev = useNumberEvaluator();
  const fmt = useStore((s) => s.settings.format);
  const [eq, setEq] = useState('x^2 - 5x + 6 = 0');
  const [lo, setLo] = useState('-100');
  const [hi, setHi] = useState('100');
  const [state, setState] = useState<{ result: SolveResult | null; error: string | null }>({ result: null, error: null });

  const solve = (src = eq) => {
    try {
      const l = ev(lo);
      const h = ev(hi);
      if (l === null || h === null || !(l < h)) throw new Error('The search interval must satisfy from < to');
      setState({ result: solveEquation(src, ctx, { lo: l, hi: h, format: fmt }), error: null });
    } catch (e) {
      setState({ result: null, error: toFailure(e).error });
    }
  };

  // Show a worked example on first visit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => solve(), []);

  return (
    <>
      <div className="card-body stack">
        <label className="field">
          <span>Equation in x</span>
          <MathInput value={eq} onChange={setEq} onSubmit={() => solve()} ariaLabel="Equation" placeholder="e.g. 2x + 3 = 7" />
        </label>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ width: 120 }}>
            <span>Search from</span>
            <input className="input" value={lo} onChange={(e) => setLo(e.target.value)} />
          </label>
          <label className="field" style={{ width: 120 }}>
            <span>to</span>
            <input className="input" value={hi} onChange={(e) => setHi(e.target.value)} />
          </label>
          <button className="btn primary" onClick={() => solve()}>
            Solve
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Linear and quadratic equations (with rational coefficients) are solved exactly with steps. Everything else — higher-degree
          polynomials, trig, exponentials — is solved numerically; the interval applies to non-polynomial equations.
        </p>
        <div className="row wrap" style={{ gap: 6 }}>
          {EQUATION_EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="chip"
              onClick={() => {
                setEq(ex);
                solve(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>
        <Results {...state} />
      </div>
      <SymbolBar includeEquals />
    </>
  );
}

function CoefField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <MathInput value={value} onChange={onChange} ariaLabel={label} />
    </label>
  );
}

function QuadraticSolver() {
  const ctx = useEvalContext();
  const fmt = useStore((s) => s.settings.format);
  const [a, setA] = useState('2');
  const [b, setB] = useState('-3');
  const [c, setC] = useState('-1');
  const [state, setState] = useState<{ result: SolveResult | null; error: string | null }>({ result: null, error: null });
  const solve = () => {
    try {
      setState({ result: solveQuadraticInputs(a, b, c, ctx, fmt), error: null });
    } catch (e) {
      setState({ result: null, error: toFailure(e).error });
    }
  };
  return (
    <div className="card-body stack">
      <Tex tex="ax^2 + bx + c = 0" display />
      <div className="form-grid">
        <CoefField label="a" value={a} onChange={setA} />
        <CoefField label="b" value={b} onChange={setB} />
        <CoefField label="c" value={c} onChange={setC} />
      </div>
      <div className="row">
        <button className="btn primary" onClick={solve}>
          Solve
        </button>
        <span className="muted small">Coefficients may be fractions or expressions, e.g. 1/2 or √2.</span>
      </div>
      <Results {...state} />
    </div>
  );
}

function SystemSolver() {
  const ctx = useEvalContext();
  const fmt = useStore((s) => s.settings.format);
  const [m, setM] = useState([
    ['2', '3', '8'],
    ['1', '-1', '-1'],
  ]);
  const [state, setState] = useState<{ result: SolveResult | null; error: string | null }>({ result: null, error: null });
  const set = (i: number, j: number, v: string) => setM(m.map((row, r) => row.map((x, c) => (r === i && c === j ? v : x))));
  const solve = () => {
    try {
      setState({ result: solveSystem2(m, ctx, fmt), error: null });
    } catch (e) {
      setState({ result: null, error: toFailure(e).error });
    }
  };
  return (
    <div className="card-body stack">
      <Tex tex="\begin{cases} a_1x + b_1y = c_1 \\ a_2x + b_2y = c_2 \end{cases}" display />
      {[0, 1].map((i) => (
        <div key={i} className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <CoefField label={`a${i + 1}`} value={m[i][0]} onChange={(v) => set(i, 0, v)} />
          <CoefField label={`b${i + 1}`} value={m[i][1]} onChange={(v) => set(i, 1, v)} />
          <CoefField label={`c${i + 1}`} value={m[i][2]} onChange={(v) => set(i, 2, v)} />
        </div>
      ))}
      <div className="row">
        <button className="btn primary" onClick={solve}>
          Solve
        </button>
      </div>
      <Results {...state} />
    </div>
  );
}
