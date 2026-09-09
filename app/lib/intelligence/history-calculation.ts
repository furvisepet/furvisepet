/** Arithmetic proposals cite literal operands. The server computes the value;
 * semantic review checks whether that calculation answers the actual question.
 * This validates arithmetic, not clinical recommendations or causal inference. */
export type HistoryCalculation = {
  operation: "sum" | "difference" | "ratio" | "percent_change" | "convert" | "elapsed_days";
  operands: Array<{ sourceId: string; field: "text" | "occurredAt"; literal: string }>;
  value: number;
  unit: string;
};
export const historyCalculationSchema = { type: "array", maxItems: 4, items: {
  type: "object", additionalProperties: false, required: ["operation", "operands", "value", "unit"], properties: {
    operation: { type: "string", enum: ["sum", "difference", "ratio", "percent_change", "convert", "elapsed_days"] },
    operands: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", additionalProperties: false,
      required: ["sourceId", "field", "literal"], properties: {
        sourceId: { type: "string", maxLength: 160 }, field: { type: "string", enum: ["text", "occurredAt"] },
        literal: { type: "string", minLength: 1, maxLength: 120 },
      } } },
    value: { type: "number" }, unit: { type: "string", maxLength: 20 },
  },
} };
type Source = { sourceId: string; text: string; occurredAt?: string | null };
const units: Record<string, { dimension: string; scale: number; canonical: string }> = {
  kg: { dimension: "mass", scale: 1000, canonical: "kg" }, g: { dimension: "mass", scale: 1, canonical: "g" },
  mg: { dimension: "mass", scale: .001, canonical: "mg" }, lb: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  lbs: { dimension: "mass", scale: 453.59237, canonical: "lb" },
  ml: { dimension: "volume", scale: 1, canonical: "ml" }, l: { dimension: "volume", scale: 1000, canonical: "l" },
  hour: { dimension: "time", scale: 1, canonical: "hour" }, hours: { dimension: "time", scale: 1, canonical: "hour" },
  day: { dimension: "time", scale: 24, canonical: "day" }, days: { dimension: "time", scale: 24, canonical: "day" },
  week: { dimension: "time", scale: 168, canonical: "week" }, weeks: { dimension: "time", scale: 168, canonical: "week" },
};
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12;
export function parseHistoryCalculations(value: unknown): HistoryCalculation[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  for (const p of value) {
    if (!p || typeof p !== "object" || Object.keys(p).sort().join() !== "operands,operation,unit,value"
      || !historyCalculationSchema.items.properties.operation.enum.includes(p.operation)
      || !finite(p.value) || typeof p.unit !== "string" || p.unit.length > 20
      || !Array.isArray(p.operands) || p.operands.length < 1 || p.operands.length > 4
      || p.operands.some((o: Record<string, unknown>) => !o || typeof o !== "object" || Object.keys(o).sort().join() !== "field,literal,sourceId"
        || !["text", "occurredAt"].includes(String(o.field)) || typeof o.sourceId !== "string" || !o.sourceId || o.sourceId.length > 160
        || typeof o.literal !== "string" || !o.literal || o.literal.length > 120)) return null;
  }
  return structuredClone(value) as HistoryCalculation[];
}
export function verifiedCalculationQuantities(proposals: HistoryCalculation[], sources: Source[]): string[] | null {
  const output: string[] = [];
  for (const p of proposals) {
    const operands: Array<{ value: number; dimension: string; scale: number }> = [];
    for (const operand of p.operands) {
      const matches = sources.filter(source => source.sourceId === operand.sourceId);
      if (matches.length !== 1) return null;
      const source = matches[0];
      if (operand.field === "occurredAt") {
        if (p.operation !== "elapsed_days" || operand.literal !== source.occurredAt || !Number.isFinite(Date.parse(operand.literal))) return null;
        operands.push({ value: Date.parse(operand.literal), dimension: "instant", scale: 1 });
      } else {
        // Require a complete numeric token, not a substring of a larger value.
        const match = operand.literal.match(/^(-?\d+(?:\.\d+)?)\s+([A-Za-z]+)$/);
        if (!match) return null;
        const escaped = operand.literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(`(?<![\\p{L}\\p{N}_.-])${escaped}(?![\\p{L}\\p{N}_])`, "u").test(source.text)) return null;
        const unit = units[match[2].toLowerCase()];
        if (!unit || !finite(Number(match[1]))) return null;
        operands.push({ value: Number(match[1]), ...unit });
      }
    }
    const dimension = operands[0].dimension;
    if (operands.some(operand => operand.dimension !== dimension)) return null;
    const values = operands.map(operand => operand.value * operand.scale);
    const target = units[p.unit.toLowerCase()];
    let computed: number;
    if (p.operation === "elapsed_days") {
      if (dimension !== "instant" || values.length !== 2 || !["day", "days"].includes(p.unit)) return null;
      computed = (values[1] - values[0]) / 86400000;
    } else if (p.operation === "ratio" || p.operation === "percent_change") {
      if (values.length !== 2 || values[0] === 0 || dimension === "instant" || p.unit !== (p.operation === "ratio" ? "" : "%")) return null;
      computed = p.operation === "ratio" ? values[1] / values[0] : (values[1] - values[0]) / values[0] * 100;
    } else {
      if (!target || target.dimension !== dimension || dimension === "instant") return null;
      if (p.operation === "convert" && values.length !== 1 || p.operation === "difference" && values.length !== 2) return null;
      computed = (p.operation === "sum" ? values.reduce((a, b) => a + b, 0)
        : p.operation === "difference" ? values[1] - values[0] : values[0]) / target.scale;
    }
    // Exact arithmetic or explicit rounding to the proposal's decimal precision.
    const decimals = String(p.value).split(".")[1]?.length || 0;
    if (!finite(computed) || Math.abs(Number(computed.toFixed(Math.min(decimals, 10))) - p.value) > 1e-9) return null;
    // Difference magnitude is also an anchor; semantic review verifies the
    // direction stated in prose (loss/decrease versus gain/increase).
    const canonical = p.unit === "%" || p.unit === "" ? p.unit : target?.canonical || "day";
    output.push(`${Math.abs(p.value)}:${canonical}`);
  }
  return output;
}
