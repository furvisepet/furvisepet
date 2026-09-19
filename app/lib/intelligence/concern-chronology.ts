import type { PetConcern } from "../ai/concern-engine";
import type { CareEntryRow } from "../supabase";

export type ChronologyEventType = "urgent" | "recurrence" | "recovery" | "observation";
export type CanonicalChronologyState = "urgent" | "recently_resolved" | "routine";

export type ConcernChronology = {
  concernId: string | null;
  latestEvent: CareEntryRow | null;
  latestEventType: ChronologyEventType | null;
  state: CanonicalChronologyState;
};

export function deriveConcernChronology(entries: CareEntryRow[], concerns: PetConcern[]): ConcernChronology {
  const breathingConcerns = concerns.filter((concern) => concern.normalized_key === "breathing");
  const concernIds = new Set(breathingConcerns.map((concern) => concern.id));
  const relevant = entries.filter((entry) => concernIds.has(entry.concern_id || "") || isBreathingEvent(entry))
    .sort((left, right) => eventTime(right) - eventTime(left));
  const latestEvent = relevant[0] || null;
  const latestEventType = latestEvent ? classifyCareEvent(latestEvent) : null;
  const latestConcern = [...breathingConcerns].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0] || null;
  let state: CanonicalChronologyState = "routine";
  if (latestEventType === "recovery") state = "recently_resolved";
  else if (latestEventType === "recurrence" || latestEventType === "urgent") state = "urgent";
  else if (latestConcern?.status === "active" || latestConcern?.status === "reopened") state = "urgent";
  else if (latestConcern?.status === "resolved") state = "recently_resolved";
  return { concernId: latestEvent?.concern_id || latestConcern?.id || null, latestEvent, latestEventType, state };
}

export function classifyCareEvent(entry: CareEntryRow): ChronologyEventType {
  const text = `${entry.title || ""} ${entry.note}`;
  if (entry.state_action_type === "resolve_concern") return "recovery";
  if (entry.state_action_type === "reopen_concern") return "recurrence";
  if (/recurred|problem (?:is )?back|returned again|happening again|(?:ear )?scratching returned|symptoms? returned/i.test(text)) return "recurrence";
  if (/returned to normal|back to normal|normal again|breathing is normal|recovered|resolved/i.test(text)) return "recovery";
  if ((entry.severity === "severe" || entry.severity === "moderate") && isBreathingEvent(entry)) return "urgent";
  return "observation";
}

function isBreathingEvent(entry: CareEntryRow) {
  return /breath|breathing/i.test(`${entry.title || ""} ${entry.note}`);
}

function eventTime(entry: CareEntryRow) {
  return Date.parse(entry.occurred_at || entry.created_at) || Date.parse(entry.created_at) || 0;
}
