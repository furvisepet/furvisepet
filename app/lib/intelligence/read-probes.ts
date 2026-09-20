import { readNeedsSchema, type ReadNeedBinding } from "../furvise-brain/read-needs.ts";
import { evidenceNeedsSchema, validateEvidenceNeeds } from "./evidence-needs.ts";

// Provider-only semantics. Identity is assigned after source grounding.
const { needId: _identity, ...dimensions } = readNeedsSchema.items.properties;
const { quote, sourceTurnId, petNames } = evidenceNeedsSchema.items.properties;
export const readProbesSchema = {
  type: ["array", "null"], maxItems: 4,
  description: "Distinct independently requested probes grounded in exact USER text. No IDs. Homogeneous work across subjects uses selection, not one probe per subject.",
  items: { type: "object", additionalProperties: false,
    required: ["quote", "sourceTurnId", "petNames", ...Object.keys(dimensions)],
    properties: { quote, sourceTurnId, petNames, ...dimensions } },
};
const fail = (field: string, rule: string): never => {
  throw new Error("ASK_REQUEST_INVALID:read_needs", { cause: { field, rule } });
};
export function groundReadProbes(raw: unknown, context: {
  currentMessage: string; currentTurn?: { id: string } | null;
  conversationTurns: readonly { id: string; role: string; text: string }[];
}, referenceIds: readonly string[], pets: readonly { id: string; name: string | null }[]) {
  if (raw != null && (!Array.isArray(raw) || raw.length > 4)) return fail("probes", "array_max_4");
  const probes = (raw ?? []) as Array<Record<string, unknown>>;
  for (const [index, probe] of probes.entries()) {
    if (!probe || typeof probe !== "object" || Array.isArray(probe)
      || Object.keys(probe).sort().join() !== [...readProbesSchema.items.required].sort().join())
      return fail("probes[" + index + "]", "id_free_probe_fields");
  }
  // Ground the whole batch before constructing internal retrieval needs.
  // Duplicate/invalid probes cannot be dropped and shift ID bindings.
  const plan = validateEvidenceNeeds(probes.map(probe => ({ quote: probe.quote,
    sourceTurnId: probe.sourceTurnId, petNames: probe.petNames, terms: [],
    order: probe.ordering === "asc" ? "earliest" : "latest" })),
    context.currentMessage, context.conversationTurns, referenceIds, pets, { scopeSource: "ticket" });
  if (plan.issues.length || plan.needs.length !== probes.length)
    return fail("probes", plan.issues[0] ?? "duplicate_probe_grounding");
  const bindings: ReadNeedBinding[] = plan.needs.map(need => {
    const source = need.sourceTurnId === null ? context.currentMessage
      : context.conversationTurns.find(turn => turn.id === need.sourceTurnId && turn.role === "user")!.text;
    const start = source.indexOf(need.quote);
    return { id: need.id, petIds: need.petIds?.length ? need.petIds : pets.map(pet => pet.id),
      sourceSpanId: (need.sourceTurnId ?? context.currentTurn?.id ?? "current") + ":" + start + ":" + (start + need.quote.length) };
  });
  const needs = probes.map((probe, index) => ({ needId: bindings[index].id,
    from: probe.from, to: probe.to, target: probe.target,
    termGroups: probe.termGroups, ordering: probe.ordering }));
  return { needs, bindings, evidenceNeeds: plan.needs };
}
