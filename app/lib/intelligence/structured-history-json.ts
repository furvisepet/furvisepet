import { serializeHistoricalJson } from "../furvise-output.ts";
import { historyCalculationSchema } from "./history-calculation.ts";
import { parseHistoryNarrative } from "./history-narrative.ts";

const node = { $ref: "#/$defs/historyJsonValue" };
const objectNode = { type: "object", additionalProperties: false, required: ["kind", "entries"], properties: {
  kind: { type: "string", enum: ["object"] },
  entries: { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false,
    required: ["key", "value"], properties: { key: { type: "string", minLength: 1, maxLength: 100 }, value: node } } },
} };
const arrayNode = { type: "object", additionalProperties: false, required: ["kind", "items"], properties: {
  kind: { type: "string", enum: ["array"] }, items: { type: "array", maxItems: 24, items: node },
} };
export const historyJsonDefinitions = {
  historyJsonValue: { anyOf: [objectNode, arrayNode, { type: "string", maxLength: 600 },
    { type: "number" }, { type: "boolean" }, { type: "null" }] },
};
export const historyJsonSchema = { type: ["object", "null"], additionalProperties: false,
  required: ["value", "sourceIds", "calculations"], properties: {
    value: { anyOf: [objectNode, arrayNode] },
    sourceIds: { type: "array", minItems: 1, maxItems: 12, items: { type: "string", minLength: 1, maxLength: 160 } },
    calculations: historyCalculationSchema,
  } };

/** Data-only JSON tree. The server owns escaping and serialization. It grants no
 * factual authority: the rendered body still needs source validation and review. */
export function renderHistoricalJson(value: unknown) {
  const fail = (): never => { throw new Error("INVALID_HISTORY_JSON"); };
  const exact = (value: unknown, keys: string): value is Record<string, unknown> => !!value && typeof value === "object"
    && !Array.isArray(value) && Object.keys(value).sort().join() === keys;
  if (!exact(value, "calculations,sourceIds,value")) return fail();
  const text = serializeHistoricalJson(value.value);
  const narrative = parseHistoryNarrative({ sentences: [{ text, sourceIds: value.sourceIds, calculations: value.calculations }] });
  if (!narrative) return fail();
  return narrative;
}
