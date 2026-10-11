import { useEffect, type ComponentType, type SVGProps } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IconCalc, IconGraph, IconHistory, IconMoon, IconSettings, IconProgram, IconSolver, IconStats, IconSun, IconTable } from './components/Icons';
import { ToastHost } from './components/ui';
import { DeviceKeypad } from './components/DeviceKeypad';
import { useStore, type ViewId } from './state/store';
import { CalculateView } from './views/CalculateView';
import { GraphView } from './views/GraphView';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';
import { ProgramsView } from './views/ProgramsView';
import { SolverView } from './views/SolverView';
import { StatsView } from './views/StatsView';
import { TableView } from './views/TableView';

interface NavItem {
  id: ViewId;
  label: string;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut: string;
}

const NAV: NavItem[] = [
  { id: 'calc', label: 'Calculate', title: 'Scientific calculator', icon: IconCalc, shortcut: '1' },
  { id: 'graph', label: 'Graph', title: 'Functions & graph', icon: IconGraph, shortcut: '2' },
  { id: 'table', label: 'Table', title: 'Function table', icon: IconTable, shortcut: '3' },
  { id: 'stats', label: 'Stats', title: 'Statistics', icon: IconStats, shortcut: '4' },
  { id: 'solver', label: 'Solver', title: 'Equation solver', icon: IconSolver, shortcut: '5' },
  { id: 'programs', label: 'Programs', title: 'Write and run programs', icon: IconProgram, shortcut: '6' },
  { id: 'history', label: 'History', title: 'History & saved graphs', icon: IconHistory, shortcut: '7' },
  { id: 'settings', label: 'Settings', title: 'Settings', icon: IconSettings, shortcut: '8' },
];

const SUBTITLES: Record<ViewId, string> = {
  calc: 'Scientific calculator',
  graph: 'Functions & interactive graph',
  table: 'Function values',
  stats: 'Lists, statistics & regression',
  solver: 'Equations & systems',
  programs: 'TI-BASIC-style programs',
  history: 'History & saved graphs',
  settings: 'Preferences',
};

function useThemeEffect() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const t = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.setAttribute('data-theme', t);
      document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', t === 'light' ? '#f3f4f8' : '#0a0d13');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const angle = useStore((s) => s.settings.angle);
  const theme = useStore((s) => s.settings.theme);
  const updateSettings = useStore((s) => s.updateSettings);
  useThemeEffect();

  // Alt+1…8 switches sections
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const item = NAV.find((n) => e.code === `Digit${n.shortcut}`);
      if (item) {
        e.preventDefault();
        setView(item.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  const current = NAV.find((n) => n.id === view) ?? NAV[0];
  const isDark = theme === 'dark' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);

  const navButton = (n: NavItem) => (
    <button
      key={n.id}
      className="nav-btn"
      aria-current={view === n.id ? 'page' : undefined}
      onClick={() => setView(n.id)}
      title={`${n.title} (Alt+${n.shortcut})`}
    >
      <n.icon />
      <span>{n.label}</span>
    </button>
  );

  return (
    <div className={`app${view === 'calc' ? ' on-calc' : ''}`}>
      <nav className="sidebar" aria-label="Sections">
        <div className="brand" title="Lumen Graphing Calculator">
          <div className="brand-mark">L</div>
        </div>
        {NAV.slice(0, 6).map(navButton)}
        <div className="spacer" />
        {NAV.slice(6).map(navButton)}
      </nav>

      <div className={`main${view === 'calc' ? ' calc-mode' : ''}`}>
        <header className="topbar">
          <div>
            <h1>{current.label === 'Calculate' ? 'Lumen' : current.label}</h1>
          </div>
          <span className="sub desktop-only">{SUBTITLES[view]}</span>
          <div className="grow" />
          <button
            className="chip on"
            onClick={() => updateSettings({ angle: angle === 'rad' ? 'deg' : 'rad' })}
            title="Angle mode — click to switch between radians and degrees"
            aria-label={`Angle mode ${angle === 'rad' ? 'radians' : 'degrees'}. Switch.`}
          >
            {angle === 'rad' ? 'RAD' : 'DEG'}
          </button>
          <button
            className="icon-btn"
            onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
        </header>

        <div className="workspace">
          <div className="screen-frame">
            {view !== 'calc' && (
              /* On phones the section name sits at the top of the screen, like a TI-84 menu title */
              <div className="screen-title mobile-only-flex">
                <button className="btn ghost sm" onClick={() => setView('calc')} aria-label="Back to the home screen">
                  ‹ Home
                </button>
                <span>{current.label}</span>
              </div>
            )}
            <main className={`view${view === 'calc' || view === 'graph' ? '' : ' scroll'}`} id="main">
              <ErrorBoundary inline key={view}>
                {view === 'calc' && <CalculateView />}
                {view === 'graph' && <GraphView />}
                {view === 'table' && <TableView />}
                {view === 'stats' && <StatsView />}
                {view === 'solver' && <SolverView />}
                {view === 'history' && <HistoryView />}
                {view === 'settings' && <SettingsView />}
                {view === 'programs' && <ProgramsView />}
              </ErrorBoundary>
            </main>
          </div>
          {/* The keypad never disappears — every section is shown on the "screen" above/beside it */}
          <DeviceKeypad />
        </div>
      </div>

      <ToastHost />
    </div>
  );
}
