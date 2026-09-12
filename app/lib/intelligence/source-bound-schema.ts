/** Provider constraints reduce invalid identities before generation. The final
 * eligibility, ownership and semantic checks remain authoritative. */
export function sourceBoundSchema<T extends object>(schema: T, sources: readonly { sourceId: string; sourceType: string }[]): T {
  const ids = [...new Set(sources.map(source => source.sourceId))];
  if (!ids.length) return schema;
  const targets = sources.filter(source => ["care_update", "memory", "concern"].includes(source.sourceType)).map(source => source.sourceId);
  const copy = structuredClone(schema);
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as Record<string, unknown>;
    const properties = node.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties) for (const [key, child] of Object.entries(properties)) {
      if (["sourceIds", "relevantContextIds"].includes(key)) child.items = { type: "string", enum: ids };
      if (key === "sourceId") child.enum = ids;
      if (key === "targetSourceId") child.enum = [...targets, null];
    }
    Object.values(node).forEach(visit);
  };
  visit(copy);
  return copy;
}
