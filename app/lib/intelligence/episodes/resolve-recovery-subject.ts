import type { PetConcern } from "../../ai/concern-engine.ts";
import type { CareEpisode } from "./types.ts";

type Topic = { key: string; title: string; pattern: RegExp };

const RECOVERY_TOPICS: Topic[] = [
  { key: "breathing", title: "Breathing returned to normal", pattern: /\b(breath(?:e|ing|s)?|deep breaths?|shortness of breath|panting)\b/i },
  { key: "ear_scratching", title: "Ear scratching returned to normal", pattern: /\b(ear(?:s)?|scratch(?:ing|ed|es)?|head shak(?:e|ing))\b/i },
  { key: "appetite_reduced", title: "Appetite returned to normal", pattern: /\b(appetite|eat(?:ing)?|food intake)\b/i },
];

export type RecoverySubject = { concernId: string | null; episodeId: string | null; normalizedKey: string | null; title: string };

export function resolveRecoverySubject(input: {
  message: string;
  recentConversation?: string[];
  activeEpisodes: CareEpisode[];
  activeConcerns: PetConcern[];
}): RecoverySubject {
  const explicitTopic = RECOVERY_TOPICS.find((topic) => topic.pattern.test(input.message));
  const recentTopic = explicitTopic || [...(input.recentConversation || [])].reverse().map((text) => RECOVERY_TOPICS.find((topic) => topic.pattern.test(text))).find(Boolean);
  const scoredEpisodes = input.activeEpisodes
    .filter((episode) => episode.episode_type === "symptom")
    .map((episode) => ({ episode, score: scoreCandidate(episode.normalized_key, episode.title, recentTopic, input.message) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || Date.parse(right.episode.last_event_at) - Date.parse(left.episode.last_event_at));
  const episode = scoredEpisodes[0]?.episode || null;
  const topic = recentTopic || topicForCandidate(episode?.normalized_key, episode?.title);
  const concerns = input.activeConcerns
    .map((concern) => ({ concern, score: scoreCandidate(concern.normalized_key, concern.title, topic, input.message) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const concern = concerns[0]?.concern || null;

  return {
    concernId: concern?.id || (episode?.linked_concern_id && input.activeConcerns.some((item) => item.id === episode.linked_concern_id) ? episode.linked_concern_id : null),
    episodeId: episode?.id || null,
    normalizedKey: topic?.key || episode?.normalized_key || concern?.normalized_key || null,
    title: topic?.title || "Symptom improved",
  };
}

function scoreCandidate(key = "", title = "", topic?: Topic, message = "") {
  const normalized = `${key} ${title}`.toLowerCase();
  if (topic) {
    if (key === topic.key) return 100;
    if (topic.key === "breathing" && /breath|pant/.test(normalized)) return 80;
    if (topic.key === "ear_scratching" && /ear|scratch|head shak/.test(normalized)) return 80;
    if (topic.key === "appetite_reduced" && /appetite|eating|food intake/.test(normalized)) return 80;
  }
  const candidateTokens = semanticTokens(`${key} ${title}`);
  const messageTokens = semanticTokens(message);
  const overlap = candidateTokens.filter((token) => messageTokens.includes(token)).length;
  return overlap ? 90 + Math.round(9 * overlap / Math.max(1, candidateTokens.length)) : 0;
}

function topicForCandidate(key = "", title = "") {
  return RECOVERY_TOPICS.find((topic) => key === topic.key || topic.pattern.test(`${key} ${title}`));
}

function semanticTokens(value: string) {
  return [...new Set(value.normalize("NFKC").toLowerCase().match(/[a-z0-9]{4,}/g) || [])]
    .map((token) => token.replace(/(?:ied|ing|ed|es|s)$/i, (suffix) => suffix === "ied" ? "y" : ""))
    .filter((token) => token.length >= 3 && !["active", "concern", "episode", "moderate", "symptom", "update"].includes(token));
}
