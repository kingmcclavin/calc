import { getActiveTarget } from './editing';

const SYMBOLS: Array<{ label: string; text: string; title: string; wrap?: boolean }> = [
  { label: 'x', text: 'x', title: 'Variable x' },
  { label: '^', text: '^', title: 'Power' },
  { label: 'x²', text: '²', title: 'Square' },
  { label: '√', text: '√(', title: 'Square root', wrap: true },
  { label: 'π', text: 'π', title: 'Pi' },
  { label: 'e', text: 'e', title: "Euler's number" },
  { label: '(', text: '(', title: 'Open parenthesis' },
  { label: ')', text: ')', title: 'Close parenthesis' },
  { label: 'sin', text: 'sin(', title: 'Sine', wrap: true },
  { label: 'cos', text: 'cos(', title: 'Cosine', wrap: true },
  { label: 'tan', text: 'tan(', title: 'Tangent', wrap: true },
  { label: 'ln', text: 'ln(', title: 'Natural log', wrap: true },
  { label: 'log', text: 'log(', title: 'Log base 10', wrap: true },
  { label: '|x|', text: 'abs(', title: 'Absolute value', wrap: true },
  { label: '÷', text: '/', title: 'Divide' },
  { label: '×', text: '*', title: 'Multiply' },
  { label: '−', text: '-', title: 'Minus' },
  { label: '+', text: '+', title: 'Plus' },
  { label: '=', text: '=', title: 'Equals (for equations)' },
];

/** A strip of common math symbols that inserts into the most recently focused math field. */
export function SymbolBar({ includeEquals = false }: { includeEquals?: boolean }) {
  return (
    <div className="symbol-bar" role="toolbar" aria-label="Insert math symbols">
      {SYMBOLS.filter((s) => includeEquals || s.text !== '=').map((s) => (
        <button
          key={s.label}
          type="button"
          title={s.title}
          aria-label={`Insert ${s.title}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => getActiveTarget()?.apply({ type: 'insert', text: s.text, wrap: s.wrap })}
        >
          {s.label}
        </button>
      ))}
      <button
        type="button"
        title="Delete"
        aria-label="Delete before cursor"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => getActiveTarget()?.apply({ type: 'backspace' })}
      >
        ⌫
      </button>
    </div>
  );
}
