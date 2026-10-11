import { useMemo, useRef, useState } from 'react';
import { IconLeft, IconPlus, IconTrash } from '../components/Icons';
import { Dialog, toast } from '../components/ui';
import { checkProgram, EXAMPLE_PROGRAMS, PROGRAM_NAME_RE } from '../math/program';
import { useStore, type Program } from '../state/store';

const COMMANDS: Array<{ label: string; insert: string; title: string }> = [
  { label: 'Disp', insert: 'Disp ', title: 'Disp item[,item…] — show text ("HI") or values' },
  { label: 'Input', insert: 'Input "?",', title: 'Input "PROMPT",A — ask for a value' },
  { label: 'Prompt', insert: 'Prompt ', title: 'Prompt A,B — ask for each variable' },
  { label: 'If', insert: 'If ', title: 'If condition — the next line runs only when it is true' },
  { label: 'Then', insert: 'Then', title: 'Starts an If block (ends with End)' },
  { label: 'Else', insert: 'Else', title: 'Runs when the If condition is false' },
  { label: 'End', insert: 'End', title: 'Ends If/For/While/Repeat' },
  { label: 'For(', insert: 'For(I,1,10)', title: 'For(var,start,end[,step]) … End' },
  { label: 'While', insert: 'While ', title: 'While condition … End' },
  { label: 'Repeat', insert: 'Repeat ', title: 'Repeat condition … End (runs until true)' },
  { label: 'Lbl', insert: 'Lbl ', title: 'Lbl A — a label for Goto' },
  { label: 'Goto', insert: 'Goto ', title: 'Goto A — jump to a label' },
  { label: 'Pause', insert: 'Pause', title: 'Wait for ENTER (Pause item shows it first)' },
  { label: 'ClrHome', insert: 'ClrHome', title: 'Clear the calculator screen' },
  { label: 'Stop', insert: 'Stop', title: 'End the program' },
  { label: 'Return', insert: 'Return', title: 'Return from a called program' },
  { label: 'prgm', insert: 'prgm', title: 'prgmNAME — run another program' },
  { label: '→', insert: '→', title: 'Store: 5→A' },
  { label: '=', insert: '=', title: 'Equal (1 if true, 0 if false)' },
  { label: '≠', insert: '≠', title: 'Not equal' },
  { label: '<', insert: '<', title: 'Less than' },
  { label: '>', insert: '>', title: 'Greater than' },
  { label: '≤', insert: '≤', title: 'Less than or equal' },
  { label: '≥', insert: '≥', title: 'Greater than or equal' },
  { label: 'and', insert: ' and ', title: 'Both conditions true' },
  { label: 'or', insert: ' or ', title: 'Either condition true' },
  { label: 'not(', insert: 'not(', title: 'Logical not' },
  { label: '" "', insert: '""', title: 'Text in quotes (for Disp / Input)' },
  { label: ':', insert: ':', title: 'Put several statements on one line' },
];

export function ProgramsView() {
  const programs = useStore((s) => s.programs);
  const editId = useStore((s) => s.editProgramId);
  const openProgram = useStore((s) => s.openProgram);
  const [showNew, setShowNew] = useState(false);
  const current = programs.find((p) => p.id === editId) ?? null;
  const sorted = useMemo(() => [...programs].sort((a, b) => a.name.localeCompare(b.name)), [programs]);

  return (
    <div className={`page programs-page${current ? ' editing' : ''}`}>
      <div className="programs-layout">
        <section className="card programs-list" aria-label="Programs">
          <div className="card-head">
            <h2>Programs</h2>
            <span className="grow" />
            <button className="btn sm primary" onClick={() => setShowNew(true)}>
              <IconPlus width={14} height={14} /> New
            </button>
          </div>
          <div className="card-body stack" style={{ gap: 6 }}>
            {sorted.length === 0 && <div className="empty">No programs yet.</div>}
            {sorted.map((p) => {
              const err = checkProgram(p.source);
              return (
                <button key={p.id} className="result-item" aria-pressed={p.id === editId} onClick={() => openProgram(p.id)}>
                  <span className="grow" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {p.name}
                  </span>
                  <span className="muted small">{p.source.split('\n').length} lines</span>
                  {err && <span className="badge approx">error</span>}
                </button>
              );
            })}
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              Run a program from the calculator with <b>PRGM ▸ EXEC</b>, or type <code>prgmNAME</code> and press ENTER.
            </p>
          </div>
        </section>

        {current ? (
          <Editor key={current.id} program={current} onBack={() => openProgram(null)} />
        ) : (
          <section className="card programs-help">
            <div className="card-body">
              <Reference />
            </div>
          </section>
        )}
      </div>
      {showNew && <NewProgramDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}

function nameProblem(name: string, programs: Program[], selfId?: string): string | null {
  if (!name) return 'Enter a name';
  if (!PROGRAM_NAME_RE.test(name)) return 'Up to 8 letters/digits, starting with a letter';
  if (programs.some((p) => p.name === name && p.id !== selfId)) return 'A program with this name already exists';
  return null;
}

function NewProgramDialog({ onClose }: { onClose: () => void }) {
  const programs = useStore((s) => s.programs);
  const addProgram = useStore((s) => s.addProgram);
  const [name, setName] = useState('');
  const upper = name.toUpperCase();
  const problem = name ? nameProblem(upper, programs) : null;
  const create = (source = '') => {
    if (nameProblem(upper, programs)) return;
    addProgram(upper, source);
    onClose();
  };
  return (
    <Dialog
      title="New program"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!upper || !!problem} onClick={() => create()}>
            Create
          </button>
        </>
      }
    >
      <div className="stack">
        <label className="field">
          <span>Name</span>
          <input className={`input${problem ? ' invalid' : ''}`} value={name} maxLength={8} autoCapitalize="characters" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="e.g. AREA" />
        </label>
        {problem && <div className="error-text">{problem}</div>}
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Or start from an example</div>
          <div className="menu-grid">
            {EXAMPLE_PROGRAMS.map((ex) => (
              <button
                key={ex.name}
                className="menu-item"
                onClick={() => {
                  let n = ex.name;
                  for (let i = 2; programs.some((p) => p.name === n); i++) n = `${ex.name}${i}`;
                  addProgram(n, ex.source);
                  onClose();
                }}
              >
                <b>{ex.name}</b>
                <small>{ex.source.split('\n')[0]}</small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Editor({ program, onBack }: { program: Program; onBack: () => void }) {
  const programs = useStore((s) => s.programs);
  const updateProgram = useStore((s) => s.updateProgram);
  const deleteProgram = useStore((s) => s.deleteProgram);
  const requestRun = useStore((s) => s.requestRun);
  const [nameText, setNameText] = useState(program.name);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const error = useMemo(() => checkProgram(program.source), [program.source]);
  const lines = program.source.split('\n').length;
  const nameErr = nameProblem(nameText.toUpperCase(), programs, program.id);

  const insert = (text: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const next = value.slice(0, a) + text + value.slice(b);
    updateProgram(program.id, { source: next });
    const caret = a + (text === '""' ? 1 : text.length);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const commitName = () => {
    const upper = nameText.toUpperCase();
    if (!nameErr && upper !== program.name) {
      updateProgram(program.id, { name: upper });
      toast(`Renamed to ${upper}`);
    }
    setNameText(nameErr ? program.name : upper);
  };

  return (
    <section className="card program-editor" aria-label={`Editing ${program.name}`}>
      <div className="card-head" style={{ flexWrap: 'wrap' }}>
        <button className="icon-btn sm mobile-only" aria-label="Back to the program list" onClick={onBack}>
          <IconLeft />
        </button>
        <span className="label">PROGRAM</span>
        <input
          className={`input${nameErr ? ' invalid' : ''}`}
          style={{ width: 130, fontWeight: 700 }}
          value={nameText}
          maxLength={8}
          aria-label="Program name"
          autoCapitalize="characters"
          onChange={(e) => setNameText(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="grow" />
        <button className="btn primary sm" disabled={!!error} title={error ? 'Fix the syntax error first' : 'Run on the calculator screen'} onClick={() => requestRun(program.name)}>
          ▶ Run
        </button>
        <button
          className="icon-btn sm"
          aria-label={`Delete ${program.name}`}
          title="Delete program"
          onClick={() => {
            if (confirm(`Delete program ${program.name}?`)) deleteProgram(program.id);
          }}
        >
          <IconTrash />
        </button>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        <div className="cmd-bar" role="toolbar" aria-label="Insert command">
          {COMMANDS.map((c) => (
            <button key={c.label} type="button" title={c.title} onPointerDown={(e) => e.preventDefault()} onClick={() => insert(c.insert)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="code-editor">
          <div className="code-gutter" ref={gutterRef} aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className={error?.line === i + 1 ? 'bad' : undefined}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={taRef}
            className="code-area"
            value={program.source}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            aria-label={`Source code of ${program.name}`}
            aria-invalid={!!error}
            onChange={(e) => updateProgram(program.id, { source: e.target.value.replace(/->/g, '→') })}
            onScroll={(e) => {
              if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
          />
        </div>
        {error ? (
          <div className="error-text" role="status">
            {error.line ? `Line ${error.line}: ` : ''}
            {error.message}
          </div>
        ) : (
          <div className="small" style={{ color: 'var(--success)' }} role="status">
            ✓ No syntax errors
          </div>
        )}
        <details>
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Command reference
          </summary>
          <Reference />
        </details>
      </div>
    </section>
  );
}

function Reference() {
  return (
    <div className="stack small" style={{ gap: 8 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>Writing programs</h3>
      <p className="muted" style={{ margin: 0 }}>
        Programs use a TI-BASIC-style language: one statement per line (or several separated by <code>:</code>). They read and change the same
        variables (A–Z, θ, x, Ans) and lists (L1–L6) as the calculator.
      </p>
      <div className="shortcut-list">
        {[
          ['expr→A', 'Store a value (→ or ->)'],
          ['Disp "TEXT",A', 'Show text and values'],
          ['Input "R?",R', 'Ask for a value'],
          ['Prompt A,B', 'Ask for each variable'],
          ['If A>0', 'Run the next line only if true'],
          ['If … Then … Else … End', 'Blocks'],
          ['For(I,1,10[,step]) … End', 'Counting loop'],
          ['While cond … End', 'Loop while true'],
          ['Repeat cond … End', 'Loop until true (runs at least once)'],
          ['Lbl A / Goto A', 'Jump to a label'],
          ['Pause, ClrHome, Stop, Return', 'Flow & screen'],
          ['prgmNAME', 'Run another program'],
          ['= ≠ < > ≤ ≥ and or xor not(', 'Conditions (1 = true, 0 = false)'],
        ].map(([k, d]) => (
          <div key={k} style={{ display: 'contents' }}>
            <code className="kbd" style={{ textAlign: 'left' }}>
              {k}
            </code>
            <span className="muted">{d}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        While a program runs, press <b>Stop</b> (or Esc) to break it. Errors show the program and line number. Programs are saved on this device.
      </p>
    </div>
  );
}
