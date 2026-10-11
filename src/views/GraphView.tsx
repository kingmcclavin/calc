import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampTrace, curvePoint, GraphCanvas, traceStep, type PlotCurve, type PlotPoint, type TraceState } from '../graph/GraphCanvas';
import { compileMode, modeLabels, modeWindow, type ParamMode } from '../graph/modes';
import { runAnalysis, TOOLS, type AnalysisOutput, type Tool } from '../graph/analysis';
import { squareWindow, zoomWindow, ZOOM_PRESETS, type ZoomPreset } from '../graph/viewport';
import { MathInput } from '../components/MathInput';
import { focusedField, useKeypadHandler } from '../components/DeviceKeypad';
import { CalculateView } from './CalculateView';
import { TableView } from './TableView';
import { SymbolBar } from '../components/SymbolBar';
import { Tex } from '../components/Tex';
import { Dialog, NumberField, toast } from '../components/ui';
import {
  IconClose, IconCrosshair, IconDown, IconEye, IconEyeOff, IconHome, IconLeft, IconPlus, IconRedo, IconRight, IconSave,
  IconTarget, IconTrash, IconUndo, IconUp, IconWindow, IconZoomIn, IconZoomOut,
} from '../components/Icons';
import { toFailure } from '../math/engine';
import { formatNumber } from '../math/format';
import { toTex } from '../math/latex';
import { useNumberEvaluator, useParsedFunctions, type ParsedFn } from '../state/context';
import { PALETTE, STANDARD_WINDOW, useStore, type GraphFn, type GraphWindow } from '../state/store';

const EXAMPLES: Array<{ name: string; exprs: string[]; window?: GraphWindow }> = [
  { name: 'Parabola, wave & line', exprs: ['x^2-4', '3sin(x)', '0.5x+1'] },
  { name: 'Rational function with asymptotes', exprs: ['(x+1)/(x-2)', '1'], window: STANDARD_WINDOW },
  { name: 'Trig family', exprs: ['sin(x)', 'cos(x)', 'tan(x)'], window: { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -4, yMax: 4, xScl: Math.PI / 2, yScl: 1 } },
  { name: 'Growth vs. decay', exprs: ['2^x', '(1/2)^x', 'ln(x)'], window: { xMin: -5, xMax: 5, yMin: -3, yMax: 8, xScl: 0, yScl: 0 } },
  { name: 'Circle (two halves)', exprs: ['√(25-x^2)', '-√(25-x^2)'] },
  { name: 'Cubic with turning points', exprs: ['x^3-6x^2+9x-1', 'nDeriv(Y1,x,x)'] },
  { name: 'Step & absolute value', exprs: ['floor(x)', 'abs(x-2)-3'] },
  { name: 'Normal curve', exprs: ['normalpdf(x,0,1)'], window: { xMin: -4, xMax: 4, yMin: -0.1, yMax: 0.5, xScl: 1, yScl: 0.1 } },
];

/**
 * Two TI-84 screens share this component: Y= (the equation editor, `screen="equations"`)
 * and GRAPH (only the graph, `screen="graph"`). They are opened with the Y= and GRAPH keys.
 */
export function GraphView({ screen }: { screen: 'equations' | 'graph' }) {
  const graphWindow = useStore((s) => s.window);
  const setWindow = useStore((s) => s.setWindow);
  const settings = useStore((s) => s.settings);
  const traceRequest = useStore((s) => s.traceRequest);
  const clearTraceRequest = useStore((s) => s.clearTraceRequest);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const { ctx, parsed } = useParsedFunctions();

  const navigate = useStore((s) => s.navigate);
  const pane = screen === 'equations' ? 'list' : 'graph';
  const setPane = (p: 'list' | 'graph') => {
    if (p === 'list' && screen !== 'equations') navigate('yeq');
    if (p === 'graph' && screen !== 'graph') navigate('graph');
  };
  const [trace, setTrace] = useState<TraceState | null>(null);
  const [showWindow, setShowWindow] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [tool, setTool] = useState<Tool | null>(null);
  const canvasSize = useRef({ w: 800, h: 600 });

  const graphMode = settings.graphMode;
  const split = screen === 'graph' ? settings.split : 'full';
  const modeFns = useStore((s) => s.modeFns);
  const w0 = graphWindow;
  const compiledMode = useMemo(
    () => (graphMode === 'func' ? null : compileMode(graphMode, modeFns[graphMode], ctx, w0)),
    // only the T/θ/n settings matter here, so panning does not recompute (or re-animate) the curves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphMode, modeFns, ctx, w0.tMin, w0.tMax, w0.tStep, w0.thetaMin, w0.thetaMax, w0.thetaStep, w0.nMin, w0.nMax],
  );
  const curves: PlotCurve[] = useMemo(
    () =>
      compiledMode
        ? compiledMode.curves
        : parsed.filter((p) => p.fn.visible && p.f).map((p) => ({ id: p.fn.id, label: p.name, f: p.f!, color: p.fn.color })),
    [parsed, compiledMode],
  );
  /** Where tracing starts on a curve: the middle of the screen, or the start of T/θ/n. */
  const traceStart = (c: PlotCurve, w: GraphWindow) => (c.f ? (w.xMin + w.xMax) / 2 : c.param ? c.param.tMin : c.points?.[0]?.x ?? 0);

  // Requests from the Table view: jump to a point
  useEffect(() => {
    if (!traceRequest) return;
    const { fnId, x } = traceRequest;
    clearTraceRequest();
    setPane('graph');
    setTrace({ curveId: fnId, x });
    const w = useStore.getState().window;
    // in PARAMETRIC/POLAR/SEQ modes the value is T, θ or n, not an x position
    if (useStore.getState().settings.graphMode !== 'func') return;
    const p = parsed.find((q) => q.fn.id === fnId);
    const y = p?.f?.(x);
    let nw = w;
    if (x < w.xMin || x > w.xMax) {
      const half = (w.xMax - w.xMin) / 2;
      nw = { ...nw, xMin: x - half, xMax: x + half };
    }
    if (y !== undefined && Number.isFinite(y) && (y < w.yMin || y > w.yMax)) {
      const half = (w.yMax - w.yMin) / 2;
      nw = { ...nw, yMin: y - half, yMax: y + half };
    }
    if (nw !== w) setWindow(nw);
  }, [traceRequest, clearTraceRequest, parsed, setWindow]);

  // Drop the trace if its curve disappears
  useEffect(() => {
    if (trace?.curveId && !curves.some((c) => c.id === trace.curveId)) setTrace(null);
  }, [curves, trace]);

  // Undo / redo shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const applyPreset = useCallback(
    (preset: ZoomPreset) => {
      const { w: W, h: H } = canvasSize.current;
      const w = useStore.getState().window;
      const deg = useStore.getState().settings.angle === 'deg';
      let nw: GraphWindow = w;
      switch (preset) {
        case 'standard':
          nw = STANDARD_WINDOW;
          break;
        case 'trig':
          nw = deg
            ? { xMin: -360, xMax: 360, yMin: -4, yMax: 4, xScl: 90, yScl: 1 }
            : { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -4, yMax: 4, xScl: Math.PI / 2, yScl: 1 };
          break;
        case 'square':
          nw = squareWindow(w, W, H);
          break;
        case 'decimal':
          nw = { xMin: -4.7, xMax: 4.7, yMin: (-4.7 * H) / W, yMax: (4.7 * H) / W, xScl: 1, yScl: 1 };
          break;
        case 'integer':
          nw = { xMin: -47, xMax: 47, yMin: (-47 * H) / W, yMax: (47 * H) / W, xScl: 10, yScl: 10 };
          break;
        case 'quadrant1':
          nw = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, xScl: 0, yScl: 0 };
          break;
        case 'fit': {
          let lo = Infinity;
          let hi = -Infinity;
          for (const c of curves) {
            for (let i = 0; i <= 400; i++) {
              const y = c.f ? c.f(w.xMin + ((w.xMax - w.xMin) * i) / 400) : c.param ? c.param.y(c.param.tMin + ((c.param.tMax - c.param.tMin) * i) / 400) : c.points?.[i]?.y ?? NaN;
              if (Number.isFinite(y) && Math.abs(y) < 1e9) {
                lo = Math.min(lo, y);
                hi = Math.max(hi, y);
              }
            }
          }
          if (!Number.isFinite(lo)) {
            toast('Nothing to fit');
            return;
          }
          if (hi - lo < 1e-9) {
            lo -= 1;
            hi += 1;
          }
          const pad = (hi - lo) * 0.08;
          nw = { ...w, yMin: lo - pad, yMax: hi + pad };
          break;
        }
      }
      setWindow(nw);
    },
    [curves, setWindow],
  );

  // Keypad arrows drive the graph like a TI-84: trace along curves, or pan when not tracing
  useKeypadHandler((a) => {
    if (pane === 'list') return false;
    const field = focusedField();
    // the home screen shown in a HORIZONTAL split keeps its entry line focused
    if (field && !field.closest('.split-pane')) return false;
    // GRAPH-TABLE split: ▲▼ scroll the table, ◀▶ trace the graph
    if (split === 'graph-table' && a.type === 'scroll') return false;
    const w = useStore.getState().window;
    const xr = w.xMax - w.xMin;
    const yr = w.yMax - w.yMin;
    if (a.type === 'left' || a.type === 'right') {
      const d = a.type === 'left' ? -1 : 1;
      if (trace?.curveId) {
        const c = curves.find((k) => k.id === trace.curveId);
        const step = traceStep(c, w);
        const x = clampTrace(c, trace.x + d * step);
        setTrace({ curveId: trace.curveId, x });
        if (c?.f && (x < w.xMin || x > w.xMax)) setWindow({ ...w, xMin: w.xMin + d * step, xMax: w.xMax + d * step });
      } else setWindow({ ...w, xMin: w.xMin + d * xr * 0.1, xMax: w.xMax + d * xr * 0.1 });
      return true;
    }
    if (a.type === 'scroll') {
      if (trace?.curveId && curves.length) {
        const i = curves.findIndex((c) => c.id === trace.curveId);
        const j = (i + a.dir + curves.length) % curves.length;
        setTrace({ curveId: curves[j].id, x: clampTrace(curves[j], trace.x) });
      } else setWindow({ ...w, yMin: w.yMin - a.dir * yr * 0.1, yMax: w.yMax - a.dir * yr * 0.1 });
      return true;
    }
    if (a.type === 'enter' && split !== 'horiz' && !trace && curves[0]) {
      setTrace({ curveId: curves[0].id, x: traceStart(curves[0], w) });
      return true;
    }
    return false;
  });

  /* ------------------------------ analysis tools ------------------------------ */
  const [toolFn, setToolFn] = useState<string | null>(null);
  const [toolFn2, setToolFn2] = useState<string | null>(null);
  const [xIn, setXIn] = useState('1');
  const [aIn, setAIn] = useState('0');
  const [bIn, setBIn] = useState('1');
  const [selected, setSelected] = useState(0);

  const valid = parsed.filter((p) => p.f && p.fn.visible);
  const fA = valid.find((p) => p.fn.id === toolFn) ?? valid[0];
  const fB = valid.find((p) => p.fn.id === toolFn2 && p.fn.id !== fA?.fn.id) ?? valid.find((p) => p.fn.id !== fA?.fn.id);

  const analysis: { out: AnalysisOutput | null; error: string | null } = useMemo(() => {
    if (!tool || !fA?.f) return { out: null, error: null };
    try {
      return {
        out: runAnalysis(tool, {
          f: fA.f,
          ast: fA.ast,
          name: `Y_{${fA.index + 1}}`,
          g: fB?.f ?? undefined,
          gName: fB ? `Y${fB.index + 1}` : undefined,
          ctx,
          xInput: xIn,
          aInput: aIn,
          bInput: bIn,
          xMin: graphWindow.xMin,
          xMax: graphWindow.xMax,
          format: settings.format,
        }),
        error: null,
      };
    } catch (e) {
      return { out: null, error: toFailure(e).error };
    }
  }, [tool, fA, fB, ctx, xIn, aIn, bIn, graphWindow.xMin, graphWindow.xMax, settings.format]);

  useEffect(() => setSelected(0), [tool, toolFn, toolFn2, analysis.out?.rows.length]);

  // When a result is selected, move the trace cursor there
  const rows = analysis.out?.rows ?? [];
  const sel = rows[Math.min(selected, rows.length - 1)];
  useEffect(() => {
    if (!tool || !sel || sel.x === undefined || !fA) return;
    setTrace({ curveId: fA.fn.id, x: sel.x });
  }, [tool, sel, fA]);

  const startTool = (t: Tool) => {
    setTool(t);
    // seed x from the trace cursor so "trace, then analyze" works naturally
    if (trace && (t === 'value' || t === 'derivative' || t === 'tangent')) setXIn(formatNumber(trace.x, { mode: 'float', digits: 6 }));
    if (trace?.curveId) setToolFn(trace.curveId);
    if (t === 'integral') {
      const w = useStore.getState().window;
      const q = (w.xMax - w.xMin) / 4;
      const nice = (v: number) => formatNumber(Number(v.toPrecision(2)), { mode: 'float', digits: 6 });
      setAIn(nice(w.xMin + q));
      setBIn(nice(w.xMax - q));
    }
    setPane('graph');
  };

  // Keys pressed on the calculator keypad (Y=, WINDOW, ZOOM, TRACE, 2nd CALC, GRAPH)
  const intent = useStore((s) => s.intent);
  const clearIntent = useStore((s) => s.clearIntent);
  useEffect(() => {
    if (!intent) return;
    clearIntent();
    const w = useStore.getState().window;
    switch (intent) {
      case 'equations':
        setPane('list');
        break;
      case 'window':
      case 'zoom':
        setPane('graph');
        setShowWindow(true);
        break;
      case 'trace':
        setPane('graph');
        if (curves[0]) setTrace({ curveId: curves[0].id, x: traceStart(curves[0], w) });
        break;
      case 'calc':
        if (graphMode === 'func') startTool('zero');
        else toast('CALC tools work in FUNCTION mode (MODE screen)');
        break;
      default:
        setPane('graph');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const points: PlotPoint[] = useMemo(() => {
    if (!tool || !analysis.out || !fA) return [];
    const color = fA.fn.color;
    return analysis.out.rows
      .filter((r) => r.x !== undefined && r.y !== undefined && tool !== 'value' && tool !== 'derivative' && tool !== 'tangent')
      .map((r) => ({ x: r.x!, y: r.y!, color }));
  }, [tool, analysis.out, fA]);

  const shade = tool === 'integral' && analysis.out?.shade && fA?.f ? { f: fA.f, a: analysis.out.shade.a, b: analysis.out.shade.b, color: fA.fn.color } : null;
  const tangent = tool === 'tangent' && analysis.out?.tangent && fA ? { ...analysis.out.tangent, color: settings.theme === 'light' ? '#14182a' : '#e8ebf2' } : null;

  const traceCurve = trace?.curveId && graphMode === 'func' ? parsed.find((p) => p.fn.id === trace.curveId) : null;
  const tracePlot = trace?.curveId ? curves.find((c) => c.id === trace.curveId) : undefined;
  const tracePt = trace ? (tracePlot ? curvePoint(tracePlot, trace.x) : { x: trace.x, y: trace.y ?? NaN }) : null;
  const traceY = tracePt?.y;
  const traceColor = tracePlot?.color;
  const traceName = graphMode === 'func' ? (traceCurve ? `Y${traceCurve.index + 1}` : '') : tracePlot?.label ?? '';
  const paramName = graphMode === 'par' ? 'T' : graphMode === 'pol' ? 'θ' : graphMode === 'seq' ? 'n' : null;
  const fmt = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? 'undefined' : formatNumber(n, { mode: 'float', digits: 8 }));

  const onWindowChange = useCallback((w: GraphWindow) => setWindow(w), [setWindow]);
  const onSize = useCallback((w: number, h: number) => {
    canvasSize.current = { w, h };
  }, []);

  return (
    <div className="graph-layout" data-pane={pane} data-split={split}>
      {screen === 'equations' && (
      <aside className="graph-side" aria-label="Function editor">
        <div className="graph-side-scroll">
          {graphMode === 'func' ? (
            <FunctionList parsed={parsed} onTrace={(id) => useStore.getState().requestTrace(id, (graphWindow.xMin + graphWindow.xMax) / 2)} />
          ) : (
            <ModeFnList mode={graphMode} errors={compiledMode?.errors ?? {}} />
          )}
          <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
            {graphMode === 'func' && <ExamplesButton />}
            <button className="btn sm" onClick={() => setShowSave(true)} title="Save these functions and window">
              <IconSave width={15} height={15} /> Save graph
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 14 }}>
            {graphMode === 'func' ? (
              <>
                Press <b>GRAPH</b> to see the graph, <b>TRACE</b> to trace it and <b>2nd TRACE</b> (CALC) for zeros, min/max, intersections, dy/dx and ∫.
              </>
            ) : (
              <>
                {graphMode === 'par' ? 'PARAMETRIC' : graphMode === 'pol' ? 'POLAR' : 'SEQ'} mode (change it on the MODE screen). <b>X,T,θ,n</b> types{' '}
                {graphMode === 'par' ? 'T' : graphMode === 'pol' ? 'θ' : 'n'}. Set the {graphMode === 'seq' ? 'n' : graphMode === 'par' ? 'T' : 'θ'} range with <b>WINDOW</b>.
              </>
            )}
          </p>
        </div>
        <SymbolBar />
      </aside>
      )}

      {screen === 'graph' && (
      <section className="graph-main" aria-label="Graph">
        <GraphCanvas
          window={graphWindow}
          onWindowChange={onWindowChange}
          curves={curves}
          points={points}
          shade={shade}
          tangent={tangent}
          trace={trace}
          onTrace={setTrace}
          showGrid={settings.showGrid}
          showAxes={settings.showAxes}
          showLabels={settings.showLabels}
          lineWidth={settings.lineWidth}
          graphStyle={settings.graphStyle}
          drawOrder={settings.drawOrder}
          onSize={onSize}
          ariaLabel={`Graph of ${curves.map((c) => c.label).join(', ') || 'no functions'}`}
        />
        {curves.length === 0 && <div className="graph-hint">Add a function to see it graphed.</div>}
        <div className="graph-toolbar" role="toolbar" aria-label="Graph controls">
          <button className="icon-btn" title="Zoom in (+)" aria-label="Zoom in" onClick={() => setWindow(zoomWindow(graphWindow, 0.5))}>
            <IconZoomIn />
          </button>
          <button className="icon-btn" title="Zoom out (−)" aria-label="Zoom out" onClick={() => setWindow(zoomWindow(graphWindow, 2))}>
            <IconZoomOut />
          </button>
          <button className="icon-btn" title="Standard window (−10 to 10)" aria-label="Reset to standard window" onClick={() => applyPreset('standard')}>
            <IconHome />
          </button>
          <button className="icon-btn" title="Window & zoom settings" aria-label="Window settings" onClick={() => setShowWindow(true)}>
            <IconWindow />
          </button>
          <button
            className="icon-btn"
            title="Trace (Enter): move along a curve"
            aria-label="Trace"
            aria-pressed={!!trace}
            onClick={() => (trace ? setTrace(null) : curves[0] && setTrace({ curveId: curves[0].id, x: traceStart(curves[0], graphWindow) }))}
          >
            <IconCrosshair />
          </button>
          {graphMode === 'func' && (
            <button className="icon-btn" title="Analyze: zeros, extrema, intersections, calculus" aria-label="Analyze" aria-pressed={!!tool} onClick={() => (tool ? setTool(null) : startTool('zero'))}>
              <IconTarget />
            </button>
          )}
        </div>

        {tool && (
          <AnalysisPanel
            tool={tool}
            setTool={setTool}
            valid={valid}
            fA={fA}
            fB={fB}
            setToolFn={setToolFn}
            setToolFn2={setToolFn2}
            xIn={xIn}
            setXIn={setXIn}
            aIn={aIn}
            setAIn={setAIn}
            bIn={bIn}
            setBIn={setBIn}
            out={analysis.out}
            error={analysis.error}
            selected={selected}
            setSelected={setSelected}
          />
        )}

        {trace && !tool && (
          <div className="trace-readout" aria-live="polite">
            {tracePlot ? (
              <>
                <span className="swatch" style={{ background: traceColor }} />
                <b>{traceName}</b>
              </>
            ) : (
              <span className="muted">cursor</span>
            )}
            {paramName && tracePlot && <span>{paramName} = {fmt(trace.x)}</span>}
            {graphMode === 'pol' && tracePlot && <span>r = {fmt(compiledMode?.pointAt[tracePlot.id]?.(trace.x).extra)}</span>}
            <span>x = {fmt(tracePt?.x)}</span>
            <span>y = {fmt(traceY)}</span>
            {tracePlot && (
              <span className="row" style={{ gap: 2 }}>
                <button className="icon-btn sm" aria-label="Move left" onClick={() => setTrace({ ...trace, x: clampTrace(tracePlot, trace.x - traceStep(tracePlot, graphWindow)) })}>
                  <IconLeft />
                </button>
                <button className="icon-btn sm" aria-label="Move right" onClick={() => setTrace({ ...trace, x: clampTrace(tracePlot, trace.x + traceStep(tracePlot, graphWindow)) })}>
                  <IconRight />
                </button>
              </span>
            )}
            <button className="icon-btn sm" aria-label="Close trace" onClick={() => setTrace(null)}>
              <IconClose />
            </button>
          </div>
        )}
      </section>
      )}

      {split !== 'full' && (
        <section className="split-pane" data-split={split} aria-label={split === 'horiz' ? 'Home screen' : 'Table'}>
          {split === 'horiz' ? <CalculateView /> : <TableView />}
        </section>
      )}

      {showWindow && <WindowDialog onClose={() => setShowWindow(false)} onPreset={applyPreset} />}
      {showSave && <SaveDialog onClose={() => setShowSave(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Function list                                                              */
/* ------------------------------------------------------------------------ */

function FunctionList({ parsed, onTrace }: { parsed: ParsedFn[]; onTrace: (id: string) => void }) {
  const addFunction = useStore((s) => s.addFunction);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const [focusId, setFocusId] = useState<string | null>(null);

  return (
    <div className="fn-list">
      <div className="row">
        <span className="label grow">FUNCTIONS</span>
        <button className="icon-btn sm" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <IconUndo />
        </button>
        <button className="icon-btn sm" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <IconRedo />
        </button>
      </div>
      {parsed.map((p, i) => (
        <FunctionRow key={p.fn.id} p={p} first={i === 0} last={i === parsed.length - 1} autoFocus={focusId === p.fn.id} onTrace={onTrace} />
      ))}
      <button
        className="btn"
        onClick={() => {
          const id = addFunction();
          if (!id) toast('Up to 10 functions');
          else setFocusId(id);
        }}
        disabled={parsed.length >= 10}
      >
        <IconPlus width={16} height={16} /> Add function
      </button>
    </div>
  );
}

const FunctionRow = memo(function FunctionRow({ p, first, last, autoFocus, onTrace }: { p: ParsedFn; first: boolean; last: boolean; autoFocus: boolean; onTrace: (id: string) => void }) {
  const updateFunction = useStore((s) => s.updateFunction);
  const removeFunction = useStore((s) => s.removeFunction);
  const moveFunction = useStore((s) => s.moveFunction);
  const requestTable = useStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const { fn } = p;
  return (
    <div className={`fn-row${fn.visible ? '' : ' hidden-fn'}`}>
      <button
        className={`fn-swatch${fn.visible ? '' : ' off'}`}
        style={{ background: fn.color, color: fn.visible ? '#fff' : fn.color }}
        onClick={() => updateFunction(fn.id, { visible: !fn.visible })}
        title={fn.visible ? 'Hide from graph' : 'Show on graph'}
        aria-label={`${p.name} ${fn.visible ? 'visible — hide' : 'hidden — show'}`}
        aria-pressed={fn.visible}
      >
        {fn.visible ? <IconEye width={15} height={15} /> : <IconEyeOff width={15} height={15} />}
      </button>
      <div className="fn-body">
        <div className="fn-input-row">
          <label className="fn-label" htmlFor={`fn-${fn.id}`} style={{ color: fn.color }}>
            Y{p.index + 1}=
          </label>
          <MathInput
            id={`fn-${fn.id}`}
            value={fn.expr}
            onChange={(v) => updateFunction(fn.id, { expr: v })}
            ariaLabel={`Y${p.index + 1} equals`}
            placeholder="e.g. x^2 - 3x + 1"
            invalid={!!p.error}
            autoFocus={autoFocus}
            ariaDescribedBy={p.error ? `fn-err-${fn.id}` : undefined}
          />
        </div>
        {p.error ? (
          <div className="error-text" id={`fn-err-${fn.id}`} role="status">
            {p.error}
          </div>
        ) : p.ast ? (
          <div className="fn-preview">
            <TexOfAst p={p} />
          </div>
        ) : null}
        {open && (
          <div className="stack" style={{ gap: 8, marginTop: 4 }}>
            <div className="color-pop" role="group" aria-label="Line color">
              {PALETTE.map((c) => (
                <button key={c} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={fn.color === c} onClick={() => updateFunction(fn.id, { color: c })} />
              ))}
              <input type="color" value={fn.color} aria-label="Custom color" onChange={(e) => updateFunction(fn.id, { color: e.target.value })} title="Custom color" />
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              <button className="btn sm" disabled={first} onClick={() => moveFunction(fn.id, -1)}>
                <IconUp width={14} height={14} /> Up
              </button>
              <button className="btn sm" disabled={last} onClick={() => moveFunction(fn.id, 1)}>
                <IconDown width={14} height={14} /> Down
              </button>
              <button className="btn sm" disabled={!p.f} onClick={() => onTrace(fn.id)}>
                Trace
              </button>
              <button className="btn sm" onClick={() => requestTable('table')}>
                Table
              </button>
              <button className="btn sm danger" onClick={() => removeFunction(fn.id)}>
                <IconTrash width={14} height={14} /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="fn-actions">
        <button className="icon-btn sm" aria-expanded={open} aria-label={`More options for Y${p.index + 1}`} title="Color, order, delete" onClick={() => setOpen((o) => !o)}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>⋯</span>
        </button>
        <button className="icon-btn sm" aria-label={`Delete Y${p.index + 1}`} title="Delete" onClick={() => removeFunction(fn.id)}>
          <IconTrash />
        </button>
      </div>
    </div>
  );
});

function TexOfAst({ p }: { p: ParsedFn }) {
  const tex = useMemo(() => {
    if (!p.ast) return '';
    return `Y_{${p.index + 1}} = ${toTexSafe(p.ast)}`;
  }, [p.ast, p.index]);
  return <Tex tex={tex} />;
}

function toTexSafe(ast: NonNullable<ParsedFn['ast']>) {
  try {
    return toTex(ast);
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------------ */
/* Analysis panel                                                             */
/* ------------------------------------------------------------------------ */

interface AnalysisPanelProps {
  tool: Tool;
  setTool: (t: Tool | null) => void;
  valid: ParsedFn[];
  fA?: ParsedFn;
  fB?: ParsedFn;
  setToolFn: (id: string) => void;
  setToolFn2: (id: string) => void;
  xIn: string;
  setXIn: (s: string) => void;
  aIn: string;
  setAIn: (s: string) => void;
  bIn: string;
  setBIn: (s: string) => void;
  out: AnalysisOutput | null;
  error: string | null;
  selected: number;
  setSelected: (i: number) => void;
}

function AnalysisPanel(props: AnalysisPanelProps) {
  const { tool, setTool, valid, fA, fB, setToolFn, setToolFn2, xIn, setXIn, aIn, setAIn, bIn, setBIn, out, error, selected, setSelected } = props;
  const info = TOOLS.find((t) => t.id === tool)!;
  const multi = tool === 'zero' || tool === 'minimum' || tool === 'maximum' || tool === 'intersect';
  const rows = out?.rows ?? [];
  return (
    <div className="analysis-panel card" role="region" aria-label="Analysis">
      <div className="card-head">
        <select className="input" style={{ width: 'auto', height: 32, fontWeight: 650 }} value={tool} onChange={(e) => setTool(e.target.value as Tool)} aria-label="Analysis tool">
          {TOOLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="muted small grow" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {info.description}
        </span>
        <button className="icon-btn sm" aria-label="Close analysis" onClick={() => setTool(null)}>
          <IconClose />
        </button>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        {valid.length === 0 ? (
          <div className="muted small">Enter and show at least one valid function first.</div>
        ) : (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <FnSelect label={tool === 'intersect' ? 'First' : 'Function'} valid={valid} value={fA?.fn.id} onChange={setToolFn} />
              {tool === 'intersect' && <FnSelect label="Second" valid={valid.filter((v) => v.fn.id !== fA?.fn.id)} value={fB?.fn.id} onChange={setToolFn2} />}
              {(tool === 'value' || tool === 'derivative' || tool === 'tangent') && <ExprField label="x =" value={xIn} onChange={setXIn} />}
              {tool === 'integral' && (
                <>
                  <ExprField label="from" value={aIn} onChange={setAIn} />
                  <ExprField label="to" value={bIn} onChange={setBIn} />
                </>
              )}
            </div>
            {error && <div className="error-text">{error}</div>}
            {rows.length > 0 && (
              <div className="analysis-results">
                {rows.map((r, i) => (
                  <button
                    key={i}
                    className="result-item"
                    aria-pressed={multi ? i === selected : undefined}
                    onClick={() => setSelected(i)}
                    disabled={!multi && r.x === undefined}
                  >
                    {multi && <span className="badge">{i + 1}</span>}
                    <span className="grow">
                      <Tex tex={r.tex} />
                    </span>
                    <span className={`badge ${r.exact ? 'exact' : 'approx'}`}>{r.exact ? 'exact' : '≈ numeric'}</span>
                  </button>
                ))}
              </div>
            )}
            {multi && rows.length > 1 && (
              <div className="row">
                <button className="btn sm" onClick={() => setSelected((selected - 1 + rows.length) % rows.length)}>
                  <IconLeft width={14} height={14} /> Prev
                </button>
                <span className="muted small grow" style={{ textAlign: 'center' }}>
                  {selected + 1} of {rows.length}
                </span>
                <button className="btn sm" onClick={() => setSelected((selected + 1) % rows.length)}>
                  Next <IconRight width={14} height={14} />
                </button>
              </div>
            )}
            {out?.note && <div className="muted small">{out.note}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function FnSelect({ label, valid, value, onChange }: { label: string; valid: ParsedFn[]; value?: string; onChange: (id: string) => void }) {
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="label">{label}</span>
      <select className="input" style={{ width: 'auto', height: 32 }} value={value} onChange={(e) => onChange(e.target.value)}>
        {valid.map((v) => (
          <option key={v.fn.id} value={v.fn.id}>
            Y{v.index + 1} = {v.fn.expr.length > 18 ? `${v.fn.expr.slice(0, 18)}…` : v.fn.expr}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExprField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="label">{label}</span>
      <MathInput value={value} onChange={onChange} ariaLabel={label} className="input" />
    </label>
  );
}

/* ------------------------------------------------------------------------ */
/* Dialogs                                                                    */
/* ------------------------------------------------------------------------ */

function WindowDialog({ onClose, onPreset }: { onClose: () => void; onPreset: (p: ZoomPreset) => void }) {
  const w = useStore((s) => s.window);
  const setWindow = useStore((s) => s.setWindow);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const ev = useNumberEvaluator();
  const set = (p: Partial<GraphWindow>) => setWindow({ ...useStore.getState().window, ...p });
  return (
    <Dialog title="Window" onClose={onClose}>
      <div className="stack">
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <NumberField label="X min" value={w.xMin} evaluate={ev} onCommit={(v) => set({ xMin: v })} validate={(v) => (v >= useStore.getState().window.xMax ? 'Must be < X max' : null)} />
          <NumberField label="X max" value={w.xMax} evaluate={ev} onCommit={(v) => set({ xMax: v })} validate={(v) => (v <= useStore.getState().window.xMin ? 'Must be > X min' : null)} />
          <NumberField label="X scale (0 = auto)" value={w.xScl} evaluate={ev} onCommit={(v) => set({ xScl: v })} validate={(v) => (v < 0 ? 'Must be ≥ 0' : null)} />
          <NumberField label="Y min" value={w.yMin} evaluate={ev} onCommit={(v) => set({ yMin: v })} validate={(v) => (v >= useStore.getState().window.yMax ? 'Must be < Y max' : null)} />
          <NumberField label="Y max" value={w.yMax} evaluate={ev} onCommit={(v) => set({ yMax: v })} validate={(v) => (v <= useStore.getState().window.yMin ? 'Must be > Y min' : null)} />
          <NumberField label="Y scale (0 = auto)" value={w.yScl} evaluate={ev} onCommit={(v) => set({ yScl: v })} validate={(v) => (v < 0 ? 'Must be ≥ 0' : null)} />
        </div>
        {settings.graphMode !== 'func' && <ModeWindowFields />}
        <p className="muted small" style={{ margin: 0 }}>
          Fields accept expressions such as <code>-2π</code>. Scale sets grid/tick spacing; 0 chooses it automatically.
        </p>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Zoom presets</div>
          <div className="menu-grid">
            {ZOOM_PRESETS.map((z) => (
              <button key={z.id} className="menu-item" onClick={() => onPreset(z.id)}>
                <b>{z.label}</b>
                <small>{z.description}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Display</div>
          <div className="row wrap">
            <button className={`chip${settings.showGrid ? ' on' : ''}`} aria-pressed={settings.showGrid} onClick={() => updateSettings({ showGrid: !settings.showGrid })}>
              Grid
            </button>
            <button className={`chip${settings.showAxes ? ' on' : ''}`} aria-pressed={settings.showAxes} onClick={() => updateSettings({ showAxes: !settings.showAxes })}>
              Axes
            </button>
            <button className={`chip${settings.showLabels ? ' on' : ''}`} aria-pressed={settings.showLabels} onClick={() => updateSettings({ showLabels: !settings.showLabels })}>
              Labels
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function SaveDialog({ onClose }: { onClose: () => void }) {
  const saveGraph = useStore((s) => s.saveGraph);
  const functions = useStore((s) => s.functions);
  const [name, setName] = useState(() => functions.filter((f) => f.expr).map((f) => f.expr).slice(0, 2).join(', ') || 'My graph');
  const save = () => {
    saveGraph(name.trim() || 'Untitled graph');
    toast('Graph saved — find it in History');
    onClose();
  };
  return (
    <Dialog
      title="Save graph"
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
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </label>
      <p className="muted small">Saves all functions, colors and the current window on this device.</p>
    </Dialog>
  );
}

function ExamplesButton() {
  const [open, setOpen] = useState(false);
  const setFunctions = useStore((s) => s.setFunctions);
  const setWindow = useStore((s) => s.setWindow);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)} title="Load an example set of functions">
        Examples
      </button>
      {open && (
        <Dialog title="Example graphs" onClose={() => setOpen(false)}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Loading an example replaces the current functions. You can undo with Ctrl+Z or the undo button.
          </p>
          <div className="menu-grid">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.name}
                className="menu-item"
                onClick={() => {
                  const fns: GraphFn[] = ex.exprs.map((e, i) => ({ id: `${Date.now()}-${i}`, expr: e, color: PALETTE[i % PALETTE.length], visible: true }));
                  setFunctions(fns);
                  setWindow(ex.window ?? STANDARD_WINDOW);
                  setOpen(false);
                }}
              >
                <b style={{ fontFamily: 'var(--font-sans)' }}>{ex.name}</b>
                <small>{ex.exprs.join(';  ')}</small>
              </button>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Y= editor for PARAMETRIC / POLAR / SEQ modes                               */
/* ------------------------------------------------------------------------ */

function ModeFnList({ mode, errors }: { mode: ParamMode; errors: Record<string, string> }) {
  const fns = useStore((s) => s.modeFns[mode]);
  const update = useStore((s) => s.updateModeFn);
  const add = useStore((s) => s.addModeFn);
  const remove = useStore((s) => s.removeModeFn);
  const title = mode === 'par' ? 'PARAMETRIC' : mode === 'pol' ? 'POLAR' : 'SEQUENCES';
  return (
    <div className="fn-list">
      <div className="row">
        <span className="label grow">{title}</span>
      </div>
      {fns.map((fn, i) => {
        const [la, lb] = modeLabels(mode, i);
        return (
          <div key={fn.id} className={`fn-row${fn.visible ? '' : ' hidden-fn'}`}>
            <button
              className={`fn-swatch${fn.visible ? '' : ' off'}`}
              style={{ background: fn.color, color: fn.visible ? '#fff' : fn.color }}
              onClick={() => update(mode, fn.id, { visible: !fn.visible })}
              aria-label={`${la} ${fn.visible ? 'visible — hide' : 'hidden — show'}`}
              aria-pressed={fn.visible}
            >
              {fn.visible ? <IconEye width={15} height={15} /> : <IconEyeOff width={15} height={15} />}
            </button>
            <div className="fn-body">
              <div className="fn-input-row">
                <label className="fn-label" style={{ color: fn.color, minWidth: 44 }}>
                  {mode === 'seq' ? `${la}(n)=` : `${la}=`}
                </label>
                <MathInput value={fn.a} onChange={(v) => update(mode, fn.id, { a: v })} ariaLabel={`${la} equals`} placeholder={mode === 'par' ? 'e.g. 3cos(T)' : mode === 'pol' ? 'e.g. 2sin(3θ)' : 'e.g. u(n-1)+2'} invalid={!!errors[fn.id]} />
              </div>
              {lb && (
                <div className="fn-input-row">
                  <label className="fn-label" style={{ color: fn.color, minWidth: 44 }}>
                    {lb}=
                  </label>
                  <MathInput value={fn.b ?? ''} onChange={(v) => update(mode, fn.id, { b: v })} ariaLabel={`${lb} equals`} placeholder={mode === 'par' ? 'e.g. 2sin(T)' : 'start value, or {u(nMin), u(nMin+1)}'} />
                </div>
              )}
              {errors[fn.id] && <div className="error-text">{errors[fn.id]}</div>}
            </div>
            <div className="fn-actions">
              <button className="icon-btn sm" aria-label={`${mode === 'seq' ? 'Clear' : 'Delete'} ${la}`} title={mode === 'seq' ? 'Clear' : 'Delete'} onClick={() => remove(mode, fn.id)}>
                <IconTrash />
              </button>
            </div>
          </div>
        );
      })}
      {mode !== 'seq' && (
        <button className="btn" onClick={() => add(mode)} disabled={fns.length >= 6}>
          <IconPlus width={16} height={16} /> Add {mode === 'par' ? 'parametric pair' : 'polar equation'}
        </button>
      )}
      {mode === 'seq' && (
        <p className="muted small" style={{ margin: 0 }}>
          Use n for the term number and u(n−1), u(n−2) (or v, w) for earlier terms. Recursive sequences need a start value; for u(n−2) enter two, e.g. {'{1,1}'}.
        </p>
      )}
    </div>
  );
}


function ModeWindowFields() {
  const w = useStore((s) => s.window);
  const mode = useStore((s) => s.settings.graphMode);
  const deg = useStore((s) => s.settings.angle === 'deg');
  const setWindow = useStore((s) => s.setWindow);
  const ev = useNumberEvaluator();
  const W = modeWindow(w, deg);
  const set = (p: Partial<GraphWindow>) => setWindow({ ...useStore.getState().window, ...p });
  const positive = (v: number) => (v > 0 ? null : 'Must be > 0');
  if (mode === 'par')
    return (
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <NumberField label="T min" value={W.tMin} evaluate={ev} onCommit={(v) => set({ tMin: v })} />
        <NumberField label="T max" value={W.tMax} evaluate={ev} onCommit={(v) => set({ tMax: v })} />
        <NumberField label="T step" value={W.tStep} evaluate={ev} onCommit={(v) => set({ tStep: v })} validate={positive} />
      </div>
    );
  if (mode === 'pol')
    return (
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <NumberField label="θ min" value={W.thetaMin} evaluate={ev} onCommit={(v) => set({ thetaMin: v })} />
        <NumberField label="θ max" value={W.thetaMax} evaluate={ev} onCommit={(v) => set({ thetaMax: v })} />
        <NumberField label="θ step" value={W.thetaStep} evaluate={ev} onCommit={(v) => set({ thetaStep: v })} validate={positive} />
      </div>
    );
  return (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
      <NumberField label="n min" value={W.nMin} evaluate={ev} onCommit={(v) => set({ nMin: Math.round(v) })} />
      <NumberField label="n max" value={W.nMax} evaluate={ev} onCommit={(v) => set({ nMax: Math.round(v) })} validate={(v) => (v - W.nMin > 5000 ? 'At most 5000 terms' : null)} />
    </div>
  );
}
