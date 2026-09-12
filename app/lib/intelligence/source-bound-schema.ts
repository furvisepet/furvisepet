import { units } from "./history-calculation.ts";

/** Provider constraints reduce invalid identities before generation. The final
 * eligibility, ownership and semantic checks remain authoritative. */
export function sourceBoundSchema<T extends object>(schema: T, sources: readonly { sourceId: string; sourceType: string; text?: string; occurredAt?: string | null }[]): T {
  const ids = [...new Set(sources.map(source => source.sourceId))];
  if (!ids.length) return schema;
  const targets = sources.filter(source => ["care_update", "memory", "concern"].includes(source.sourceType)).map(source => source.sourceId);
  const copy = structuredClone(schema);
  // Operands select original evidence rather than freely paraphrasing it.
  // Bind source, field and literal together; semantic and arithmetic validation
  // still decide whether the selected measurement answers the question.
  const operandChoices = sources.flatMap(source => {
    if (source.text === undefined) return [];
    const literals = [...new Set([
      ...[...source.text.matchAll(/(?<![\p{L}\p{N}_.+−-])([+−-]?\d+(?:\.\d+)?)[ -]+([A-Za-z]+)(?![\p{L}\p{N}_])/gu)]
        .filter(match => units[match[2].toLowerCase()]).map(match => match[0]),
      ...(source.text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []),
      ...(/^(?:care|claim):/.test(source.sourceId) ? [source.sourceId] : []),
    ])];
    const option = (field: string, values: string[]) => ({ type: "object", additionalProperties: false,
      required: ["sourceId", "field", "literal"], properties: {
        sourceId: { type: "string", enum: [source.sourceId] }, field: { type: "string", enum: [field] },
        literal: { type: "string", enum: values },
      } });
    return [...(literals.length ? [option("text", literals)] : []),
      ...(source.occurredAt ? [option("occurredAt", [source.occurredAt])] : [])];
  });
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) for (const [key, child] of Object.entries(properties)) {
      if (["sourceIds", "relevantContextIds"].includes(key)) child.items = { type: "string", enum: ids };
      if (key === "sourceId" && !child.enum) child.enum = ids;
      if (key === "targetSourceId") child.enum = [...targets, null];
      if (key === "operands" && operandChoices.length) child.items = { anyOf: structuredClone(operandChoices) };
    }
    Object.values(node).forEach(visit);
  };
  visit(copy);
  return copy;
}
