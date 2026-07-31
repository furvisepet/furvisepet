import type { CareEntryRow } from "../supabase";
import type { FurviseLiveContext } from "./types";

const stopWords = new Set(["about", "after", "again", "could", "from", "have", "help", "just", "should", "that", "their", "there", "they", "this", "what", "when", "where", "which", "with", "would", "your"]);

export function selectRelevantCareEntries(entries: CareEntryRow[], message: string, limit = 20) {
  const terms = tokenize(message);
  return [...entries]
    .map((entry) => ({ entry, score: scoreCareEntry(entry, terms) }))
    .sort((left, right) => right.score - left.score || eventTime(right.entry) - eventTime(left.entry))
    .slice(0, Math.max(10, Math.min(20, limit)))
    .map(({ entry }) => entry);
}

export function finalizeFurviseContext(context: Omit<FurviseLiveContext, "selectedCareEntries">): FurviseLiveContext {
  return {
    ...context,
    selectedCareEntries: selectRelevantCareEntries(context.careEntries, context.currentMessage),
  };
}

function scoreCareEntry(entry: CareEntryRow, terms: string[]) {
  const text = `${entry.category} ${entry.title || ""} ${entry.note}`.toLowerCase();
  const ageDays = Math.max(0, (Date.now() - eventTime(entry)) / 86_400_000);
  let score = Math.max(0, 18 - ageDays * 0.35);
  if (entry.severity === "severe") score += 45;
  else if (entry.severity === "moderate") score += 25;
  else if (entry.severity === "mild") score += 8;
  score += terms.reduce((total, term) => total + (text.includes(term) ? 14 : 0), 0);
  if (/symptom|medication|vet_visit/.test(entry.category)) score += 7;
  if (/normal|resolved|improved|returned to normal/i.test(text)) score += 6;
  return score;
}

function tokenize(value: string) {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
    .filter((term) => !stopWords.has(term))
    .slice(0, 20);
}

function eventTime(entry: CareEntryRow) {
  return Date.parse(entry.occurred_at || entry.created_at) || 0;
}
