import { splitSentencesPreservingFacts } from "../ai/text-segmentation.ts";
export type OwnerNoteEnrichment = {
  version: "owner-note.v1";
  observations: Array<{ quote: string; kind: "symptom" | "normal_finding" | "care" | "other"; certainty: "reported" | "uncertain"; confidence: number }>;
};

/** Derived annotations never become canonical diagnoses, episode transitions,
 * or counts. Every annotation must retain an exact quote from its current source. */
export function validateOwnerNoteEnrichment(value: unknown, note: string): OwnerNoteEnrichment {
  if (!value || typeof value !== "object") throw new Error("NOTE_EXTRACTION_INVALID");
  const candidate = value as OwnerNoteEnrichment;
  if (candidate.version !== "owner-note.v1" || !Array.isArray(candidate.observations) || candidate.observations.length > 12) throw new Error("NOTE_EXTRACTION_INVALID");
  const sentences = splitSentencesPreservingFacts(note);
  const observations = candidate.observations.filter(item => {
    if (!item || typeof item.quote !== "string" || !item.quote.trim() || item.quote.length > 1200 || !sentences.includes(item.quote)
      || !["symptom", "normal_finding", "care", "other"].includes(item.kind)
      || !["reported", "uncertain"].includes(item.certainty)
      || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw new Error("NOTE_EXTRACTION_INVALID");
    return item.confidence >= 0.8;
  }).map(item => ({ quote: item.quote, kind: item.kind, certainty: /\b(?:may|might|maybe|possibly|possible|uncertain|not sure|could|suspected)\b/i.test(item.quote) ? "uncertain" as const : item.certainty, confidence: item.confidence }));
  return { version: "owner-note.v1", observations };
}

export type NoteJob = { id: string; entry_id: string; user_id: string; pet_profile_id: string; pet_name: string; source_note: string; lease_token: string; attempts: number };
export async function processOwnerNoteJob(job: NoteJob, dependencies: {
  extract: (job: NoteJob) => Promise<unknown>;
  finish: (job: NoteJob, result: OwnerNoteEnrichment | null, error: string | null) => Promise<void>;
}) {
  let result: OwnerNoteEnrichment;
  try { result = validateOwnerNoteEnrichment(await dependencies.extract(job), job.source_note); }
  catch { await dependencies.finish(job, null, "NOTE_EXTRACTION_UNAVAILABLE"); return "retry" as const; }
  await dependencies.finish(job, result, null);
  return result.observations.length ? "enriched" as const : "uninterpreted" as const;
}
