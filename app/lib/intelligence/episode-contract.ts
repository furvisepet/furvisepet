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
  version: "ask-episodes.v1"; petId: string; topic: string;
  from: string | null; to: string | null; items: EpisodeItem[];
  supportedCount: number; exactTotal: null; entryCount: number;
  coverage: "partial" | "ambiguous" | "unavailable";
  reasons: string[]; provenance: HistoryCoverage["provenance"];
  referenceStatus: "list" | "resolved" | "stale" | "clarify";
  presentationHint?: import("./episode-presentation.ts").EpisodePresentation & { selectedLabel: string };
  references?: EpisodeReferences;
  details?: Array<{ sourceId: string; occurredAt: string; note: string }>;
};
export function episodeAnswer(result: EpisodeResult) {
  if (result.coverage==="unavailable") return {summary:"The episode evidence is unavailable or could not be revalidated. I can't establish a count or identify that episode; please retry.",sections:[]};
  if (result.referenceStatus==="stale") return {summary:"The episode you selected has changed, been corrected, or been removed. I haven't substituted another episode. Please request a fresh list to review the current evidence.",sections:[]};
  if (result.referenceStatus==="clarify" && result.presentationHint) return {summary:`The earlier answer labelled that item ${JSON.stringify(result.presentationHint.selectedLabel)}. That is wording from our conversation, not a verified source record. I can't establish what changed from that list alone; use that date to find the original care notes.`,sections:[]};
  if (result.referenceStatus==="clarify") return {summary:"Which displayed episode do you mean? Please identify the pet and the list or approximate date. I can't safely resolve this reference from conversation wording alone.",sections:[]};
  if (result.referenceStatus==="resolved" && result.details?.length) {
    return {
      summary:`Here are the recorded observations for episode ${result.items[0].ordinal} from your original list, in date order. These are reports, not proof of a cause or a current diagnosis.`,
      sections:[{heading:"Recorded episode history",items:result.details.map(d=>`${d.occurredAt.slice(0,10)}: Recorded note: ${JSON.stringify(d.note)}`)}],
    };
  }
  const summary=result.referenceStatus==="resolved" ? `This is episode ${result.items[0].ordinal} from the list you were shown, with its original position preserved.`
    : `${result.supportedCount} explicitly supported ${result.topic} episode group${result.supportedCount===1 ? "" : "s"} in the available evidence. This is a supported subset, not an exact lifetime total or a complete list. Care entries and individual symptom occurrences are different units; ambiguous grouping remains unknown.`;
  const disclosure = result.reasons.includes("episode_source_links_missing")
    ? " Some retrieved episode records have source notes missing from the retrieved evidence, so they cannot be verified or included in this list. This does not mean those episodes never happened." : "";
  return {summary:summary + disclosure,sections:result.items.length ? [{heading:"Supported episodes",items:result.items.map(i=>`Episode ${i.ordinal}: ${i.startedAt.slice(0,10)}, ${result.topic}${i.reportedOccurrences ? `; ${i.reportedOccurrences} reported occurrences within this one episode` : ""}.`)}] : []};
}

/** Called at the real persistence boundary after all response transformations.
 * Do not persist reference authority for a list that was replaced or omitted. */
export function attachEpisodeReferences<T extends {directAnswer:string;sections?:unknown}>(response:T,result?:EpisodeResult): T & {episodeReferences?:EpisodeReferences} {
  const clean={...response};
  delete (clean as {episodeReferences?:unknown}).episodeReferences;
  if (!result?.references) return clean;
  const answer=episodeAnswer(result);
  if (clean.directAnswer!==answer.summary || JSON.stringify(clean.sections)!==JSON.stringify(answer.sections)) return clean;
  return {...clean,episodeReferences:result.references};
}
