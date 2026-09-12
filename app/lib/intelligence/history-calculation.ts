

export const units: Record<string, { dimension: string; scale: number; canonical: string }> = {
  kg: { dimension: "mass", scale: 1000, canonical: "kg" }, g: { dimension: "mass", scale: 1, canonical: "g" },
  mg: { dimension: "mass", scale: .001, canonical: "mg" }, lb: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  lbs: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  ml: { dimension: "volume", scale: 1, canonical: "ml" }, l: { dimension: "volume", scale: 1000, canonical: "l" },
  hour: { dimension: "time", scale: 1, canonical: "hour" }, hours: { dimension: "time", scale: 1, canonical: "hour" },
  minute: { dimension: "time", scale: 1 / 60, canonical: "minute" }, minutes: { dimension: "time", scale: 1 / 60, canonical: "minute" },
  second: { dimension: "time", scale: 1 / 3600, canonical: "second" }, seconds: { dimension: "time", scale: 1 / 3600, canonical: "second" },
  day: { dimension: "time", scale: 24, canonical: "day" }, days: { dimension: "time", scale: 24, canonical: "day" },
  week: { dimension: "time", scale: 168, canonical: "week" }, weeks: { dimension: "time", scale: 168, canonical: "week" },
};
// Explicit currency codes are independent dimensions. No exchange rate or
// ambiguous dollar-symbol interpretation may be inferred from a price.
for (const currency of ["cad", "usd", "eur", "gbp", "aud", "nzd", "jpy", "chf", "cny"]) {
  units[currency] = { dimension: `currency:${currency}`, scale: 1, canonical: currency };
}
// Provider and source spelling share one dimensional registry; spelling is not
// a different unit, and must not cause a correct calculation to fail review.
for (const [alias, canonical] of Object.entries({ kilogram: "kg", kilograms: "kg", gram: "g", grams: "g",
  milligram: "mg", milligrams: "mg", pound: "lb", pounds: "lb", milliliter: "ml", milliliters: "ml",
  millilitre: "ml", millilitres: "ml", liter: "l", liters: "l", litre: "l", litres: "l" })) units[alias] = units[canonical];

for (const [name, scale] of Object.entries({km:1000,m:1,cm:.01,mm:.001})) units[name]={dimension:"length",scale,canonical:name};
for (const [alias, canonical] of Object.entries({h:"hour",hr:"hour",min:"minute",sec:"second",s:"second",kilometer:"km",kilometers:"km",kilometre:"km",kilometres:"km",meter:"m",meters:"m",metre:"m",metres:"m"})) units[alias]=units[canonical];
export function compoundUnit(value: string) {
 const parts=value.toLowerCase().split("/").map(p=>p.trim());
 if(parts.length!==2 || !units[parts[0]] || !units[parts[1]]) return null;
 const numerator=units[parts[0]],denominator=units[parts[1]];
 return {numerator,denominator,scale:numerator.scale/denominator.scale,canonical:numerator.canonical+"/"+denominator.canonical};
}

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
      const operand = operands[token]; if (!operand || operand.dimension === "instant" || !Number.isFinite(operand.value)
        || !Number.isFinite(operand.scale) || operand.scale <= 0
        || !Number.isFinite(operand.value * operand.scale) || Math.abs(operand.value * operand.scale) > 1e12) return null;
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

/** Arithmetic proposals cite literal operands. The server computes the value;
 * semantic review checks whether that calculation answers the actual question.
 * This validates arithmetic, not clinical recommendations or causal inference. */
export type HistoryCalculation = {
  operation: "sum" | "mean" | "difference" | "ratio" | "percent_change" | "convert" | "elapsed_days" | "count_records" | "expression";
  expression?: CalculationToken[] | null;
  operands: Array<{ sourceId: string; field: "text" | "occurredAt"; literal: string }>;
  value: number;
  unit: string;
};
export const MAX_HISTORY_CALCULATIONS = 40;
export const historyCalculationSchema = { type: "array", maxItems: MAX_HISTORY_CALCULATIONS, items: {
  type: "object", additionalProperties: false, required: ["operation", "operands", "value", "unit", "expression"], properties: {
    operation: { type: "string", enum: ["sum", "mean", "difference", "ratio", "percent_change", "convert", "elapsed_days", "count_records", "expression"] },
    operands: { description: "Ordered operands. difference computes operand 0 minus operand 1; ratio and percent_change compare operand 1 to baseline operand 0.", type: "array", minItems: 1, maxItems: 64, items: { type: "object", additionalProperties: false,
      required: ["sourceId", "field", "literal"], properties: {
        sourceId: { type: "string", maxLength: 160 }, field: { type: "string", enum: ["text", "occurredAt"] },
        literal: { type: "string", minLength: 1, maxLength: 120 },
      } } },
    expression: { type: ["array", "null"], maxItems: 31, items: { anyOf: [{type:"integer",minimum:0,maximum:3},{type:"string",enum:["add","subtract","multiply","divide"]}] } },
    value: { type: "number" }, unit: { type: "string", maxLength: 20 },
  },
} };
type Source = { sourceId: string; text: string; occurredAt?: string | null };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
export function parseHistoryCalculations(value: unknown): HistoryCalculation[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_CALCULATIONS) return null;
  for (const p of value) {
    if (!p || typeof p !== "object" || Object.keys(p).sort().join() !== ("expression" in p ? "expression,operands,operation,unit,value" : "operands,operation,unit,value")
      || !historyCalculationSchema.items.properties.operation.enum.includes(p.operation)
      || (p.operation === "expression" ? !parseCalculationExpression(p.expression) : p.expression != null)
      || !finite(p.value) || typeof p.unit !== "string" || p.unit.length > 20
      || !Array.isArray(p.operands) || p.operands.length < 1 || p.operands.length > (["count_records", "sum", "mean"].includes(p.operation) ? 64 : 4)
      || p.operands.some((o: Record<string, unknown>) => !o || typeof o !== "object" || Object.keys(o).sort().join() !== "field,literal,sourceId"
        || !["text", "occurredAt"].includes(String(o.field)) || typeof o.sourceId !== "string" || !o.sourceId || o.sourceId.length > 160
        || typeof o.literal !== "string" || !o.literal || o.literal.length > 120)) return null;
  }
  return structuredClone(value) as HistoryCalculation[];
}
export function verifiedCalculationQuantities(proposals: HistoryCalculation[], sources: Source[], onMismatch?: (hint: { operation: string; expectedValue: number; unit: string }) => void): string[] | null {
  const output: string[] = [];
  for (const proposal of proposals) {
    const p = { ...proposal, unit: /^(?:percent|percentage)$/i.test(proposal.unit) ? "%" : /^(?:calendar|elapsed)[ _-]+days?$/i.test(proposal.unit) ? "days" : proposal.unit.toLowerCase() };
    if (p.operation === "count_records") {
      const ids = new Set(p.operands.map(operand => operand.sourceId));
      if (!p.operands.length || ids.size !== p.operands.length || !["record", "records", "note", "notes", "entry", "entries"].includes(p.unit)
        || p.operands.some(operand => operand.field !== "text" || operand.literal !== operand.sourceId
          || !/^(?:care|claim):/.test(operand.sourceId) || sources.filter(source => source.sourceId === operand.sourceId).length !== 1)
        || p.value !== ids.size) return null;
      output.push(`${p.value}:record`, `${p.value}:note`, `${p.value}:entry`); continue;
    }
    const operands: Array<{ value: number; dimension: string; scale: number }> = [];
    for (const operand of p.operands) {
      const matches = sources.filter(source => source.sourceId === operand.sourceId);
      if (matches.length !== 1) return null;
      const source = matches[0];
      if (operand.field === "occurredAt") {
        if (p.operation !== "elapsed_days" || Date.parse(operand.literal) !== Date.parse(source.occurredAt || "") || !Number.isFinite(Date.parse(operand.literal))) return null;
        operands.push({ value: Date.parse(operand.literal), dimension: "instant", scale: 1 });
      } else if (p.operation === "elapsed_days" && /^\d{4}-\d{2}-\d{2}$/.test(operand.literal)
        && [...source.text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].some(match => match[0] === operand.literal) && Number.isFinite(Date.parse(operand.literal))
        && new Date(operand.literal).toISOString().slice(0, 10) === operand.literal) {
        // A literal calendar date in the source is also an explicit operand.
        // It is not an inferred onset; semantic review checks that relationship.
        operands.push({ value: Date.parse(operand.literal), dimension: "instant", scale: 1 });
      } else {
        // A numeric leaf may cite only the number while its source supplies
        // the adjacent unit. Accept it only when that exact token has one
        // unambiguous unit in this source, never from the requested result unit.
        let literal = operand.literal;
        if (/^[+−-]?\d+(?:\.\d+)?$/.test(literal)) {
          const matches = [...source.text.matchAll(/(?<![\p{L}\p{N}_.+−-])([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)(?![\p{L}\p{N}_])/gu)]
            .filter(token => token[1] === literal && units[token[2].toLowerCase()]);
          if (!matches.length || new Set(matches.map(token => units[token[2].toLowerCase()].canonical)).size !== 1) return null;
          literal = matches[0][0];
        }
        // Require a complete numeric token, not a substring of a larger value.
        const tokens = [...literal.matchAll(/(?<![\p{L}\p{N}_.+−-])([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)(?![\p{L}\p{N}_])/gu)]
          .filter(token => units[token[2].toLowerCase()]);
        const exactToken = literal.match(/^([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)$/);
        // A longer verbatim source span may identify the measured object. It
        // must contain exactly one supported measurement, never ambiguous data.
        const match = exactToken || (source.text.includes(operand.literal) && tokens.length === 1 ? tokens[0] : null);
        if (!match) return null;
        const unit = units[match[2].toLowerCase()];
        if (!unit || !finite(Number(match[1].replace("−", "-")))) return null;
        // Bind a complete source token. Pluralization and an adjectival hyphen
        // do not change a measurement ("18 minutes" / "18-minute"). Never
        // accept a numeric substring or silently substitute a converted value.
        const grounded = [...source.text.matchAll(/(?<![\p{L}\p{N}_.+−-])([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)(?![\p{L}\p{N}_])/gu)]
          .some(token => Number(token[1].replace("−", "-")) === Number(match[1].replace("−", "-"))
            && units[token[2].toLowerCase()]?.canonical === unit.canonical);
        if (!grounded) return null;
        operands.push({ value: Number(match[1].replace("−", "-")), ...unit });
      }
    }
    const dimension = operands[0].dimension;
    const rate = p.operation === "ratio" ? compoundUnit(p.unit) : null;
    if (p.operation !== "expression" && !rate && operands.some(operand => operand.dimension !== dimension)) return null;
    const values = operands.map(operand => operand.value * operand.scale);
    const target = units[p.unit.toLowerCase()];
    let computed: number;
    if (p.operation === "expression") {
      const expression = p.expression && evaluateCalculationExpression(p.expression, operands);
      if (!expression) return null;
      if (expression.dimension === "scalar" && (p.unit === "%" || p.unit === "")) computed = expression.value * (p.unit === "%" ? 100 : 1);
      else if (target && target.dimension === expression.dimension) computed = expression.value / target.scale;
      else return null;
    } else if (rate) {
      if (values.length !== 2 || values[0] === 0
        || operands[0].dimension !== rate.denominator.dimension || operands[1].dimension !== rate.numerator.dimension
        || operands.some(operand => operand.dimension.startsWith("currency:"))) return null;
      computed = values[1] / values[0] / rate.scale;
    } else if (p.operation === "elapsed_days") {
      if (dimension !== "instant" || values.length !== 2 || !["day", "days"].includes(p.unit)) return null;
      computed = (values[1] - values[0]) / 86400000;
    } else if (p.operation === "ratio" || p.operation === "percent_change") {
      if (values.length !== 2 || values[0] === 0 || dimension === "instant" || p.unit !== (p.operation === "ratio" ? "" : "%")) return null;
      computed = p.operation === "ratio" ? values[1] / values[0] : (values[1] - values[0]) / values[0] * 100;
    } else {
      if (!target || target.dimension !== dimension || dimension === "instant") return null;
      if (p.operation === "convert" && values.length !== 1 || p.operation === "difference" && values.length !== 2) return null;
      computed = (p.operation === "sum" || p.operation === "mean" ? values.reduce((a, b) => a + b, 0) / (p.operation === "mean" ? values.length : 1)
        : p.operation === "difference" ? values[0] - values[1] : values[0]) / target.scale;
    }
    // Exact arithmetic or explicit rounding to the proposal's decimal precision.
    const decimals = String(p.value).split(".")[1]?.length || 0;
    if (!finite(computed)) return null;
    const expectedValue = Number(computed.toFixed(Math.min(decimals, 10)));
    if (Math.abs(expectedValue - p.value) > 1e-9) {
      onMismatch?.({ operation: p.operation, expectedValue, unit: p.unit });
      return null;
    }
    // Difference magnitude is also an anchor; semantic review verifies the
    // direction stated in prose (loss/decrease versus gain/increase).
    const canonical = p.unit === "%" || p.unit === "" ? p.unit : rate?.canonical || target?.canonical || "day";
    output.push(`${Math.abs(p.value)}:${canonical}`);
    if (p.value < 0) output.push(`${p.value}:${canonical}`);
  }
  return output;
}
