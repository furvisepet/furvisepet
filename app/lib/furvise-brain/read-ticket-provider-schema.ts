import { readTicketSchema } from "./read-ticket.ts";

// Provider alternatives describe the same ReadTicket, not a second planner.
// The binder remains authoritative for all incoming tickets, including callers
// that do not use constrained provider output. No conflicting field is stripped.
const { strategy: _legacyStrategy, ...publication } = readTicketSchema.properties.outputs.properties;
export const readTicketProviderSchema = {
  anyOf: [
    { type: "null" },
    {
      ...readTicketSchema, type: "object",
      description: "Legacy-only read: selection is null; existing output selectors retain their meaning.",
      properties: { ...readTicketSchema.properties, selection: { type: "null" } },
    },
    {
      ...readTicketSchema, type: "object",
      description: "Compositional read: selection alone defines semantic ordering and cardinality.",
      properties: {
        ...readTicketSchema.properties,
        selection: { ...readTicketSchema.properties.selection, type: "object" },
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
