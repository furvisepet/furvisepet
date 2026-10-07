import { completeInstantSchema } from "../furvise-brain/complete-instant.ts";

/**
 * Provider-only grammar compatibility. Call after the authoritative wire codec
 * has been compiled, and decode responses with that original codec unchanged.
 * This deliberately relaxes only the duplicated complete-instant pattern sent
 * to the provider. It does not validate, normalize or repair returned values.
 */
export function createAskProviderWireSchema(authoritativeSchema: Record<string, unknown>, checkBudget: () => void = () => {}): Record<string, unknown> {
  checkBudget();
  const schema = structuredClone(authoritativeSchema);
  const visit = (value: unknown): void => {
    checkBudget();
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    if (node.pattern === completeInstantSchema.pattern) delete node.pattern;
    // Visit schema locations only. Enum literals, descriptions and instance
    // identities are data and must remain byte-for-byte unchanged.
    for (const key of ["$defs", "properties"]) {
      const children = node[key];
      if (children && typeof children === "object" && !Array.isArray(children))
        Object.values(children).forEach(visit);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(visit);
    if (node.items) visit(node.items);
  };
  visit(schema);
  checkBudget();
  return schema;
}
