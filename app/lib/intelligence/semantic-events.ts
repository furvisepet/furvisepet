import type { CareEpisode } from "./episodes/types.ts";
import type { CanonicalEvent, CanonicalEventProposal, GovernedCanonicalEvent, IntelligenceLearning, SemanticPersistenceDestination } from "./types.ts";
import { routeSemanticEventDestinations } from "./persistence-destination.ts";

export type SemanticEventRejectionReason = "low_confidence" | "unsupported_evidence" | "wrong_pet" | "ambiguous_subject" | "invalid_transition" | "no_compatible_active_episode" | "ambiguous_episode";
export type SemanticEventGovernance = { accepted: GovernedCanonicalEvent[]; rejected: Array<{ proposal: CanonicalEventProposal; reason: SemanticEventRejectionReason }> };

const MUTATING = new Set(["resolved", "corrected"]);
const NEEDS_ACTIVE = new Set(["continued", "improved", "worsened", "resolved"]);

export function normalizeSemanticTopic(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}

export function semanticEpisodeKey(domain: string, topic: string) {
  return `${domain}_${normalizeSemanticTopic(topic)}`.slice(0, 120);
}

export function governCanonicalEvents(input: {
  proposals: CanonicalEventProposal[];
  message: string;
  pet: { id: string; name: string | null };
  activeEpisodes: CareEpisode[];
}): SemanticEventGovernance {
  const accepted: GovernedCanonicalEvent[] = [];
  const rejected: SemanticEventGovernance["rejected"] = [];
  for (const proposal of input.proposals.slice(0, 4)) {
    const reason = validateProposal(proposal, input.message, input.pet);
    if (reason) { rejected.push({ proposal, reason }); continue; }
    const normalizedTopic = normalizeSemanticTopic(proposal.topic);
    const key = semanticEpisodeKey(proposal.domain, normalizedTopic);
    const compatible = input.activeEpisodes.filter((episode) => episode.normalized_key === key || episode.normalized_key === normalizedTopic)
      .sort((left, right) => Date.parse(right.last_event_at) - Date.parse(left.last_event_at));
    if (NEEDS_ACTIVE.has(proposal.transition) && compatible.length === 0) {
      rejected.push({ proposal, reason: "no_compatible_active_episode" }); continue;
    }
    if (NEEDS_ACTIVE.has(proposal.transition) && compatible.length > 1 && compatible[0].last_event_at === compatible[1].last_event_at) {
      rejected.push({ proposal, reason: "ambiguous_episode" }); continue;
    }
    const episode = compatible[0] || null;
    const event: CanonicalEvent = {
      ...proposal,
      topic: normalizedTopic,
      normalizedTopic,
      subject: { ...proposal.subject, id: proposal.subject.type === "pet" ? input.pet.id : null },
      references: { priorEventIds: [], episodeId: episode?.id || null, concernId: episode?.linked_concern_id || null },
    };
    const destinations = routeSemanticEventDestinations(event);
    accepted.push({ event, destination: primaryDestination(destinations), destinations });
  }
  return { accepted, rejected };
}

export function learningFromSemanticEvent(item: GovernedCanonicalEvent): IntelligenceLearning | null {
  const memoryDestination = item.destinations.find((destination) => destination === "pet_memory" || destination === "owner_memory");
  if (!memoryDestination) return null;
  const event = item.event;
  return {
    subjectType: memoryDestination === "owner_memory" ? "owner" : "pet",
    subjectId: memoryDestination === "pet_memory" ? event.subject.id : null,
    category: event.domain === "shopping" ? "shopping" : "preference",
    factKey: event.normalizedTopic,
    factValue: event.sourceExcerpt,
    confidence: event.confidence,
    importance: event.importance === "urgent" ? "high" : event.importance === "important" ? "medium" : "low",
    durability: "durable",
    action: "create",
    sourceExcerpt: event.sourceExcerpt,
  };
}

function validateProposal(proposal: CanonicalEventProposal, message: string, pet: { id: string; name: string | null }): SemanticEventRejectionReason | null {
  const threshold = MUTATING.has(proposal.transition) ? 0.95 : proposal.state === "active" || proposal.state === "resolved" ? 0.9 : 0.85;
  if (proposal.confidence < threshold) return "low_confidence";
  if (!evidenceContains(message, proposal.sourceExcerpt)) return "unsupported_evidence";
  if (proposal.subject.type === "unknown" && proposal.state !== "historical") return "ambiguous_subject";
  if (proposal.subject.type === "pet" && proposal.subject.name && pet.name && normalize(proposal.subject.name) !== normalize(pet.name)) return "wrong_pet";
  if (proposal.transition === "resolved" && proposal.state !== "resolved") return "invalid_transition";
  if (["started", "continued", "worsened"].includes(proposal.transition) && proposal.state === "resolved") return "invalid_transition";
  if (proposal.transition === "preference_set" && !["preference", "shopping"].includes(proposal.domain)) return "invalid_transition";
  return null;
}

function primaryDestination(destinations: SemanticPersistenceDestination[]): SemanticPersistenceDestination {
  return destinations.find((destination) => destination === "episode_current_state") || destinations[0] || "none";
}

function evidenceContains(message: string, excerpt: string) {
  const full = normalize(message); const part = normalize(excerpt);
  if (part.length < 2) return false;
  if (full.includes(part)) return true;
  const words = [...new Set(part.split(" ").filter((word) => word.length > 2))];
  return words.length > 0 && words.filter((word) => full.includes(word)).length >= Math.min(2, words.length);
}
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
