export const readNeedsSchema = { type: ["array", "null"], maxItems: 4, items: {
  type: "object", additionalProperties: false, required: ["needId", "from", "to", "target", "termGroups", "ordering"], properties: {
    needId: { type: "string", description: "ID of the grounded evidenceNeeds entry, e.g. need:0. Never invent a source or subject." },
    from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
    target: { type: ["string", "null"], description: "Explicit requested ISO day or month matching this window; null otherwise." },
    termGroups: { type: "array", minItems: 1, maxItems: 4, description: "Separate advisory database searches. OR within each group. Separate rare event aliases from common topic terms so they receive an independent bounded probe. An empty group requests dated context without lexical filtering.",
      items: { type: "array", maxItems: 6, items: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z][A-Za-z -]*[A-Za-z]$" } } },
    ordering: { type: "string", enum: ["asc", "desc"] },
  },
} };
