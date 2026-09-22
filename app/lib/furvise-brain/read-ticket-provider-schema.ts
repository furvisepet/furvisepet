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
const legacyOutputs = readTicketSchema.properties.outputs;
const legacyUnboundedChronologicalOutputs = {
  ...legacyOutputs,
  properties: {
    ...legacyOutputs.properties,
    strategy: { ...legacyOutputs.properties.strategy, type: "string", enum: ["chronological"] },
    limit: { type: "null", description: "Unbounded chronological legacy retrieval only. Finite ordered takes belong in selection.take." },
  },
};
const legacyOtherOutputs = {
  ...legacyOutputs,
  properties: {
    ...legacyOutputs.properties,
    strategy: { ...legacyOutputs.properties.strategy, enum: ["temporal_endpoints", "calendar_samples", "event_candidates", null] },
  },
};
export const readTicketProviderSchema = {
  anyOf: [
    { type: "null" },
    {
      ...providerTicket, type: "object",
      description: "Legacy-only read: selection is null. Finite chronological ordering is no longer provider-expressible; use compositional selection.take instead.",
      properties: { ...providerTicket.properties, selection: { type: "null" },
        outputs: { anyOf: [legacyUnboundedChronologicalOutputs, legacyOtherOutputs] } },
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
