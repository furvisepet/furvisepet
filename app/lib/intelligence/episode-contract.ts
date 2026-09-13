import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import { formatHistoryPeriod } from "../furvise-output.ts";
import { readReviewedHistoryAnswer } from "./history-review-state.ts";
import type { HistoryCoverage } from "./history-retrieval.ts";

export type EpisodeItem = {
  id: string; sourceId: string; sourceVersion: string; episodeVersion: string | null;
  startedAt: string; sequenceNumber: number | null; recurrenceOf: string | null;
  ordinal: number; reportedOccurrences: number | null;
};
export type EpisodeReferences = {
  version: "ask-episodes.v1"; ownerId: string; conversationId: string;
  petId: string; topic: string; from: string | null; to: string | null;
  coverage: "partial"; exactTotal: null;
  items: EpisodeItem[]; selectedId: string | null;
};
export type EpisodeResult = {
  conversational?: boolean;
  petName?: string;
  version: "ask-episodes.v1"; petId: string; topic: string;
  from: string | null; to: string | null; items: EpisodeItem[];
  supportedCount: number; exactTotal: number | null; entryCount: number;
  coverage: "partial" | "ambiguous" | "unavailable" | "recorded_complete";
  recordedInventory?: { revision: string; snapshot: string; scope: "care_claim_episode_register" };
  reasons: string[]; provenance: HistoryCoverage["provenance"];
  referenceStatus: "list" | "resolved" | "stale" | "clarify";
  referenceBasis?: "displayed_list" | "scoped_register";
  presentationHint?: import("./episode-presentation.ts").EpisodePresentation & { selectedLabel: string };
  references?: EpisodeReferences;
  details?: Array<{ sourceId: string; occurredAt: string; note: string }>;
};
export function episodeAnswer(result: EpisodeResult): { summary: string; sections: { heading: string; items: string[] }[] } {
  if (result.reasons.includes("all_illness_lifetime_total_unknown")) return { summary: "I can’t establish the exact number of illnesses your pets have ever had. Saved notes may describe the same illness more than once, and they do not establish unrecorded events. I can summarize documented problems for each pet instead.", sections: [] };
  if (result.reasons.includes("episode_correction_unresolved")) return {
    summary: "I can't verify an episode count because some saved corrections are not linked to the reports they change. This does not mean there were no episodes. Review the correction notes in History and identify the original reports before relying on a count.", sections: [],
  };
  if (result.conversational) {
    const legacy = episodeAnswer({ ...result, conversational: false });
    if (result.coverage === "unavailable") return { summary: "I couldn't recheck the saved episode notes just now. Please try again before relying on a count or that episode.", sections: [] };
    if (result.referenceStatus === "stale") return { summary: "That episode's saved notes have changed, been corrected, or been removed. Ask for a fresh list so I can check the current records.", sections: [] };
    if (result.referenceStatus === "clarify") return legacy;
    if (result.referenceStatus === "resolved") return { ...legacy, summary: `For episode ${result.items[0].ordinal} ${result.referenceBasis === "scoped_register" ? "in the requested period" : "from the list you saw"}, here are the dated notes:`,
      sections: legacy.sections.map(section => ({ ...section, heading: "Recorded notes" })) };
    if (result.coverage === "recorded_complete") return legacy;
    const lead = result.supportedCount ? `I can verify ${result.supportedCount} separate ${result.topic} episode${result.supportedCount === 1 ? "" : "s"}${result.petName ? ` for ${result.petName}` : ""} in the saved notes.`
      : `I couldn't verify separate ${result.topic} episodes from the notes I checked.`;
    const missing = result.reasons.includes("episode_source_links_missing") ? " Some episode records are missing the source notes needed to check them." : "";
    return { ...legacy, summary: `${lead}${missing} The saved notes don't establish a complete lifetime total.`,
      sections: legacy.sections.map(section => ({ ...section, heading: "Recorded episodes" })) };
  }
  if (result.coverage==="unavailable") return {summary:"The episode evidence is unavailable or could not be revalidated. I can't establish a count or identify that episode; please retry.",sections:[]};
  if (result.referenceStatus==="stale") return {summary:"The episode you selected has changed, been corrected, or been removed. I haven't substituted another episode. Please request a fresh list to review the current evidence.",sections:[]};
  if (result.referenceStatus==="clarify" && result.reasons.includes("episode_count_scope_needed")) return {summary:"Which symptom should I count, for example, vomiting or soft stool? I need a specific symptom to distinguish separate episodes in the saved history.",sections:[]};
  if (result.referenceStatus === "clarify" && result.reasons.some(reason => ["scoped_episode_selection_unavailable", "scoped_episode_period_incomplete"].includes(reason))) return { summary: "I couldn't verify that episode's position across the whole requested period. Please narrow the period or identify its approximate date; this does not mean the episode never happened.", sections: [] };
  if (result.referenceStatus === "clarify" && result.referenceBasis === "scoped_register") return { summary: "The saved records do not establish the requested episode within that period well enough to identify its onset, resolution, or duration. This does not mean the event never happened.", sections: [] };
  if (result.referenceStatus==="clarify" && result.presentationHint) return {summary:`The earlier answer labelled that item ${JSON.stringify(result.presentationHint.selectedLabel)}. That is wording from our conversation, not a verified source record. I can't establish what changed from that list alone; use that date to find the original care notes.`,sections:[]};
  if (result.referenceStatus==="clarify") return {summary:"Which displayed episode do you mean? Please identify the pet and the list or approximate date. I can't safely resolve this reference from conversation wording alone.",sections:[]};
  if (result.referenceStatus==="resolved" && result.details?.length) {
    return {
      summary:`Here are the recorded observations for episode ${result.items[0].ordinal} ${result.referenceBasis === "scoped_register" ? "in the requested period" : "from your original list"}, in date order. These are reports, not proof of a cause or a current diagnosis.`,
      sections:[{heading:"Recorded episode history",items:result.details.map(d=>`${d.occurredAt.slice(0,10)}: Recorded note: ${JSON.stringify(d.note)}`)}],
    };
  }
  if (result.coverage === "recorded_complete" && Number.isSafeInteger(result.exactTotal) && result.exactTotal! >= 0 && result.recordedInventory) {
    const period = formatHistoryPeriod(result.from, result.to);
    return {summary:`Exactly ${result.exactTotal} recorded ${result.topic} episode${result.exactTotal === 1 ? "" : "s"} in your verified saved care history${period}, checked on ${result.recordedInventory.snapshot.slice(0,10)}. Showing ${result.items.length}. This count covers episodes established by saved care records. Chat messages that were not saved to history are outside this count; unrecorded episodes remain unknown.`,
      sections:result.items.length ? [{heading:"Recorded episodes",items:result.items.map(i=>`Episode ${i.ordinal}: ${i.startedAt.slice(0,10)}, ${result.topic}.`)}] : []};
  }
  const summary=result.referenceStatus==="resolved" ? `This is episode ${result.items[0].ordinal} from the list you were shown, with its original position preserved.`
    : `${result.supportedCount} explicitly supported ${result.topic} episode group${result.supportedCount===1 ? "" : "s"} in the available evidence. This is a supported subset, not an exact lifetime total or a complete list. Care entries and individual symptom occurrences are different units; ambiguous grouping remains unknown.`;
  const disclosure = result.reasons.includes("episode_source_links_missing")
    ? " Some retrieved episode records have source notes missing from the retrieved evidence, so they cannot be verified or included in this list. This does not mean those episodes never happened." : "";
  return {summary:summary + disclosure + (result.reasons.some(r => r.startsWith("recorded_inventory_")) ? " The exact recorded-register total is unknown because the inventory or its classification could not be certified." : ""),sections:result.items.length ? [{heading:"Supported episodes",items:result.items.map(i=>`Episode ${i.ordinal}: ${i.startedAt.slice(0,10)}, ${result.topic}${i.reportedOccurrences ? `; ${i.reportedOccurrences} reported occurrences within this one episode` : ""}.`)}] : []};
}

/** Called at the real persistence boundary after all response transformations.
 * Do not persist reference authority for a list that was replaced or omitted. */
export function attachEpisodeReferences<T extends {directAnswer:string;sections?:unknown}>(response:T,result?:EpisodeResult, reviewedResult?: AskReasoningResult): T & {episodeReferences?:EpisodeReferences} {
  const clean={...response};
  delete (clean as {episodeReferences?:unknown}).episodeReferences;
  if (!result?.references) return clean;
  const answer=episodeAnswer(result);
  if (clean.directAnswer!==answer.summary || JSON.stringify(clean.sections)!==JSON.stringify(answer.sections)) {
    const receipt = reviewedResult && readReviewedHistoryAnswer(reviewedResult);
    // Only the original reviewed object can carry a projected reference. A
    // selected target retains its previously validated list identity. A newly
    // displayed list must contain the entire canonical ordering contiguously.
    const canonicalList = answer.sections.flatMap(section => section.items).join("\n");
    if (!receipt || reviewedResult?.evidenceContract?.episodes !== result
      || clean.directAnswer !== receipt.text
      || !(result.referenceStatus === "resolved" && result.references.selectedId
        || result.referenceStatus === "list" && canonicalList && receipt.text.includes(canonicalList))) return clean;
  }
  return {...clean,episodeReferences:result.references};
}

/** A server-derived result is factual input, never a mutation permission. */
export function episodeResultText(result: EpisodeResult): string {
  const answer = episodeAnswer(result);
  return [answer.summary, ...answer.sections.flatMap(section => section.items)].join("\n");
}
