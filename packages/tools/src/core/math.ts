import { z } from "zod";
import type { ToolRegistration } from "../types";

/**
 * Safe math expression evaluator. Hand-rolled recursive-descent parser so
 * there's no `eval` and no new dependency. Supports:
 *   - numbers (int, float, scientific notation)
 *   - binary: + - * / ^ %
 *   - unary: + -
 *   - parentheses
 */
const parameters = z.object({
  expression: z
    .string()
    .min(1)
    .describe("Arithmetic expression, e.g. '(2+3)*4^2'"),
});

type Params = z.infer<typeof parameters>;

export type MathResult = {
  expression: string;
  value: number;
  error?: string;
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; op: "+" | "-" | "*" | "/" | "^" | "%" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^" || c === "%") {
      out.push({ kind: "op", op: c });
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src.charAt(j))) j++;
      if (j < src.length && (src.charAt(j) === "e" || src.charAt(j) === "E")) {
        j++;
        if (src.charAt(j) === "+" || src.charAt(j) === "-") j++;
        while (j < src.length && /[0-9]/.test(src.charAt(j))) j++;
      }
      const n = Number(src.slice(i, j).replace(/_/g, ""));
      if (Number.isNaN(n)) throw new Error(`bad number at ${i}`);
      out.push({ kind: "num", value: n });
      i = j;
      continue;
    }
    throw new Error(`unexpected char '${c}' at ${i}`);
  }
  return out;
}

/**
 * Grammar:
 *   expr   := term (('+'|'-') term)*
 *   term   := power (('*'|'/'|'%') power)*
 *   power  := unary ('^' power)?            // right-assoc
 *   unary  := ('+'|'-')* primary
 *   primary:= NUM | '(' expr ')'
 */
function parse(tokens: Token[]): number {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const eat = (): Token | undefined => tokens[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (t && t.kind === "op" && (t.op === "+" || t.op === "-")) {
        eat();
        const right = parseTerm();
        left = t.op === "+" ? left + right : left - right;
      } else break;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (true) {
      const t = peek();
      if (t && t.kind === "op" && (t.op === "*" || t.op === "/" || t.op === "%")) {
        eat();
        const right = parsePower();
        if (t.op === "*") left = left * right;
        else if (t.op === "/") left = left / right;
        else left = left % right;
      } else break;
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    const t = peek();
    if (t && t.kind === "op" && t.op === "^") {
      eat();
      const exp = parsePower(); // right-assoc
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    const t = peek();
    if (t && t.kind === "op" && (t.op === "+" || t.op === "-")) {
      eat();
      const v = parseUnary();
      return t.op === "-" ? -v : v;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = eat();
    if (!t) throw new Error("unexpected end of expression");
    if (t.kind === "num") return t.value;
    if (t.kind === "lparen") {
      const v = parseExpr();
      const close = eat();
      if (!close || close.kind !== "rparen") throw new Error("missing ')'");
      return v;
    }
    throw new Error("unexpected token");
  }

  const value = parseExpr();
  if (pos !== tokens.length) throw new Error("trailing tokens");
  return value;
}

export const mathTool: ToolRegistration<Params, MathResult> = {
  tool: {
    name: "math",
    description:
      "Safely evaluate a math expression: + - * / ^ % and parentheses. No variables, no functions, no eval.",
    parameters,
    handler: async ({ expression }) => {
      try {
        const value = parse(tokenize(expression));
        if (!Number.isFinite(value)) {
          return { expression, value, error: "non-finite result" };
        }
        return { expression, value };
      } catch (err) {
        return {
          expression,
          value: NaN,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  },
  category: "utilities",
  safety: {
    requiresAuth: false,
    maxInvocationsPerRequest: 20,
    allowInAutonomousMode: true,
  },
};
