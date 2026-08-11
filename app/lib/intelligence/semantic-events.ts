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

export function humanizeSemanticEventTitle(proposal: CanonicalEventProposal) {
  const supplied = proposal.eventTitle.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (isSafeEventTitle(supplied, proposal.topic)) return supplied;
  const subject = ({
    health: "Health issue", behavior: "Behavior issue", nutrition: "Food", medication: "Medication",
    safety: "Safety incident", routine: "Routine", care: "Care update", other: "Care update",
    preference: "Preference", profile: "Profile", shopping: "Shopping preference",
  } as Record<string, string>)[proposal.domain] || "Care update";
  if (proposal.transition === "started") return subject === "Medication" ? "Started medication" : `${subject} started`;
  if (proposal.transition === "changed") return `${subject} changed`;
  if (proposal.transition === "improved") return `${subject} improved`;
  if (proposal.transition === "worsened") return `${subject} worsened`;
  if (proposal.transition === "resolved") return `${subject} resolved`;
  if (proposal.transition === "corrected") return `${subject} corrected`;
  if (proposal.transition === "confirmed") return subject;
  return subject;
}

export function governCanonicalEvents(input: {
  proposals: CanonicalEventProposal[];
  message: string;
  resolvedPetSubject?: { id: string; name: string | null };
  /** @deprecated Test/backward-compatible alias. Production callers must pass resolvedPetSubject. */
  pet?: { id: string; name: string | null };
  activeEpisodes: CareEpisode[];
}): SemanticEventGovernance {
  const resolvedPetSubject = input.resolvedPetSubject || input.pet;
  if (!resolvedPetSubject) return { accepted: [], rejected: input.proposals.map((proposal) => ({ proposal, reason: "ambiguous_subject" })) };
  const accepted: GovernedCanonicalEvent[] = [];
  const rejected: SemanticEventGovernance["rejected"] = [];
  for (const rawProposal of input.proposals.slice(0, 4)) {
    const proposal = normalizeLifecycleProposal(rawProposal);
    const reason = validateProposal(proposal, input.message, resolvedPetSubject);
    if (reason) { rejected.push({ proposal, reason }); continue; }
    const proposedTopic = normalizeSemanticTopic(proposal.topic);
    const compatible = input.activeEpisodes.map((episode) => ({ episode, score: compatibilityScore(proposal.domain, proposedTopic, episode) }))
      .filter((candidate) => candidate.score >= 0.72)
      .sort((left, right) => right.score - left.score || Date.parse(right.episode.last_event_at) - Date.parse(left.episode.last_event_at));
    if (NEEDS_ACTIVE.has(proposal.transition) && compatible.length === 0) {
      rejected.push({ proposal, reason: "no_compatible_active_episode" }); continue;
    }
    if (NEEDS_ACTIVE.has(proposal.transition) && compatible.length > 1 && compatible[0].score === compatible[1].score) {
      rejected.push({ proposal, reason: "ambiguous_episode" }); continue;
    }
    const episode = compatible[0]?.episode || null;
    const normalizedTopic = episode ? episodeSemanticTopic(proposal.domain, episode) : proposedTopic;
    const event: CanonicalEvent = {
      ...proposal,
      topic: normalizedTopic,
      normalizedTopic,
      eventTitle: humanizeSemanticEventTitle(proposal),
      subject: { ...proposal.subject, id: proposal.subject.type === "pet" ? resolvedPetSubject.id : null },
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
  if (proposal.state === "resolved" && proposal.transition !== "resolved") return "invalid_transition";
  if (["started", "continued", "worsened"].includes(proposal.transition) && proposal.state === "resolved") return "invalid_transition";
  if (proposal.transition === "preference_set" && !["preference", "shopping"].includes(proposal.domain)) return "invalid_transition";
  return null;
}

function normalizeLifecycleProposal(proposal: CanonicalEventProposal): CanonicalEventProposal {
  // A terminal state is authoritative only when a compatible positive recovery
  // transition supports it. Promotion happens before validation so resolution's
  // stricter confidence floor and active-episode requirements still apply.
  return proposal.state === "resolved" && proposal.transition === "improved"
    ? { ...proposal, transition: "resolved" }
    : proposal;
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

function episodeSemanticTopic(domain: string, episode: CareEpisode) {
  const summaryTopic = typeof episode.summary?.semanticTopic === "string" ? episode.summary.semanticTopic : "";
  if (summaryTopic) return normalizeSemanticTopic(summaryTopic);
  const prefix = `${domain}_`;
  return normalizeSemanticTopic(episode.normalized_key.startsWith(prefix) ? episode.normalized_key.slice(prefix.length) : episode.normalized_key);
}

function compatibilityScore(domain: string, topic: string, episode: CareEpisode) {
  const episodeDomain = typeof episode.summary?.semanticDomain === "string"
    ? episode.summary.semanticDomain
    : episode.normalized_key.startsWith(`${domain}_`) ? domain : null;
  if (episodeDomain !== domain) return 0;
  const episodeTopic = episodeSemanticTopic(domain, episode);
  if (episode.normalized_key === semanticEpisodeKey(domain, topic) || episode.normalized_key === topic || episodeTopic === topic) return 1;
  if (compactTopic(episodeTopic) === compactTopic(topic)) return 0.98;
  const left = meaningfulTopicTokens(topic);
  const right = meaningfulTopicTokens(episodeTopic);
  if (!left.length || !right.length) return 0;
  const overlap = left.filter((token) => right.includes(token)).length;
  if (!overlap) return 0;
  const coverage = overlap / Math.max(left.length, right.length);
  return overlap === Math.min(left.length, right.length) ? Math.max(coverage, 0.78) : coverage;
}

function compactTopic(value: string) { return normalizeSemanticTopic(value).replace(/_/g, ""); }

function meaningfulTopicTokens(value: string) {
  const ignored = new Set(["pet", "issue", "problem", "incident", "event", "change", "changed", "start", "started", "stop", "stopped", "resolve", "resolved", "temporary", "course"]);
  return [...new Set(normalizeSemanticTopic(value).split("_").map((token) => token.replace(/(?:ing|ed|s)$/i, "")).filter((token) => token.length > 2 && !ignored.has(token)))];
}

function isSafeEventTitle(value: string, topic: string) {
  if (value.length < 2 || value.includes("_") || !/[a-z]/i.test(value)) return false;
  const normalizedTitle = normalizeSemanticTopic(value);
  if (!normalizedTitle || compactTopic(normalizedTitle) === compactTopic(topic)) return false;
  const transitionRoots = normalize(value).split(" ").map((word) => word.replace(/(?:ing|ed|s)$/i, ""))
    .filter((word) => ["start", "stop", "resolv", "chang", "improv", "worsen", "confirm", "correct"].includes(word));
  return new Set(transitionRoots).size === transitionRoots.length;
}
