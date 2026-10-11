import { MathError, type Node, type RelOp } from './ast';
import { FN_ALIASES, FN_MAP } from './functions';

/* ------------------------------------------------------------------------ */
/* Lexer                                                                     */
/* ------------------------------------------------------------------------ */

type TokType =
  | 'num'
  | 'ident' // variable / constant
  | 'func'
  | 'op' // + - * / ^
  | 'combo' // nPr / nCr
  | 'post' // ! °
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'comma'
  | 'store'
  | 'rel' // = ≠ < > ≤ ≥
  | 'logic' // and or xor
  | 'eof';

export interface Token {
  type: TokType;
  value: string;
  pos: number;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/** Names that can appear inside an identifier run, longest first. */
const WORDS: Array<[string, TokType, string]> = (() => {
  const list: Array<[string, TokType, string]> = [];
  for (const name of Object.keys(FN_MAP)) if (name !== 'npr' && name !== 'ncr') list.push([name, 'func', name]);
  for (const [alias, target] of Object.entries(FN_ALIASES)) list.push([alias, 'func', target]);
  list.push(['npr', 'combo', 'nPr'], ['ncr', 'combo', 'nCr']);
  list.push(['and', 'logic', 'and'], ['xor', 'logic', 'xor'], ['or', 'logic', 'or']);
  list.push(['pi', 'ident', 'pi'], ['ans', 'ident', 'Ans'], ['theta', 'ident', 'θ']);
  // Function npr/ncr are also callable as functions: handled in parser when followed by "("
  return list.sort((a, b) => b[0].length - a[0].length);
})();

function isLetter(c: string): boolean {
  return /[A-Za-zθ]/.test(c);
}

export function tokenize(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  const push = (type: TokType, value: string, pos: number) => toks.push({ type, value, pos });

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === ' ') {
      i++;
      continue;
    }
    // Numbers: 12, 1.5, .5, scientific with ᴇ
    if (/[0-9.]/.test(c) || c === 'ᴇ') {
      const start = i;
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && /[0-9]/.test(src[i])) i++;
      }
      // "ᴇ3" with no mantissa means 1ᴇ3 (as on the TI-84)
      let text = c === 'ᴇ' ? '1' : src.slice(start, i);
      if (text === '.') throw new MathError('SYNTAX', 'A lone "." is not a number', start);
      if ((text.match(/\./g) || []).length > 1) throw new MathError('SYNTAX', 'Number has more than one decimal point', start);
      if (src[i] === 'ᴇ') {
        let j = i + 1;
        let exp = '';
        if (src[j] === '-' || src[j] === '−' || src[j] === '+') exp += src[j++] === '+' ? '' : '-';
        const ds = j;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
        if (j === ds) throw new MathError('SYNTAX', 'ᴇ must be followed by an integer exponent', i);
        exp += src.slice(ds, j);
        text = `${text}e${exp}`;
        i = j;
      }
      push('num', text, start);
      continue;
    }
    if (isLetter(c)) {
      const start = i;
      while (i < src.length && isLetter(src[i])) i++;
      // Special identifiers with digits: Y1–Y10, L1–L6
      const word = src.slice(start, i);
      const end = i;
      splitIdentifier(word, start, src, end, toks, (consumed) => {
        i += consumed;
      });
      continue;
    }
    const pos = i;
    i++;
    switch (c) {
      case '+':
        push('op', '+', pos);
        break;
      case '-':
      case '−':
      case '–':
        if (src[i] === '>') {
          i++;
          push('store', '→', pos);
        } else push('op', '-', pos);
        break;
      case '*':
        if (src[i] === '*') {
          i++;
          push('op', '^', pos);
        } else push('op', '*', pos);
        break;
      case '×':
      case '·':
      case '⋅':
        push('op', '*', pos);
        break;
      case '/':
      case '÷':
        push('op', '/', pos);
        break;
      case '^':
        push('op', '^', pos);
        break;
      case '(':
        push('lparen', '(', pos);
        break;
      case ')':
        push('rparen', ')', pos);
        break;
      case '[':
        push('lparen', '(', pos);
        break;
      case ']':
        push('rparen', ')', pos);
        break;
      case '{':
        push('lbrace', '{', pos);
        break;
      case '}':
        push('rbrace', '}', pos);
        break;
      case ',':
        push('comma', ',', pos);
        break;
      case '!':
        if (src[i] === '=') {
          i++;
          push('rel', '≠', pos);
        } else push('post', '!', pos);
        break;
      case '=':
        push('rel', '=', pos);
        break;
      case '≠':
      case '≤':
      case '≥':
        push('rel', c, pos);
        break;
      case '<':
        if (src[i] === '=') {
          i++;
          push('rel', '≤', pos);
        } else if (src[i] === '>') {
          i++;
          push('rel', '≠', pos);
        } else push('rel', '<', pos);
        break;
      case '>':
        if (src[i] === '=') {
          i++;
          push('rel', '≥', pos);
        } else push('rel', '>', pos);
        break;
      case '°':
        push('post', '°', pos);
        break;
      case '→':
        push('store', '→', pos);
        break;
      case 'π':
        push('ident', 'pi', pos);
        break;
      case '√':
        push('func', 'sqrt', pos);
        break;
      case '∛':
        push('func', 'cbrt', pos);
        break;
      case '⁻':
        if (src[i] === '¹') {
          i++;
          push('op', '^', pos);
          push('num', '-1', pos);
        } else throw new MathError('SYNTAX', 'Unexpected "⁻"', pos);
        break;
      default:
        if (c in SUPERSCRIPT_DIGITS) {
          let digits = SUPERSCRIPT_DIGITS[c];
          while (i < src.length && src[i] in SUPERSCRIPT_DIGITS) digits += SUPERSCRIPT_DIGITS[src[i++]];
          push('op', '^', pos);
          push('num', digits, pos);
          break;
        }
        throw new MathError('SYNTAX', `Unexpected character "${c}"`, pos);
    }
  }
  toks.push({ type: 'eof', value: '', pos: src.length });
  return toks;
}

/**
 * Break a run of letters such as "xsin" or "AB" into known words and single
 * letter variables. Handles Y1–Y10 and L1–L6, which include trailing digits.
 */
function splitIdentifier(
  word: string,
  start: number,
  src: string,
  end: number,
  toks: Token[],
  advanceExtra: (n: number) => void,
) {
  let j = 0;
  while (j < word.length) {
    const rest = word.slice(j).toLowerCase();
    const pos = start + j;
    // inverse trig written as sin⁻¹(
    const tail = src.slice(start + j);
    const inv = /^(sin|cos|tan|sinh|cosh|tanh)⁻¹/i.exec(tail);
    if (inv && j + inv[1].length === word.length) {
      toks.push({ type: 'func', value: 'a' + inv[1].toLowerCase(), pos });
      advanceExtra(2);
      return;
    }
    // and/or/xor only match when typed in lower case, so ALPHA letters like O,R stay variables
    const match = WORDS.find(([w, type]) => rest.startsWith(w) && (type !== 'logic' || word.startsWith(w, j)));
    if (match) {
      // nPr/nCr followed by "(" act as functions
      if (match[1] === 'combo' && j + match[0].length === word.length && src[end] === '(') {
        toks.push({ type: 'func', value: match[0], pos });
      } else {
        toks.push({ type: match[1], value: match[2], pos });
      }
      j += match[0].length;
      continue;
    }
    const ch = word[j];
    // Y1..Y10 / L1..L6 at the end of the run followed by digits
    if (j === word.length - 1 && (ch === 'Y' || ch === 'L')) {
      const m = /^\d+/.exec(src.slice(end));
      if (m) {
        const n = Number(m[0]);
        if (ch === 'Y' && n >= 0 && n <= 10) {
          toks.push({ type: 'ident', value: `Y${n === 0 ? 10 : n}`, pos });
          advanceExtra(m[0].length);
          return;
        }
        if (ch === 'L' && n >= 1 && n <= 6 && m[0].length === 1) {
          toks.push({ type: 'ident', value: `L${n}`, pos });
          advanceExtra(1);
          return;
        }
      }
    }
    if (ch === 'x' || ch === 'X') toks.push({ type: 'ident', value: 'x', pos });
    else if (ch === 'e') toks.push({ type: 'ident', value: 'e', pos });
    // lower-case i is the imaginary unit (2nd . on the TI-84); ALPHA I gives the variable I
    else if (ch === 'i') toks.push({ type: 'ident', value: 'i', pos });
    else if (ch === 'θ') toks.push({ type: 'ident', value: 'θ', pos });
    else toks.push({ type: 'ident', value: ch.toUpperCase(), pos });
    j++;
  }
}

/* ------------------------------------------------------------------------ */
/* Parser                                                                    */
/* ------------------------------------------------------------------------ */

class Parser {
  private i = 0;
  constructor(private toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.i];
  }
  private next(): Token {
    return this.toks[this.i++];
  }
  private atOp(v: string): boolean {
    const t = this.peek();
    return t.type === 'op' && t.value === v;
  }

  parseTop(): Node {
    if (this.peek().type === 'eof') throw new MathError('SYNTAX', 'Expression is empty', 0);
    let node = this.parseFull();
    if (this.peek().type === 'store') {
      const st = this.next();
      const t = this.next();
      if (t.type !== 'ident' || !/^([A-Zθ]|x|L[1-6])$/.test(t.value)) {
        throw new MathError('SYNTAX', 'Store (→) needs a variable A–Z, θ, x or a list L1–L6', st.pos);
      }
      node = { type: 'store', value: node, target: t.value };
    }
    const t = this.peek();
    if (t.type !== 'eof') {
      if (t.type === 'rparen') throw new MathError('SYNTAX', 'Unmatched ")"', t.pos);
      throw new MathError('SYNTAX', `Unexpected "${t.value}"`, t.pos);
    }
    return node;
  }

  /** Lowest precedence: or / xor, then and, then relations (TI-84 order). */
  private parseFull(): Node {
    let left = this.parseAnd();
    while (this.peek().type === 'logic' && this.peek().value !== 'and') {
      const op = this.next().value as 'or' | 'xor';
      left = { type: 'binary', op, left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseRel();
    while (this.peek().type === 'logic' && this.peek().value === 'and') {
      this.next();
      left = { type: 'binary', op: 'and', left, right: this.parseRel() };
    }
    return left;
  }

  private parseRel(): Node {
    let left = this.parseExpr();
    while (this.peek().type === 'rel') {
      const t = this.next();
      if (this.peek().type === 'eof') throw new MathError('SYNTAX', `Missing a value after "${t.value}"`, t.pos);
      left = { type: 'binary', op: t.value as RelOp, left, right: this.parseExpr() };
    }
    return left;
  }

  private parseExpr(): Node {
    let left = this.parseTerm();
    while (this.atOp('+') || this.atOp('-')) {
      const op = this.next().value as '+' | '-';
      const right = this.parseTerm();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  /** Can the current token begin an implicitly multiplied factor? */
  private startsFactor(): boolean {
    const t = this.peek();
    return t.type === 'num' || t.type === 'ident' || t.type === 'func' || t.type === 'lparen' || t.type === 'lbrace';
  }

  private parseTerm(): Node {
    let left = this.parseCombo();
    for (;;) {
      if (this.atOp('*') || this.atOp('/')) {
        const op = this.next().value as '*' | '/';
        const right = this.parseCombo();
        left = { type: 'binary', op, left, right };
      } else if (this.startsFactor()) {
        const t = this.peek();
        if (t.type === 'num' && (left.type === 'num' || endsWithNumber(left))) {
          throw new MathError('SYNTAX', 'Two numbers in a row — missing an operator?', t.pos);
        }
        const right = this.parseCombo();
        left = { type: 'binary', op: '*', left, right, implicit: true };
      } else break;
    }
    return left;
  }

  private parseCombo(): Node {
    let left = this.parseUnary();
    while (this.peek().type === 'combo') {
      const op = this.next().value as 'nPr' | 'nCr';
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.atOp('-') || this.atOp('+')) {
      const op = this.next().value as '-' | '+';
      const arg = this.parseUnary();
      return { type: 'unary', op, arg };
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parsePostfix();
    if (this.atOp('^')) {
      const t = this.next();
      if (this.peek().type === 'eof') throw new MathError('SYNTAX', 'Missing exponent after "^"', t.pos);
      // a literal "-1" from ⁻¹ arrives as a num token
      const exp = this.parseUnary();
      let node: Node = { type: 'binary', op: '^', left: base, right: exp };
      // allow postfix after exponent e.g. x²!
      while (this.peek().type === 'post') {
        const op = this.next().value as '!' | '°';
        node = { type: 'postfix', op, arg: node };
      }
      return node;
    }
    return base;
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    while (this.peek().type === 'post') {
      const op = this.next().value as '!' | '°';
      node = { type: 'postfix', op, arg: node };
    }
    return node;
  }

  /** Consume ")" — or accept end of input (closing parentheses are optional at the end, like on a TI-84). */
  private closeParen(openPos: number) {
    const t = this.peek();
    if (t.type === 'rparen') {
      this.next();
      return;
    }
    if (t.type === 'eof' || t.type === 'store') return;
    throw new MathError('SYNTAX', t.type === 'comma' ? 'Unexpected ","' : `Expected ")" to match "(" at position ${openPos + 1}`, t.pos);
  }

  private parsePrimary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'num': {
        const value = Number(t.value);
        if (!Number.isFinite(value)) throw new MathError('OVERFLOW', 'Number is too large', t.pos);
        return { type: 'num', value, text: t.value };
      }
      case 'ident': {
        if (t.value === 'pi') return { type: 'const', name: 'pi' };
        if (t.value === 'e') return { type: 'const', name: 'e' };
        if (t.value === 'i') return { type: 'const', name: 'i' };
        if (/^Y\d+$/.test(t.value)) {
          // Y1(…) evaluates the function; bare Y1 means Y1(x)
          if (this.peek().type === 'lparen') {
            const open = this.next();
            const arg = this.parseFull();
            this.closeParen(open.pos);
            return { type: 'call', name: t.value, args: [arg] };
          }
          return { type: 'call', name: t.value, args: [{ type: 'var', name: 'x' }] };
        }
        return { type: 'var', name: t.value };
      }
      case 'lparen': {
        if (this.peek().type === 'rparen') throw new MathError('SYNTAX', 'Empty parentheses', t.pos);
        const e = this.parseFull();
        this.closeParen(t.pos);
        return e;
      }
      case 'lbrace': {
        const items: Node[] = [];
        if (this.peek().type !== 'rbrace') {
          items.push(this.parseFull());
          while (this.peek().type === 'comma') {
            this.next();
            items.push(this.parseFull());
          }
        }
        const c = this.peek();
        if (c.type === 'rbrace') this.next();
        else if (c.type !== 'eof') throw new MathError('SYNTAX', 'Expected "}" to close the list', c.pos);
        return { type: 'list', items };
      }
      case 'func': {
        const info = FN_MAP[t.value];
        if (this.peek().type !== 'lparen') {
          if (t.value === 'sqrt' || t.value === 'cbrt') {
            // √2, √x: applies to the next factor
            const arg = this.parsePostfix();
            return { type: 'call', name: t.value, args: [arg] };
          }
          throw new MathError('SYNTAX', `${t.value} needs parentheses, e.g. ${t.value}(…)`, t.pos);
        }
        const open = this.next();
        const args: Node[] = [];
        if (this.peek().type !== 'rparen' && this.peek().type !== 'eof') {
          args.push(this.parseFull());
          while (this.peek().type === 'comma') {
            this.next();
            args.push(this.parseFull());
          }
        }
        this.closeParen(open.pos);
        if (args.length < info.minArgs || args.length > info.maxArgs) {
          const exp = info.minArgs === info.maxArgs ? `${info.minArgs}` : `${info.minArgs}–${info.maxArgs}`;
          throw new MathError('ARGUMENT', `${t.value} expects ${exp} argument${info.maxArgs === 1 ? '' : 's'}, got ${args.length}`, t.pos);
        }
        return { type: 'call', name: t.value, args };
      }
      case 'eof':
        throw new MathError('SYNTAX', 'Expression ends unexpectedly', t.pos);
      case 'rparen':
        throw new MathError('SYNTAX', 'Unexpected ")"', t.pos);
      case 'comma':
        throw new MathError('SYNTAX', 'Unexpected ","', t.pos);
      case 'op':
        throw new MathError('SYNTAX', `Missing a value before "${t.value}"`, t.pos);
      case 'post':
        throw new MathError('SYNTAX', `"${t.value}" must follow a value`, t.pos);
      case 'combo':
      case 'rel':
      case 'logic':
        throw new MathError('SYNTAX', `"${t.value}" needs a value on its left`, t.pos);
      default:
        throw new MathError('SYNTAX', `Unexpected "${t.value}"`, t.pos);
    }
  }
}

function endsWithNumber(n: Node): boolean {
  // "2x 3" is suspicious only when the last factor is a bare number
  if (n.type === 'num') return true;
  if (n.type === 'binary' && n.op === '*' && n.implicit) return endsWithNumber(n.right);
  return false;
}

export function parse(src: string): Node {
  const toks = tokenize(src);
  return new Parser(toks).parseTop();
}

/** Parse an equation "lhs = rhs" (or a bare expression, meaning expr = 0). */
export function parseEquation(src: string): { left: Node; right: Node } {
  const parts = src.split('=');
  if (parts.length > 2) throw new MathError('SYNTAX', 'An equation may contain only one "="');
  const left = parse(parts[0]);
  const right = parts.length === 2 ? parse(parts[1]) : { type: 'num' as const, value: 0, text: '0' };
  return { left, right };
}
