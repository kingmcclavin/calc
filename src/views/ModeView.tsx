import { useEffect, useState } from 'react';
import { activeField, useKeypadHandler } from '../components/DeviceKeypad';
import { useStore, type Settings } from '../state/store';

/**
 * The TI-84 MODE screen: one row per setting, the active option highlighted.
 * ▲▼ choose a row, ◀▶ move between options, ENTER (or a tap) selects.
 */
interface Option {
  label: string;
  /** true when this option is the current setting */
  active: (s: Settings) => boolean;
  apply: (s: Settings) => Partial<Settings>;
}
interface Row {
  title?: string;
  /** shown in accent colour like the TI's lower MODE rows */
  labelled?: boolean;
  options: Option[];
  readOnly?: boolean;
}

const fmt = (s: Settings, p: Partial<Settings['format']>): Partial<Settings> => ({ format: { ...s.format, ...p } });

const ROWS: Row[] = [
  {
    options: [
      { label: 'MATHPRINT', active: (s) => s.display === 'mathprint', apply: () => ({ display: 'mathprint' }) },
      { label: 'CLASSIC', active: (s) => s.display === 'classic', apply: () => ({ display: 'classic' }) },
    ],
  },
  {
    options: (['normal', 'sci', 'eng'] as const).map((n) => ({
      label: n.toUpperCase(),
      active: (s: Settings) => (s.format.notation ?? 'normal') === n,
      apply: (s: Settings) => fmt(s, { notation: n }),
    })),
  },
  {
    options: [
      { label: 'FLOAT', active: (s) => s.format.mode === 'float', apply: (s) => fmt(s, { mode: 'float', digits: 10 }) },
      ...Array.from({ length: 10 }, (_, d) => ({
        label: String(d),
        active: (s: Settings) => s.format.mode === 'fix' && s.format.digits === d,
        apply: (s: Settings) => fmt(s, { mode: 'fix', digits: d }),
      })),
    ],
  },
  {
    options: [
      { label: 'RADIAN', active: (s) => s.angle === 'rad', apply: () => ({ angle: 'rad' }) },
      { label: 'DEGREE', active: (s) => s.angle === 'deg', apply: () => ({ angle: 'deg' }) },
    ],
  },
  {
    options: (
      [
        ['FUNCTION', 'func'],
        ['PARAMETRIC', 'par'],
        ['POLAR', 'pol'],
        ['SEQ', 'seq'],
      ] as const
    ).map(([label, m]) => ({ label, active: (s: Settings) => s.graphMode === m, apply: () => ({ graphMode: m }) })),
  },
  {
    options: (
      [
        ['THICK', 'thick'],
        ['DOT-THICK', 'dot-thick'],
        ['THIN', 'thin'],
        ['DOT-THIN', 'dot-thin'],
      ] as const
    ).map(([label, v]) => ({ label, active: (s: Settings) => s.graphStyle === v, apply: () => ({ graphStyle: v }) })),
  },
  {
    options: [
      { label: 'SEQUENTIAL', active: (s) => s.drawOrder === 'sequential', apply: () => ({ drawOrder: 'sequential' }) },
      { label: 'SIMUL', active: (s) => s.drawOrder === 'simul', apply: () => ({ drawOrder: 'simul' }) },
    ],
  },
  {
    options: (
      [
        ['REAL', 'real'],
        ['a+bi', 'rect'],
        ['re^(θi)', 'polar'],
      ] as const
    ).map(([label, v]) => ({ label, active: (s: Settings) => s.complex === v, apply: () => ({ complex: v }) })),
  },
  {
    options: (
      [
        ['FULL', 'full'],
        ['HORIZONTAL', 'horiz'],
        ['GRAPH-TABLE', 'graph-table'],
      ] as const
    ).map(([label, v]) => ({ label, active: (s: Settings) => s.split === v, apply: () => ({ split: v }) })),
  },
  {
    title: 'FRACTION TYPE:',
    labelled: true,
    options: [
      { label: 'n/d', active: (s) => (s.format.fracType ?? 'nd') === 'nd', apply: (s) => fmt(s, { fracType: 'nd' }) },
      { label: 'Un/d', active: (s) => s.format.fracType === 'mixed', apply: (s) => fmt(s, { fracType: 'mixed' }) },
    ],
  },
  {
    title: 'ANSWERS:',
    labelled: true,
    options: [
      { label: 'AUTO', active: (s) => (s.format.answers ?? 'auto') === 'auto', apply: (s) => fmt(s, { answers: 'auto' }) },
      { label: 'DEC', active: (s) => s.format.answers === 'dec', apply: (s) => fmt(s, { answers: 'dec' }) },
    ],
  },
  {
    title: 'STAT DIAGNOSTICS:',
    labelled: true,
    options: [
      { label: 'OFF', active: (s) => !s.statDiagnostics, apply: () => ({ statDiagnostics: false }) },
      { label: 'ON', active: (s) => s.statDiagnostics, apply: () => ({ statDiagnostics: true }) },
    ],
  },
  {
    title: 'STAT WIZARDS:',
    labelled: true,
    options: [
      { label: 'ON', active: (s) => s.statWizards, apply: () => ({ statWizards: true }) },
      { label: 'OFF', active: (s) => !s.statWizards, apply: () => ({ statWizards: false }) },
    ],
  },
  {
    title: 'THEME:',
    labelled: true,
    options: (['dark', 'light', 'system'] as const).map((t) => ({
      label: t.toUpperCase(),
      active: (s: Settings) => s.theme === t,
      apply: () => ({ theme: t }),
    })),
  },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function ModeView() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const now = useClock();
  const [cursor, setCursor] = useState({ row: 0, col: 0 });

  const activeCol = (r: number) => Math.max(0, ROWS[r].options.findIndex((o) => o.active(settings)));
  const select = (r: number, c: number) => {
    setCursor({ row: r, col: c });
    update(ROWS[r].options[c].apply(useStore.getState().settings));
  };
  const move = (dr: number, dc: number) => {
    setCursor(({ row, col }) => {
      if (dr) {
        const r = Math.min(ROWS.length - 1, Math.max(0, row + dr));
        return { row: r, col: activeCol(r) };
      }
      const n = ROWS[row].options.length;
      return { row, col: (col + dc + n) % n };
    });
  };

  // Start on the selected option of the first row
  useEffect(() => setCursor({ row: 0, col: activeCol(0) }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the cursor row on screen
  useEffect(() => {
    document.querySelector(`[data-mode-row="${cursor.row}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor.row]);

  useKeypadHandler((a) => {
    if (activeField()) return false;
    if (a.type === 'scroll') move(a.dir, 0);
    else if (a.type === 'left') move(0, -1);
    else if (a.type === 'right') move(0, 1);
    else if (a.type === 'enter') select(cursor.row, cursor.col);
    else return false;
    return true;
  });

  // Physical keyboard: arrows + Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (activeField()) return;
      const map: Record<string, () => void> = {
        ArrowUp: () => move(-1, 0),
        ArrowDown: () => move(1, 0),
        ArrowLeft: () => move(0, -1),
        ArrowRight: () => move(0, 1),
        Enter: () => select(cursor.row, cursor.col),
      };
      if (map[e.key]) {
        e.preventDefault();
        map[e.key]();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const date = now.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="mode-screen" role="listbox" aria-label="Mode settings">
      <StatusBar />
      <div className="mode-rows">
        {ROWS.map((row, r) => (
          <div key={r} className={`mode-row${cursor.row === r ? ' current' : ''}`} data-mode-row={r} role="group" aria-label={row.title ?? row.options.map((o) => o.label).join(' ')}>
            {row.title && <span className="mode-title">{row.title}</span>}
            {row.options.map((o, c) => (
              <button
                key={o.label}
                type="button"
                role="option"
                aria-selected={o.active(settings)}
                className={`mode-opt${o.active(settings) ? ' on' : ''}${cursor.row === r && cursor.col === c ? ' cursor' : ''}`}
                onClick={() => select(r, c)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ))}
        <div className="mode-row" data-mode-row={ROWS.length}>
          <span className="mode-title">SET CLOCK</span>
          <span className="mode-opt on" title="Lumen uses your device's clock">
            {date} {time}
          </span>
        </div>
        <div className="mode-row">
          <span className="mode-title">LANGUAGE:</span>
          <span className="mode-opt on">ENGLISH</span>
        </div>
      </div>
    </div>
  );
}

/** TI-style status line: NORMAL FLOAT AUTO REAL RADIAN MP */
export function StatusBar() {
  const s = useStore((st) => st.settings);
  const parts = [
    (s.format.notation ?? 'normal').toUpperCase(),
    s.format.mode === 'float' ? 'FLOAT' : `FIX${s.format.digits}`,
    (s.format.answers ?? 'auto').toUpperCase(),
    s.complex === 'real' ? 'REAL' : s.complex === 'rect' ? 'a+bi' : 're^θi',
    s.angle === 'rad' ? 'RADIAN' : 'DEGREE',
    s.display === 'mathprint' ? 'MP' : 'CL',
  ];
  return (
    <div className="ti-status" aria-label={`Mode: ${parts.join(' ')}`}>
      {parts.join(' ')}
    </div>
  );
}
