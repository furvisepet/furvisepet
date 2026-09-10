/** Bounded reverse-Polish program. Numbers are operand indexes, never invented
 * constants. Every leaf has already been grounded in an original source. */
export type CalculationToken = number | "add" | "subtract" | "multiply" | "divide";
export function parseCalculationExpression(value: unknown): CalculationToken[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 31
    || value.some(t => typeof t === "number" ? !Number.isInteger(t) || t < 0 || t > 3
      : !["add", "subtract", "multiply", "divide"].includes(t))) return null;
  return [...value];
}
export function evaluateCalculationExpression(tokens: readonly CalculationToken[], operands: readonly { value: number; dimension: string; scale: number }[]) {
  const stack: Array<{ value: number; dimension: string }> = [];
  if (!parseCalculationExpression(tokens)) return null;
  for (const token of tokens) {
    if (typeof token === "number") {
      const operand = operands[token]; if (!operand || operand.dimension === "instant") return null;
      stack.push({ value: operand.value * operand.scale, dimension: operand.dimension }); continue;
    }
    const b = stack.pop(), a = stack.pop(); if (!a || !b) return null;
    let value: number, dimension: string;
    if (token === "add" || token === "subtract") {
      if (a.dimension !== b.dimension) return null;
      value = token === "add" ? a.value + b.value : a.value - b.value; dimension = a.dimension;
    } else if (token === "divide") {
      if (!b.value) return null;
      if (a.dimension === b.dimension) dimension = "scalar";
      else if (b.dimension === "scalar") dimension = a.dimension;
      else return null;
      value = a.value / b.value;
    } else {
      if (a.dimension !== "scalar" && b.dimension !== "scalar") return null;
      dimension = a.dimension === "scalar" ? b.dimension : a.dimension; value = a.value * b.value;
    }
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return null;
    stack.push({ value, dimension });
  }
  return stack.length === 1 ? stack[0] : null;
}
