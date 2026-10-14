/** Abstract syntax tree produced by the parser. */
export type RelOp = '=' | '≠' | '<' | '>' | '≤' | '≥';
export type LogicOp = 'and' | 'or' | 'xor';
export type BinaryOp = '+' | '-' | '*' | '/' | '^' | 'nPr' | 'nCr' | RelOp | LogicOp;

export type Node =
  | { type: 'num'; value: number; text: string }
  | { type: 'const'; name: 'pi' | 'e' | 'i' }
  | { type: 'var'; name: string } // x, A–Z, θ, Ans
  | { type: 'list'; items: Node[] }
  | { type: 'matrix'; rows: Node[][] }
  | { type: 'unary'; op: '-' | '+'; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node; implicit?: boolean }
  | { type: 'postfix'; op: '!' | '°' | '%' | 'ᵀ'; arg: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'store'; value: Node; target: string }; // target: A–Z, θ, x or L1–L6

export class MathError extends Error {
  /** Short TI-style category, e.g. "SYNTAX", "DOMAIN" */
  kind: string;
  /** Optional character position in the source where the error was detected. */
  pos?: number;
  constructor(kind: string, message: string, pos?: number) {
    super(message);
    this.kind = kind;
    this.pos = pos;
  }
}
