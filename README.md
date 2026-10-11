# Lumen — a modern graphing calculator

Lumen is a web-based graphing calculator built around the TI-84 Plus CE workflow (Y= editor, window, trace, CALC menu, STAT lists, 2nd functions, Ans/ENTRY) with a modern, touch-friendly interface. It runs entirely in the browser: no account, no backend, no API keys.

## Features

**Calculate**
- Laid out like a TI-84 Plus CE: a black, scrollable screen on top — you type straight onto it (no input box), with the entry line right under the previous answers — and the complete keypad below it, with each key's 2nd (amber) and ALPHA (green) labels shown on the key, with every key (and its amber 2nd and green ALPHA labels) always visible at desktop, iPad and phone sizes.
- Keys in TI-84 order: Y= / WINDOW / ZOOM / TRACE / GRAPH (with STAT PLOT, TBLSET, FORMAT, CALC, TABLE on 2nd) jump to the matching tool; 2nd, ALPHA (and A-LOCK) for letters A–Z/θ, MODE (angle, Float/Fix, theme; 2nd QUIT), DEL, X,T,θ,n, STAT (2nd LIST), MATH, APPS, PRGM (2nd SOLVE), VARS (2nd DISTR), CLEAR, arrow pad, STO→, ANS, (−) and ENTER (2nd ENTRY). The TI's ON key is replaced by ANS.
- ▲/▼ (on screen or on the keyboard) scroll through the screen and highlight earlier expressions or answers; ENTER pastes the highlighted line into the entry line, exactly like the TI-84 home screen.
- Like a real TI-84, the keypad never disappears: every section (graph, table, stats, solver, programs…) is shown on the screen area above the keypad on phones, or beside it on desktop. Y=, WINDOW, ZOOM, TRACE, GRAPH, STAT, PRGM, APPS, HIST and FORMAT switch sections; arrows trace or pan the graph and scroll the table; typing goes into the field being edited (or back to the home screen); CLEAR or 2nd QUIT returns home. CLEAR on an empty line clears the screen, as on a TI-84.
- Comparisons and logic: `=`, `≠` (`!=`, `<>`), `<`, `>`, `≤` (`<=`), `≥` (`>=`), `and`, `or`, `xor`, `not(` return 1 or 0, like the TI-84 (`2+2=4` gives 1).
- Works with mouse, touch and a physical keyboard (Enter, Esc, ↑/↓ screen scrolling, typing `+` on an empty line continues from `Ans`, Enter on an empty line repeats the last entry).
- Live typeset preview (KaTeX) and live result while typing; scrollable history with tap-to-reuse expression or result, copy and delete.
- **Exact results** for rational arithmetic using BigInt fractions (`1/3+1/6 = 1/2`, `0.1+0.2 = 3/10`, `20!`, `√(9/4) = 3/2`, `sin(30) = 1/2` in degree mode), shown with the decimal approximation. Anything irrational is shown as a decimal and never labelled exact.
- Functions: trig/inverse/hyperbolic, sec/csc/cot, ln, log (any base), roots, abs, floor/ceil/round, iPart/fPart, mod, gcd/lcm, min/max, Γ, factorial, nPr/nCr, rand/randInt, `nDeriv`, `fnInt`, `sum`/`prod` (Σ/Π), list statistics, and normal/binomial/Poisson distributions.
- Variables A–Z and θ (`5→A`), `Ans`, lists `L1–L6`, list literals `{1,2,3}` with element-wise arithmetic, and graph functions `Y1(3)`.
- Clear TI-style error messages (`ERR: DOMAIN`, `DIVIDE BY 0`, `NONREAL`, `SYNTAX` …) with a "Go to error" jump.

**Graph** (Y= and GRAPH keys)
- As on a TI-84, **Y=** opens the equation editor and **GRAPH** shows only the graph, full screen; WINDOW/ZOOM, TRACE and 2nd TRACE (CALC) work from either.
- Up to 10 functions with individual colors (palette or custom), show/hide, reorder, delete, undo/redo, live syntax-error indicators and typeset previews. Implicit multiplication (`2x`, `3(x+1)`, `2sin(x)`) and `Y1`-references (e.g. `nDeriv(Y1,x,x)` graphs a derivative).
- Canvas renderer with adaptive sampling that breaks curves at poles, jumps and domain edges (tan, 1/x, floor, √x) instead of drawing false connecting lines.
- Pan by dragging, zoom with the wheel/trackpad or pinch, zoom buttons, keyboard navigation; grid, axes, ticks and labels (toggleable).
- Window dialog (Xmin/Xmax/Xscl/Ymin/Ymax/Yscl, accepts expressions like `-2π`) and zoom presets: Standard, Trig (respects degree mode), Square, Decimal, Integer, Fit, Quadrant I.
- Trace: click/tap a curve, drag the cursor along it, or use ←/→ (↑/↓ switch curves).
- Analysis: value (exact when possible), all zeros, minima, maxima and intersections in the visible window (with prev/next navigation), numerical dy/dx, tangent line, and definite integral with shading. Numerical results are badged "≈ numeric".
- Save/load named graphs (functions + window); example graph sets.

**Programs** — a TI-BASIC-style language for writing your own programs:
- PRGM key with EXEC (pastes `prgmNAME`; ENTER runs it), EDIT and NEW, plus a Programs section with an editor (line numbers, command buttons, live syntax checking with line-numbered errors, rename/delete) and a command reference.
- Statements: `expr→A`, `Disp`, `Input`, `Prompt`, `If` (single line or `Then`/`Else`/`End`), `For(`, `While`, `Repeat`, `Lbl`/`Goto`, `Pause`, `ClrHome`, `Stop`, `Return`, and `prgmNAME` to call other programs; `:` separates statements on one line.
- Programs run on the calculator screen, share the calculator's variables (A–Z, θ, x, Ans) and lists (L1–L6), ask for input on the entry line, and can be stopped at any time (Stop button or Esc) — infinite loops never freeze the app. Errors report the program and line.
- Examples included: QUAD (quadratic roots), FIB (Fibonacci) and GUESS (number-guessing game).

**Table** — X/Y table for any set of functions with configurable TblStart/ΔTbl, an "evaluate at x" row, and click-through from a cell to that point on the graph.

**Statistics** — editable lists L1–L6 (cell editing or paste as text), sample datasets, 1-Var stats (mean, Σx, Σx², Sx, σx, min/Q1/median/Q3/max, range, mode, optional frequency list), 2-Var stats with linear, quadratic, cubic, exponential, logarithmic and power regression, scatter plot with the fitted curve, "send equation to Graph", and normal/binomial/Poisson probability calculators.

**Solver** — linear and quadratic equations with rational coefficients are solved **exactly with step-by-step explanations** (including simplified surds like `(3 − √17)/4` and complex roots); 2×2 linear systems via determinants/Cramer's rule with steps; higher-degree polynomials (searched over Cauchy's root bound) and general equations (`cos(x) = x`) are solved numerically and labelled as such.

**Everything else** — persistent history, variables, functions, saved graphs, lists and settings (localStorage); dark (default), light and system themes; Float/Fix display with adjustable digits; radian/degree mode everywhere; copy/paste; keyboard shortcuts (Alt+1…7 switch sections); tooltips on keys; accessible labels, focus styles, `prefers-reduced-motion`; responsive layouts for desktop, iPad and iPhone; a "clear all data" option.

## Getting started

Requires Node.js 18+ (developed on Node 22).

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck  # TypeScript only
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
```

## Deployment

`npm run build` produces a fully static site in `dist/`. Asset paths are relative (`base: './'`), so the same build works at a domain root or under a sub-path.

- **GitHub Pages:** `.github/workflows/deploy.yml` runs the tests, builds and deploys on every push to `main`/`master`. In the repository settings choose *Pages → Source: GitHub Actions*.
- **Netlify:** `netlify.toml` is included — connect the repository, or drag the `dist/` folder into the Netlify UI.
- **Vercel:** `vercel.json` is included — import the repository; no settings needed.
- **Anything else:** upload the contents of `dist/` to any static host.

## Architecture

```
src/
  math/            pure TypeScript, no DOM — fully unit-tested
    parser.ts        tokenizer + recursive-descent parser → AST (never eval/Function)
    evaluate.ts      exact-aware evaluator (BigInt rationals + floats) and a closure compiler for fast graph evaluation
    rational.ts      BigInt fraction arithmetic
    numeric.ts       Brent root finding & minimisation, Ridders derivative, adaptive Gauss–Kronrod integration
    special.ts       Γ (Lanczos), normal CDF/inverse, binomial, Poisson
    polynomial.ts    structural polynomial extraction used by the solver
    solver.ts        exact linear/quadratic/2×2 solving with steps; numeric fallback
    stats.ts         1-/2-variable statistics and regressions
    program.ts       TI-BASIC-style compiler (to a flat jump list) and async interpreter
    latex.ts         AST → TeX for KaTeX rendering
    format.ts        Float/Fix number formatting, exact vs. approximate display
  graph/
    sampler.ts       adaptive sampling with discontinuity detection
    GraphCanvas.tsx  canvas rendering + pan/pinch/wheel/trace/keyboard interaction
    analysis.ts      graph CALC tools
    viewport.ts      tick spacing, zoom and window presets
  state/             Zustand store with localStorage persistence; evaluation context
  components/        keypad, math input, KaTeX wrapper, dialogs, icons
  views/             Calculate, Graph, Table, Stats, Solver, History, Settings
  styles/            design tokens (CSS custom properties) and layout
```

Layers are independent: parsing, numerical evaluation, graph sampling and UI rendering live in separate modules, and the math layer has no dependency on React.

## Testing

`npm test` runs 86 unit tests covering the program interpreter (loops, branches, Goto, Input/Prompt, nested calls, compile/runtime errors, cancellation, the bundled examples), relational/logic operators, operator precedence, negative numbers and implicit multiplication, exact fractions, degree/radian behaviour, domain/overflow/syntax errors, special functions and distributions against reference values, roots/extrema/intersections/derivatives/integrals against known answers, discontinuity handling in the sampler, the solver (linear, quadratic, surds, complex, cubic, transcendental, systems), statistics/regressions and the entry-line editing logic.

During development the production build was also exercised in headless Chromium at desktop (1440×900), iPad Pro 11″ and iPhone 14 sizes: keypad and keyboard entry (including a check that all 50 keys fit on screen at 1440×900, 390×664 and 320×568 without scrolling), ▲/▼ screen highlighting and ENTER paste, ALPHA letters, 2nd functions, Y=/WINDOW/TRACE/CALC/STAT PLOT navigation, Ans chaining, variable storage, degree mode, persistence across reloads, click-to-trace, keyboard trace, wheel zoom, drag pan, pinch zoom (synthetic touch pointers), zeros/intersections/integral/tangent tools, table → graph navigation, the solver, regression plots and the light theme.

## Limitations and known issues

- **No computer algebra system.** Exact answers are limited to rational arithmetic (plus a few exact special cases such as perfect roots, integer logs and multiples of 30°/45° in degree mode). Results like `√2` or `sin(π/6)` are shown as decimals; there is no symbolic simplification, symbolic differentiation or symbolic integration. Derivatives and integrals are numerical (≈ 10+ significant digits for smooth functions).
- **Real numbers only.** Complex results are reported as `NONREAL` errors (the quadratic solver does display complex roots).
- The solver handles one variable (`x`) and 2×2 linear systems; it finds roots of non-polynomial equations only inside the chosen search interval and may miss roots that touch zero without crossing if they are extremely narrow.
- Graph analysis searches the *visible* window (like choosing bounds on a TI-84); pan or zoom to find results elsewhere.
- Only functions of the form y = f(x) are graphed (no parametric, polar, implicit or inequality graphs).
- Implicit multiplication has the same precedence as `*`, evaluated left to right, so `1/2x` means `(1/2)·x` (TI-84 behaviour). Functions require parentheses (`sin(x)`, not `sin x`), except `√2`.
- Scientific notation uses the `ᴇ` key (`2ᴇ3`); a typed `e` always means Euler's number.
- Data lives in the browser's localStorage; clearing site data or using a private window loses it, and it does not sync between devices.
- Programs support numbers and lists only — no string variables, `Menu(`, `Output(`, `getKey`, or drawing commands. `!=` means not-equal, so write `3! = 6` (with a space) to compare a factorial.
- Real-device testing was done with emulated viewports rather than physical iPhones/iPads; Safari-specific quirks may remain.
