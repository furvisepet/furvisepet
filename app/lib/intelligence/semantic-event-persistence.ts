import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovernedCanonicalEvent } from "./types";
import { prepareGovernedCareHistoryEvent } from "./care-history-policy.ts";

export function oneSemanticEventPerPet(events: GovernedCanonicalEvent[], fallbackPetId: string) {
  const byPet = new Map<string, GovernedCanonicalEvent>();
  for (const event of events) {
    const targetPetId = event.event.subject.id || fallbackPetId;
    if (!byPet.has(targetPetId)) byPet.set(targetPetId, event);
  }
  return [...byPet.values()];
}

export function temporalForSemanticPersistence(temporal: GovernedCanonicalEvent["event"]["temporal"]) {
  const explicit = temporal.explicitTime?.normalize("NFKC").toLowerCase().trim() || "";
  const impreciseCurrentDay = /^(?:today|earlier today|this (?:morning|afternoon|evening)|tonight)$/.test(explicit);
  return impreciseCurrentDay ? { ...temporal, occurredAt: null } : temporal;
}

export function semanticEventRpcArguments({ event, fallbackPetId, sourceMessageId, userId }: {
  event: GovernedCanonicalEvent;
  fallbackPetId: string;
  sourceMessageId: string;
  userId: string;
}) {
  const proposal = event.event;
  const prepared = prepareGovernedCareHistoryEvent(event).event;
  return {
    p_event: {
      subject: { type: proposal.subject.type, name: proposal.subject.name },
      domain: proposal.domain,
      topic: proposal.normalizedTopic,
      eventTitle: prepared.eventTitle,
      transition: proposal.transition,
      state: proposal.state,
      temporal: temporalForSemanticPersistence(proposal.temporal),
      importance: proposal.importance,
      confidence: proposal.confidence,
      // The database verifies this as evidence against the source message. Keep
      // the verbatim grounded excerpt here; standalone owner-provenance copy is
      // reserved for reviewable UI/history proposals.
      sourceExcerpt: proposal.sourceExcerpt,
    },
    p_pet_id: proposal.subject.id || fallbackPetId,
    p_source_message_id: sourceMessageId,
    p_user_id: userId,
  };
}

export function persistSemanticEventRpc({ event, fallbackPetId, sourceMessageId, supabase, userId }: {
  event: GovernedCanonicalEvent;
  fallbackPetId: string;
  sourceMessageId: string;
  supabase: Pick<SupabaseClient, "rpc">;
  userId: string;
}) {
  return supabase.rpc("persist_furvise_server_semantic_event", semanticEventRpcArguments({
    event, fallbackPetId, sourceMessageId, userId,
  }));
}
