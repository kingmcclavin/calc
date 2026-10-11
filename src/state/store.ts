import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AngleMode, Scalar } from '../math/evaluate';
import type { FormatOptions } from '../math/format';
import { EXAMPLE_PROGRAMS } from '../math/program';
import type { ModeFn, ModeWindow, ParamMode } from '../graph/modes';

export type ViewId = 'calc' | 'mode' | 'yeq' | 'graph' | 'table' | 'stats' | 'solver' | 'programs' | 'history' | 'settings';
export type ThemePref = 'dark' | 'light' | 'system';
/** What a TI-style key (Y=, WINDOW, ZOOM, TRACE, CALC, STAT PLOT) asks the target view to open. */
export type GraphIntent = 'equations' | 'window' | 'zoom' | 'trace' | 'calc' | 'graph' | 'plot';

export interface Settings {
  theme: ThemePref;
  angle: AngleMode;
  format: FormatOptions;
  showGrid: boolean;
  showAxes: boolean;
  showLabels: boolean;
  lineWidth: number;
  /** Use the on-screen keypad instead of the system keyboard on touch devices */
  keypadOnly: boolean;
  // ---- TI-84 MODE screen ----
  /** MATHPRINT (typeset) or CLASSIC (one-line text) */
  display: 'mathprint' | 'classic';
  /** FUNCTION / PARAMETRIC / POLAR / SEQ graphing */
  graphMode: GraphMode;
  graphStyle: 'thick' | 'dot-thick' | 'thin' | 'dot-thin';
  /** SEQUENTIAL draws graphs one after another, SIMUL all at once */
  drawOrder: 'sequential' | 'simul';
  /** REAL, a+bi or re^(θi) */
  complex: 'real' | 'rect' | 'polar';
  /** FULL, HORIZONTAL (graph over home screen) or GRAPH-TABLE */
  split: 'full' | 'horiz' | 'graph-table';
  statDiagnostics: boolean;
  statWizards: boolean;
}

export type GraphMode = 'func' | 'par' | 'pol' | 'seq';

export interface HistoryEntry {
  id: string;
  /** Program output lines: 'text' (left aligned) or 'value' (right aligned) */
  kind?: 'text' | 'value';
  text?: string;
  input: string;
  inputTex: string;
  resultTex?: string;
  approxTex?: string;
  resultText?: string;
  exact?: boolean;
  error?: string;
  errorKind?: string;
  time: number;
}

export interface Program {
  id: string;
  name: string;
  source: string;
  updatedAt: number;
}

export interface GraphFn {
  id: string;
  expr: string;
  color: string;
  visible: boolean;
}

export interface GraphWindow extends ModeWindow {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xScl: number; // 0 = automatic
  yScl: number;
}

export interface SavedGraph {
  id: string;
  name: string;
  functions: GraphFn[];
  window: GraphWindow;
  savedAt: number;
}

/** Serializable form of a Scalar (BigInt cannot go into JSON). */
export interface StoredScalar {
  n: number;
  rn?: string;
  rd?: string;
}

export const LIST_NAMES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
export type ListName = (typeof LIST_NAMES)[number];

export const PALETTE = ['#4f8cff', '#ff5d73', '#22b07d', '#f5a524', '#a874ff', '#00a3c4', '#ff7a45', '#d850b8', '#6fae3f', '#8792a8'];

export const STANDARD_WINDOW: GraphWindow = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, xScl: 0, yScl: 0 };

let lastTime = 0;
/** Strictly increasing timestamp for history entries (so ClrHome can split entries made in the same millisecond). */
export const nextTime = () => (lastTime = Math.max(Date.now(), lastTime + 1));

let idCounter = 0;
export const uid = () => `${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function toStored(s: Scalar): StoredScalar {
  return s.r ? { n: s.n, rn: s.r.n.toString(), rd: s.r.d.toString() } : { n: s.n };
}
export function fromStored(s: StoredScalar): Scalar {
  return { kind: 'scalar', n: s.n, r: s.rn !== undefined && s.rd !== undefined ? { n: BigInt(s.rn), d: BigInt(s.rd) } : null };
}

const SAMPLE_FUNCTIONS: GraphFn[] = [
  { id: 'f1', expr: 'x^2-4', color: PALETTE[0], visible: true },
  { id: 'f2', expr: '3sin(x)', color: PALETTE[1], visible: true },
  { id: 'f3', expr: '0.5x+1', color: PALETTE[2], visible: true },
];

const SAMPLE_LISTS: Record<ListName, number[]> = {
  // Hours studied vs. test score — a classic regression sample
  L1: [1, 2, 3, 4, 5, 6, 7, 8],
  L2: [52, 55, 61, 64, 70, 74, 79, 85],
  L3: [],
  L4: [],
  L5: [],
  L6: [],
};

interface Snapshot {
  functions: GraphFn[];
}

export interface AppState {
  view: ViewId;
  settings: Settings;
  // Calculator
  input: string;
  history: HistoryEntry[];
  vars: Record<string, StoredScalar>;
  // Graphing
  functions: GraphFn[];
  window: GraphWindow;
  savedGraphs: SavedGraph[];
  tableStart: number;
  tableStep: number;
  // Statistics
  lists: Record<ListName, number[]>;
  /** Entries for PARAMETRIC, POLAR and SEQ graph modes */
  modeFns: Record<ParamMode, ModeFn[]>;
  // Programs
  programs: Program[];
  editProgramId: string | null;
  runRequest: string | null;
  /** History entries older than this are hidden from the calculator screen (ClrHome / CLEAR) */
  screenFrom: number;
  // Cross-view requests (not persisted)
  traceRequest: { fnId: string; x: number } | null;
  intent: GraphIntent | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];

  setView: (v: ViewId) => void;
  navigate: (v: ViewId, intent?: GraphIntent) => void;
  clearIntent: () => void;
  updateSettings: (p: Partial<Settings>) => void;
  setInput: (s: string) => void;
  addHistory: (e: HistoryEntry) => void;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
  setVar: (name: string, v: Scalar) => void;

  setFunctions: (fns: GraphFn[], opts?: { coalesce?: boolean }) => void;
  updateFunction: (id: string, p: Partial<GraphFn>) => void;
  addFunction: (expr?: string) => string | null;
  removeFunction: (id: string) => void;
  moveFunction: (id: string, dir: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  setWindow: (w: GraphWindow) => void;
  saveGraph: (name: string) => void;
  loadGraph: (id: string) => void;
  deleteGraph: (id: string) => void;
  setTable: (start: number, step: number) => void;
  setList: (name: ListName, values: number[]) => void;
  updateModeFn: (mode: ParamMode, id: string, p: Partial<ModeFn>) => void;
  addModeFn: (mode: ParamMode) => void;
  removeModeFn: (mode: ParamMode, id: string) => void;
  addProgram: (name: string, source?: string) => string;
  updateProgram: (id: string, p: Partial<Omit<Program, 'id'>>) => void;
  deleteProgram: (id: string) => void;
  openProgram: (id: string | null) => void;
  requestRun: (name: string) => void;
  clearRunRequest: () => void;
  clearScreen: () => void;
  requestTrace: (fnId: string, x: number) => void;
  clearTraceRequest: () => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  angle: 'rad',
  format: { mode: 'float', digits: 10, notation: 'normal', answers: 'auto', fracType: 'nd' },
  showGrid: true,
  showAxes: true,
  showLabels: true,
  lineWidth: 2.5,
  keypadOnly: true,
  display: 'mathprint',
  graphMode: 'func',
  graphStyle: 'thick',
  drawOrder: 'sequential',
  complex: 'real',
  split: 'full',
  statDiagnostics: true,
  statWizards: true,
};

const MAX_HISTORY = 300;
const MAX_FUNCTIONS = 10;

let lastCoalesce = 0;

function initialData() {
  return {
    view: 'calc' as ViewId,
    settings: DEFAULT_SETTINGS,
    input: '',
    history: [] as HistoryEntry[],
    vars: {} as Record<string, StoredScalar>,
    functions: SAMPLE_FUNCTIONS,
    window: STANDARD_WINDOW,
    savedGraphs: [] as SavedGraph[],
    tableStart: -5,
    tableStep: 1,
    lists: SAMPLE_LISTS,
    modeFns: {
      par: [{ id: 'p1', a: '3cos(T)', b: '2sin(T)', color: PALETTE[0], visible: true }],
      pol: [{ id: 'r1', a: '4sin(3θ)', color: PALETTE[1], visible: true }],
      seq: [
        { id: 's1', a: '0.5u(n-1)+3', b: '1', color: PALETTE[2], visible: true },
        { id: 's2', a: '', b: '', color: PALETTE[3], visible: true },
        { id: 's3', a: '', b: '', color: PALETTE[4], visible: true },
      ],
    } as Record<ParamMode, ModeFn[]>,
    programs: EXAMPLE_PROGRAMS.map((p, i) => ({ id: `ex${i}`, name: p.name, source: p.source, updatedAt: 0 })),
    editProgramId: null as string | null,
    screenFrom: 0,
  };
}

/** localStorage wrapped so private mode / quota errors never crash the app. */
const safeStorage = createJSONStorage(() => ({
  getItem: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage full or unavailable */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
}));

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const pushUndo = (coalesce = false) => {
        const now = Date.now();
        const st = get();
        if (coalesce && now - lastCoalesce < 800 && st.undoStack.length) {
          lastCoalesce = now;
          return { redoStack: [] as Snapshot[] };
        }
        lastCoalesce = coalesce ? now : 0;
        return { undoStack: [...st.undoStack.slice(-99), { functions: st.functions }], redoStack: [] as Snapshot[] };
      };

      return {
        ...initialData(),
        traceRequest: null,
        intent: null,
        runRequest: null,
        undoStack: [],
        redoStack: [],

        setView: (view) => set({ view }),
        navigate: (view, intent) => set({ view, intent: intent ?? null }),
        clearIntent: () => set({ intent: null }),
        updateSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
        setInput: (input) => set({ input }),
        addHistory: (e) => set((s) => ({ history: [...s.history, e].slice(-MAX_HISTORY) })),
        removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
        clearHistory: () => set({ history: [] }),
        setVar: (name, v) => set((s) => ({ vars: { ...s.vars, [name]: toStored(v) } })),

        setFunctions: (functions, opts) => set({ ...pushUndo(opts?.coalesce), functions }),
        updateFunction: (id, p) =>
          set((s) => ({ ...pushUndo('expr' in p), functions: s.functions.map((f) => (f.id === id ? { ...f, ...p } : f)) })),
        addFunction: (expr = '') => {
          const s = get();
          if (s.functions.length >= MAX_FUNCTIONS) return null;
          const used = new Set(s.functions.map((f) => f.color));
          const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[s.functions.length % PALETTE.length];
          const id = uid();
          set({ ...pushUndo(), functions: [...s.functions, { id, expr, color, visible: true }] });
          return id;
        },
        removeFunction: (id) => set((s) => ({ ...pushUndo(), functions: s.functions.filter((f) => f.id !== id) })),
        moveFunction: (id, dir) =>
          set((s) => {
            const i = s.functions.findIndex((f) => f.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= s.functions.length) return {};
            const fns = [...s.functions];
            [fns[i], fns[j]] = [fns[j], fns[i]];
            return { ...pushUndo(), functions: fns };
          }),
        undo: () =>
          set((s) => {
            const prev = s.undoStack[s.undoStack.length - 1];
            if (!prev) return {};
            lastCoalesce = 0;
            return { functions: prev.functions, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, { functions: s.functions }] };
          }),
        redo: () =>
          set((s) => {
            const next = s.redoStack[s.redoStack.length - 1];
            if (!next) return {};
            lastCoalesce = 0;
            return { functions: next.functions, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, { functions: s.functions }] };
          }),
        setWindow: (window) => set({ window }),
        saveGraph: (name) =>
          set((s) => ({
            savedGraphs: [{ id: uid(), name, functions: s.functions, window: s.window, savedAt: Date.now() }, ...s.savedGraphs],
          })),
        loadGraph: (id) =>
          set((s) => {
            const g = s.savedGraphs.find((x) => x.id === id);
            if (!g) return {};
            return { ...pushUndo(), functions: g.functions.map((f) => ({ ...f })), window: g.window };
          }),
        deleteGraph: (id) => set((s) => ({ savedGraphs: s.savedGraphs.filter((g) => g.id !== id) })),
        setTable: (tableStart, tableStep) => set({ tableStart, tableStep }),
        setList: (name, values) => set((s) => ({ lists: { ...s.lists, [name]: values } })),
        updateModeFn: (mode, id, p) =>
          set((s) => ({ modeFns: { ...s.modeFns, [mode]: s.modeFns[mode].map((f) => (f.id === id ? { ...f, ...p } : f)) } })),
        addModeFn: (mode) =>
          set((s) => {
            const list = s.modeFns[mode];
            if (mode === 'seq' || list.length >= 6) return {};
            const used = new Set(list.map((f) => f.color));
            const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[list.length % PALETTE.length];
            return { modeFns: { ...s.modeFns, [mode]: [...list, { id: uid(), a: '', b: mode === 'par' ? '' : undefined, color, visible: true }] } };
          }),
        removeModeFn: (mode, id) =>
          set((s) => ({
            modeFns: {
              ...s.modeFns,
              // sequences keep their three slots (u, v, w); clearing empties them
              [mode]: mode === 'seq' ? s.modeFns.seq.map((f) => (f.id === id ? { ...f, a: '', b: '' } : f)) : s.modeFns[mode].filter((f) => f.id !== id),
            },
          })),
        addProgram: (name, source = '') => {
          const id = uid();
          set((s) => ({ programs: [...s.programs, { id, name, source, updatedAt: Date.now() }], editProgramId: id }));
          return id;
        },
        updateProgram: (id, p) => set((s) => ({ programs: s.programs.map((g) => (g.id === id ? { ...g, ...p, updatedAt: Date.now() } : g)) })),
        deleteProgram: (id) => set((s) => ({ programs: s.programs.filter((g) => g.id !== id), editProgramId: s.editProgramId === id ? null : s.editProgramId })),
        openProgram: (id) => set({ editProgramId: id, view: 'programs' }),
        requestRun: (name) => set({ runRequest: name, view: 'calc' }),
        clearRunRequest: () => set({ runRequest: null }),
        clearScreen: () => set({ screenFrom: nextTime() }),
        requestTrace: (fnId, x) => set({ traceRequest: { fnId, x }, view: 'graph' }),
        clearTraceRequest: () => set({ traceRequest: null }),
        resetAll: () => {
          set({ ...initialData(), traceRequest: null, runRequest: null, undoStack: [], redoStack: [] });
        },
      };
    },
    {
      name: 'lumen84-state',
      version: 1,
      storage: safeStorage,
      partialize: (s) => ({
        view: s.view,
        settings: s.settings,
        input: s.input,
        history: s.history,
        vars: s.vars,
        functions: s.functions,
        window: s.window,
        savedGraphs: s.savedGraphs,
        tableStart: s.tableStart,
        tableStep: s.tableStep,
        lists: s.lists,
        programs: s.programs,
        modeFns: s.modeFns,
        editProgramId: s.editProgramId,
        screenFrom: s.screenFrom,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...(p.settings ?? {}), format: { ...current.settings.format, ...(p.settings?.format ?? {}) } },
          lists: { ...current.lists, ...(p.lists ?? {}) },
          modeFns: { ...current.modeFns, ...(p.modeFns ?? {}) },
        };
      },
    },
  ),
);
