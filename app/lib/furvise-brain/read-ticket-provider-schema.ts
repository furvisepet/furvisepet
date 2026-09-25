import { readTicketSchema } from "./read-ticket.ts";
import { readProbesSchema } from "../intelligence/read-probes.ts";

// Provider alternatives describe the same ReadTicket, not a second planner.
// The binder independently validates all callers; no conflicting field is stripped.
const { strategy: _legacyStrategy, ...publication } = readTicketSchema.properties.outputs.properties;
const { needs: _boundNeeds, ...semanticProperties } = readTicketSchema.properties;
const providerTicket = { ...readTicketSchema, type: "object",
  required: [...readTicketSchema.required.filter(field => field !== "needs"), "probes"],
  properties: { ...semanticProperties, probes: readProbesSchema },
};
const legacyOutputs = readTicketSchema.properties.outputs;
const noProbes = { ...readProbesSchema, maxItems: 0 };
const legacy = { ...providerTicket,
  properties: { ...providerTicket.properties, selection: { type: "null" } } };
const strategyRead = { ...legacy, properties: { ...legacy.properties,
  episode: { type: "null" }, probes: noProbes } };
const outputsFor = (strategy: string | null) => ({ ...legacyOutputs,
  properties: { ...legacyOutputs.properties,
    strategy: { ...legacyOutputs.properties.strategy, type: strategy === null ? "null" : "string", enum: [strategy] } } });

// General temporal, episode and grounded-probe relationships remain Binder-owned.
// Legacy endpoint, sample and candidate strategies remain compatibility-input-only.
export const readTicketProviderSchema = {
  anyOf: [
    { type: "null" },
    { ...legacy, description: "Ordinary read without a legacy strategy.",
      properties: { ...legacy.properties, outputs: outputsFor(null) } },
    { ...strategyRead, description: "Unbounded chronological legacy retrieval; finite takes use compositional selection.",
      properties: { ...strategyRead.properties,
        temporal: { ...semanticProperties.temporal,
          properties: { ...semanticProperties.temporal.properties, calendar: { type: "null" } } },
        outputs: { ...outputsFor("chronological"),
        properties: { ...outputsFor("chronological").properties,
          limit: { type: "null", description: "Unbounded chronological legacy retrieval only. Finite ordered takes belong in selection.take." } } } } },
    { ...providerTicket, description: "Compositional read: selection alone defines semantic ordering and cardinality.",
      properties: { ...providerTicket.properties,
        selection: { ...semanticProperties.selection, type: "object" },
        episode: { type: "null" }, probes: noProbes,
        temporal: { ...semanticProperties.temporal,
          properties: { ...semanticProperties.temporal.properties, calendar: { type: "null" } } },
        outputs: { type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit"],
          properties: { ...publication,
            ordering: { ...publication.ordering, description: "Presentation order only. Semantic ordering belongs in selection.orderBy." },
            limit: { ...publication.limit, description: "Global publication/transport cap only; normally null. Per-group cardinality belongs in selection.take." },
          } },
      } },
  ],
};

/** Calculation read domains mirror Calculate Binder; no selection is synthesized. */
export function calculationReadTicketProviderSchema(countOnly: boolean) {
  const ticket = structuredClone(providerTicket);
  Object.assign(ticket.properties, {
    operation: { type: "string", enum: ["read", "read_since_event"] },
    selection: countOnly ? { type: "null" } : { ...semanticProperties.selection, type: "object" },
    episode: { type: "null" }, probes: noProbes,
    temporal: { ...semanticProperties.temporal,
      properties: { ...semanticProperties.temporal.properties, calendar: { type: "null" } } },
    outputs: countOnly ? { ...outputsFor(null), properties: { ...outputsFor(null).properties,
      completeness: { type: "string", enum: ["exhaustive"] }, limit: { type: "null" } } }
      : { type: "object", additionalProperties: false, required: ["completeness", "ordering", "limit"],
          properties: { ...publication } },
  });
  return ticket;
}
