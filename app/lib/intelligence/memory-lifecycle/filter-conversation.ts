import type { IntelligenceConversationTurn } from "../types.ts";

export type InactiveMemoryMarker = {
  fact_key: string;
  fact_value: unknown;
  normalized_value: string | null;
  status: string;
  updated_at: string;
};

export function removeInactiveMemoryClaimsFromConversation(
  turns: IntelligenceConversationTurn[],
  markers: InactiveMemoryMarker[],
) {
  const inactive = markers.flatMap((marker) => {
    if (!isInactiveStatus(marker.status)) return [];
    const phrases = [factValueText(marker.fact_value), cleanStoredValue(marker.normalized_value)].filter((value) => value.length >= 3);
    const changedAt = Date.parse(marker.updated_at) || 0;
    return phrases.map((phrase) => ({
      changedAt,
      factKey: normalize(marker.fact_key),
      phrase: normalize(phrase),
      tokens: meaningfulTokens(phrase),
    })).filter((item) => item.phrase.length >= 3);
  });
  if (!inactive.length) return turns;
  return turns.filter((turn) => {
    const turnTime = Date.parse(turn.createdAt) || 0;
    const text = normalize(turn.text);
    return !inactive.some((item) => turnTime <= item.changedAt && (
      text.includes(item.phrase)
      || (item.tokens.length > 0 && item.tokens.every((token) => text.includes(token)))
      || (item.factKey.includes("budget") && /\b(?:budget|under|less than|max(?:imum)?)\b/.test(text) && item.tokens.some((token) => /\$?\d+/.test(token) && text.includes(token)))
      || (/retailer|store/.test(item.factKey) && item.tokens.some((token) => text.includes(token)))
    ));
  });
}

function isInactiveStatus(status: string) { return ["resolved", "superseded", "rejected", "expired"].includes(status); }
function factValueText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return ["text", "value", "name", "preference"].map((key) => record[key]).find((item): item is string => typeof item === "string") || "";
  }
  return "";
}
function cleanStoredValue(value: string | null) { return value?.replace(/^"|"$/g, "") || ""; }
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim(); }
function meaningfulTokens(value: string) {
  const ignored = new Set(["a", "an", "and", "at", "because", "but", "for", "i", "is", "it", "me", "my", "of", "or", "the", "to", "usually"]);
  return normalize(value).split(/\s+/).filter((token) => token.length >= 3 && !ignored.has(token)).slice(0, 6);
}
