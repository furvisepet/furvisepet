export type AskConversationSummary = {
  id: string;
  petId: string;
  petName: string;
  title: string;
  preview: string;
  status: "active" | "archived";
  lastActivityAt: string;
};

export type StoredAskSuggestion = {
  id: string;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string;
  details: string | null;
  status: "pending" | "saved" | "dismissed";
  applyStatus?: "applied" | "already_applied";
  careEntryId?: string | null;
  concernId?: string | null;
};

export type StoredAskMessage =
  | { id: string; role: "user"; text: string; createdAt: string; requestId?: string | null; failed?: boolean }
  | {
      id: string;
      role: "furvise";
      response: unknown;
      saveMetadata: unknown | null;
      contextUsed: unknown | null;
      suggestion?: StoredAskSuggestion | null;
      automaticSaveConfirmation?: string | null;
      carePersistence?: {
        status: "persisted" | "suggested" | "skipped" | "failed";
        careEntryIds: string[];
        concernIds: string[];
        errorCode: string | null;
        memoryIds?: string[];
        profileUpdated?: boolean;
      } | null;
      createdAt: string;
    };

export type AskConversationDetail = AskConversationSummary & {
  messages: StoredAskMessage[];
  olderMessagesCursor?: number | null;
};

type RetryMessageRow = { id: string; request_id?: string | null; role: "user" | "furvise"; user_text?: string | null; created_at: string };

/**
 * Collapses only the legacy retry shape: an orphaned user request immediately
 * followed by the same text on a request that has a completed assistant row.
 * Two successful, intentional repetitions remain distinct.
 */
export function deduplicateLegacyRetriedMessages<T extends RetryMessageRow>(messages: T[]): T[] {
  const assistantRequests = new Set(messages.filter((item) => item.role === "furvise" && item.request_id).map((item) => item.request_id));
  const hidden = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const earlier = messages[index];
    if (earlier.role !== "user" || !earlier.request_id || assistantRequests.has(earlier.request_id)) continue;
    const later = messages.slice(index + 1).find((item) => item.role === "user");
    if (!later?.request_id || !assistantRequests.has(later.request_id)) continue;
    const elapsed = Date.parse(later.created_at) - Date.parse(earlier.created_at);
    if (elapsed < 0 || elapsed > 2 * 60 * 60 * 1000) continue;
    if (normalizeMessageText(earlier.user_text) === normalizeMessageText(later.user_text)) hidden.add(earlier.id);
  }
  return messages.filter((item) => !hidden.has(item.id));
}

export type PersistenceNotice = { key: string; label: string; type: "care" | "memory" | "profile" };

export function getPersistenceNotices(message: {
  automaticSaveConfirmation?: string | null;
  carePersistence?: Extract<StoredAskMessage, { role: "furvise" }>['carePersistence'];
  suggestion?: { status?: "pending" | "saved" | "dismissed"; applyStatus?: "applied" | "already_applied"; careEntryId?: string | null } | null;
}): PersistenceNotice[] {
  const ids = new Set(message.carePersistence?.status === "persisted" ? message.carePersistence.careEntryIds : []);
  const memoryIds = new Set(message.carePersistence?.memoryIds || []);
  const suggestionSaved = message.suggestion?.status === "saved" || Boolean(message.suggestion?.applyStatus);
  if (suggestionSaved && message.suggestion?.careEntryId) ids.add(message.suggestion.careEntryId);
  const notices: PersistenceNotice[] = [];
  if (ids.size) {
    const already = message.suggestion?.applyStatus === "already_applied";
    notices.push({
      key: `care:${[...ids].sort().join(",")}`,
      label: ids.size > 1 ? `Added ${ids.size} updates to care history` : already ? "Already in care history" : "Added to care history",
      type: "care",
    });
  } else if (suggestionSaved && message.suggestion?.careEntryId) {
    notices.push({ key: "care:legacy", label: message.suggestion?.applyStatus === "already_applied" ? "Already in care history" : "Added to care history", type: "care" });
  }
  if (memoryIds.size) notices.push({ key: `memory:${[...memoryIds].sort().join(",")}`, label: "Remembered for future questions", type: "memory" });
  if (message.carePersistence?.profileUpdated) notices.push({ key: "profile:updated", label: "Updated pet profile", type: "profile" });
  return notices.slice(0, 3);
}

function normalizeMessageText(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function deriveConversationTitle(question: string, petName: string) {
  const cleanPetName = petName.trim() || "Your pet";
  const normalized = question.toLowerCase();
  // A keyword identifies a topic, never evidence that a symptom, change, or
  // treatment occurred. Keep titles neutral even for negated/hypothetical asks.
  const topics: [RegExp, string][] = [
    [/\b(vet|veterinarian|appointment|visit)\b/, "Vet visits"],
    [/\b(scratch|scratching|itch|itchy)\b/, "Scratching and itching"],
    [/\b(food|diet|kibble|meal)\b/, "Food and diet"],
    [/\b(dental|teeth|tooth|brushing)\b/, "Dental care"],
    [/\b(bites?|biting|nips?|nipping|aggression|aggressive)\b/, "Biting and behavior"],
    [/\b(litter box|pee|peeing|urine|urinating)\b/, "Toileting"],
    [/\b(hide|hiding|withdrawn)\b/, "Hiding and behavior"],
    [/\b(vomit|vomiting|throwing up)\b/, "Vomiting"],
    [/\b(limp|limping)\b/, "Limping"],
    [/\b(appetite|not eating|won't eat)\b/, "Appetite"],
    [/\b(meow|meowing|vocal|vocalizing)\b/, "Vocal behavior"],
    [/\b(routine|schedule|habit)\b/, "Care routines"],
    [/\b(track|monitor|watch)\b/, "Care tracking"],
  ];
  const topic = topics.find(([pattern]) => pattern.test(normalized));
  if (topic) return `About ${topic[1].toLowerCase()}`;

  // Preserve the owner's wording: stripping “is”, negation, or pronouns can
  // turn a question into a claim or assign another animal's symptoms to this pet.
  const excerpt = question.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!excerpt) return `Question about ${cleanPetName}`;
  return excerpt.length > 72 ? `${excerpt.slice(0, 71).trimEnd()}…` : excerpt;
}

export function formatConversationDate(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function clearAskClientState(storage: Pick<Storage, "key" | "length" | "removeItem">) {
  const prefixes = ["furvise:ask-draft:", "furvise:ask-thread:"];
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
  }
}
