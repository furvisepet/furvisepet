import { readTicketSchema } from "./read-ticket.ts";
import { readProbesSchema } from "../intelligence/read-probes.ts";

// Provider alternatives describe the same ReadTicket, not a second planner.
// The binder remains authoritative for all incoming tickets, including callers
// that do not use constrained provider output. No conflicting field is stripped.
const { strategy: _legacyStrategy, ...publication } = readTicketSchema.properties.outputs.properties;
const { needs: _boundNeeds, ...semanticProperties } = readTicketSchema.properties;
const providerTicket = { ...readTicketSchema,
 required: [...readTicketSchema.required.filter(field => field !== "needs"), "probes"],
 properties: { ...semanticProperties, probes: readProbesSchema },
};
export const readTicketProviderSchema = {
  anyOf: [
    { type: "null" },
    {
      ...providerTicket, type: "object",
      description: "Legacy-only read: selection is null; existing output selectors retain their meaning.",
      properties: { ...providerTicket.properties, selection: { type: "null" } },
    },
    {
      ...providerTicket, type: "object",
      description: "Compositional read: selection alone defines semantic ordering and cardinality.",
      properties: {
        ...providerTicket.properties,
        selection: { ...readTicketSchema.properties.selection, type: "object" },
        probes: { ...readProbesSchema, maxItems: 0 },
        outputs: {
          type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit"],
          properties: { ...publication,
            ordering: { ...publication.ordering, description: "Presentation order only. Semantic ordering belongs in selection.orderBy." },
            limit: { ...publication.limit, description: "Global publication/transport cap only; normally null. Per-group cardinality belongs in selection.take." },
          },
        },
      },
    },
  ],
};
