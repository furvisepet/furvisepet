import type { EpisodeEvent } from "./types.ts";

export function normalizeEpisodeKey(event: Pick<EpisodeEvent, "category" | "title" | "note">) {
  const text = `${event.title || ""} ${event.note}`;
  if (/breath|breathing/i.test(text)) return "breathing";
  if (event.category === "medication") return normalize(text.replace(/\b(started?|began|taking|finished?|completed?|stopped?)\b/gi, "")) || "medication_course";
  if (event.category === "food") return "current_food";
  if (["symptom", "behavior", "vet_visit"].includes(event.category)) return normalize(event.title || event.category);
  return null;
}

function normalize(value: string) {
  const tokens = value.toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens)].join("_").slice(0, 80);
}
