import "server-only";
import { parseEpisodeFollowUp as episodeFollowUp } from "./episode-reference-language.ts";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext } from "./types.ts";
import { effectiveCandidates, planHistoricalQuery, type HistoryCoverage } from "./history-retrieval.ts";
import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";

import type { EpisodeReferences, EpisodeResult } from "./episode-contract.ts";
import { episodeMembershipSources, type EpisodeSource } from "./episode-membership.ts";
import { recordedInventory, inventoryMembersMatch, classifiedRecordedSource } from "./recorded-inventory.ts";
import { governedRecordedRole } from "./recorded-provenance.ts";
import type { EpisodeClaimValidation } from "./history-retrieval.ts";
export type { EpisodeItem, EpisodeReferences, EpisodeResult } from "./episode-contract.ts";
export { attachEpisodeReferences } from "./episode-contract.ts";

type EpisodeRow = { id: string; user_id: string; pet_profile_id: string; normalized_key: string;
  started_at: string; sequence_number: number; recurrence_of: string | null; status: string; updated_at: string };
type Source = EpisodeSource;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const keys = (topic: string) => topic === "vomiting" ? ["vomiting", "vomit"] : topic === "soft stool" ? ["soft_stool", "stool", "diarrhea"] : ["breathing"];
const sourceVersion = (s: Source) => hash([s.id,s.user_id,s.pet_profile_id,s.title,s.note,s.occurred_at,s.updated_at,s.deleted_at]);
export function isEpisodeFollowUp(message: string) {
  return episodeFollowUp(message) !== null;
}
/** Counting/listing is a distinct intent; mentioning episodes is not enough. */
export function isEpisodeListRequest(message: string) {
  return /\bepisodes?\b/i.test(message) && (
    /\bhow many\b/i.test(message) ||
    /\b(?:count|number|total) (?:of )?(?:[\w-]+ ){0,4}episodes?\b/i.test(message) ||
    /^(?:(?:please|can you|could you|would you)\s+)*(?:list|show|enumerate)\b[^?]*\bepisodes?\b/i.test(message)
  );
}
function topicOf(message: string) {
  const topics = [/\b(?:vomit\w*|threw up)\b/i.test(message) ? "vomiting" : "",
    /\b(?:stool|diarrh\w*)\b/i.test(message) ? "soft stool" : "", /\bbreath\w*\b/i.test(message) ? "breathing" : ""].filter(Boolean);
  return { topic: topics.length === 1 ? topics[0] : null, ambiguous: topics.length > 1 };
}
function parseReferences(value: unknown, context: FurviseLiveContext): EpisodeReferences | null {
  if (!value || typeof value !== "object" || JSON.stringify(value).length > 12000) return null;
  const r = value as EpisodeReferences;
  if (r.version !== "ask-episodes.v1" || r.coverage !== "partial" || r.exactTotal !== null || r.ownerId !== context.owner.userId || r.conversationId !== context.conversationId
    || !["vomiting","soft stool","breathing"].includes(r.topic) || !Array.isArray(r.items) || !r.items.length || r.items.length > 8
    || new Set(r.items.map(i => i.id)).size !== r.items.length
    || r.items.some((i,index) => !i || typeof i.id !== "string" || !/^episode:[a-zA-Z0-9_-]+$/.test(i.id)
      || !/^(?:care|claim):[a-zA-Z0-9_-]+$/.test(i.sourceId) || !/^[a-f0-9]{64}$/.test(i.sourceVersion)
      || !/^[a-f0-9]{64}$/.test(i.episodeVersion || "")
      || i.ordinal !== index+1 || !Number.isFinite(Date.parse(i.startedAt)))
    || r.selectedId !== null && !r.items.some(i => i.id === r.selectedId)) return null;
  return r;
}
/** Legacy text fallback: an explicit, positive owner report of an
 * episode. Generic symptom notes, temporal distance and generated summaries do
 * not establish incident boundaries. Membership IDs alone are heuristic. */
function boundary(source: Source, petName: string, topic: string) {
  const name = petName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${name} (?:had|started|began) (?:a |an )?((?:new |separate |recurrent )?)(?:${topic.replace(" ", "[- ]")}) episode(?:[.,;:]|$)`, "i").exec(source.note || "");
  if (!match || /\b(?:not|never|maybe|possible|uncertain|actually|mistaken|wrong|instead|belong\w*|correct\w*|retract\w*|supersed\w*)\b/i.test(source.note)) return null;
  return { separate: Boolean(match[1]), occurrences: topic === "vomiting" && /\bvomited twice (?:during|in) (?:this|one|the same) episode\b/i.test(source.note) ? 2 : null };
}

export async function retrieveEpisodeHistory(context: FurviseLiveContext, db: SupabaseClient, petIds: string[]): Promise<FurviseLiveContext> {
  const message = context.currentMessage;
  const follow = episodeFollowUp(message);
  if ((!follow && !isEpisodeListRequest(message)) || analyzeOwnerAssertions(message).hasOwnerAssertion || /\b(?:save|log|remember)\b/i.test(message)) return context;
  const { topic, ambiguous: ambiguousTopic } = topicOf(message);
  const plan = planHistoricalQuery(message);
  const result: EpisodeResult = { version: "ask-episodes.v1", petId: context.pet.id, topic: topic || "unspecified",
    from: plan?.from || null, to: plan?.to || null, items: [], supportedCount: 0, exactTotal: null, entryCount: 0,
    coverage: "partial", reasons: ["legacy_semantics_and_grouping_not_certified", "bounded_evidence_not_lifetime_total"],
    provenance: [], referenceStatus: follow ? "clarify" : "list" };
  const done = () => ({ ...context, episodeResult: result });
  const deadline = Date.now()+5000;
  const signal = () => AbortSignal.timeout(Math.max(1,deadline-Date.now()));
  let refs: EpisodeReferences | null = null;
  try {
    if (petIds.length !== 1 || !petIds.includes(context.pet.id)) { result.coverage="ambiguous"; result.referenceStatus="clarify"; return done(); }
    if (follow) {
      // An unspecified topic may inherit the saved list; competing topics may not.
      if (follow.ambiguous || ambiguousTopic || !context.conversationId) return done();
      const stored = await db.rpc("read_ask_episode_references", {p_conversation_id:context.conversationId}).abortSignal(signal());
      if (stored.error) throw new Error("reference_read_unavailable");
      refs = parseReferences(stored.data,context);
      if (!refs) {
        const hint = context.episodePresentation;
        const hintTopic = hint ? topicOf(hint.prompt).topic : null;
        const index = follow.ordinal === "last" ? (hint?.items.length || 0) - 1
          : ["first","second","third","fourth","fifth","sixth","seventh","eighth"].indexOf(follow.ordinal || "");
        if (hint?.petId === context.pet.id && hintTopic && (!topic || topic === hintTopic) && index >= 0 && hint.items[index]) {
          result.presentationHint = { ...hint, selectedLabel: hint.items[index] };
        }
        return done();
      }
      if (refs.petId !== context.pet.id || topic && topic !== refs.topic) return done();
      result.topic=refs.topic; result.from=refs.from; result.to=refs.to;
    } else if (!topic || !plan) { result.referenceStatus="clarify"; result.coverage="ambiguous"; return done(); }
    // Member-only revalidation cannot discharge uncertainty found by the preceding
    // historical read: a late correction may have no episode membership at all.
    const inherited = context.askHistory?.coverage;
    if (inherited && (inherited.corrections === "unavailable" || inherited.corrections === "partial"
      || inherited.reasons.includes("unlinked_correction_uncertain"))) {
      throw new Error("historical_episode_correction_unavailable");
    }
    const episodeIds = refs?.items.filter(i => i.id.startsWith("episode:")).map(i => i.id.slice(8));
    const readArgs={p_pet_id:context.pet.id,p_keys:keys(result.topic),p_episode_ids:episodeIds?.length ? episodeIds : null,
      p_from: refs ? null : result.from, p_to: refs ? null : result.to};
    const read = await db.rpc("read_ask_episode_sources", readArgs).abortSignal(signal());
    const inventory = refs ? null : recordedInventory(read.data?.recorded_inventory, context.owner.userId, context.pet.id,
      keys(result.topic), result.from, result.to);
    const inventoryMode = !refs && read.data?.recorded_inventory !== undefined;
    if (inventoryMode && !inventory) result.reasons.push("recorded_inventory_uncertified");
    if (read.error || !read.data || !Array.isArray(read.data.episodes) || !Array.isArray(read.data.sources)
      || read.data.episodes.length>(inventory ? 32 : 9) || read.data.sources.length>72) throw new Error("episode_read_unavailable");
    const revision = (data: typeof read.data) => [data.episodes,data.sources,data.membership_contract,data.memberships,data.claims,data.recorded_inventory ? { ...data.recorded_inventory, snapshot: null } : null];
    const initialRevision = hash(revision(read.data));
    const episodes = read.data.episodes as EpisodeRow[];
    const membership = episodeMembershipSources(read.data, episodes, read.data.sources as Source[], context.owner.userId, context.pet.id);
    const sources = membership.sources;
    if (!membership.memberships) result.reasons.push("episode_membership_contract_unavailable");
    if (episodes.some(e => e.user_id!==context.owner.userId || e.pet_profile_id!==context.pet.id || !keys(result.topic).includes(e.normalized_key))
      || sources.some(s=>s.user_id!==context.owner.userId || s.pet_profile_id!==context.pet.id)) throw new Error("episode_scope_mismatch");
    if (episodes.some(e => !["superseded", "archived", "dismissed"].includes(e.status)
      && !sources.some(s => s.episode_id === e.id && !s.deleted_at))) {
      result.coverage = "ambiguous"; result.reasons.push("episode_source_links_missing");
    }
    // A missing member payload may contain a correction or a conflicting
    // boundary. Dropping just that member would certify the remaining onset
    // without checking the whole group, and could preserve stale references.
    const incomplete = new Set(episodes.filter(e => {
      const members = sources.filter(s => s.episode_id === e.id);
      return membership.invalid.has(e.id) || members.length > 8 || members.some(s => s.content_omitted || typeof s.note !== "string");
    }).map(e => e.id));
    if (incomplete.size || (!inventory && episodes.length>8)) result.reasons.push("episode_input_bound");
    // Unlinked notes remain unknown grouping, even if they say "separate": two
    // copies of that note may describe one event. Never count source IDs as groups.
    let candidates: Source[] = sources.filter(s=>!incomplete.has(s.episode_id!) && !s.content_omitted && typeof s.note === "string").slice(0,64);
    const coverage: HistoryCoverage = {plan:{from:null,to:null,terms:[],interpretation:"period"}, candidateIds:candidates.map(s=>s.id),queryCount:0,
      retrieval:"partial",corrections:"unknown",extraction:"unknown",grouping:"unknown",continuation:[],reasons:[],consistency:"read_committed_no_snapshot",perPet:[],provenance:[],claimSources:[],excludedIds:[]};
    const claimValidation: EpisodeClaimValidation = {claims:candidates.flatMap(s=>s.claim ? [s.claim] : []),verified:new Map()};
    const effective=await effectiveCandidates(candidates.filter(s=>!s.claim),new Set(context.eligiblePets.filter(p=>p.user_id===context.owner.userId).map(p=>p.id)),[context.pet.id],context.owner.userId,db,coverage,deadline,claimValidation);
    const recheck=await db.rpc("read_ask_episode_sources",readArgs).abortSignal(signal());
    if (recheck.error || !recheck.data || initialRevision!==hash(revision(recheck.data))) throw new Error("episode_changed_during_read");
    if (membership.memberships) {
      const priorGraph = claimValidation.revision;
      await effectiveCandidates(candidates.filter(s=>!s.claim),new Set(context.eligiblePets.filter(p=>p.user_id===context.owner.userId).map(p=>p.id)),
        [context.pet.id],context.owner.userId,db,coverage,deadline,claimValidation);
      if (!priorGraph || priorGraph !== claimValidation.revision) throw new Error("episode_correction_changed_during_read");
    }
    if (inventory) {
      // The transactionally advanced revision brackets ALL graph reads, including
      // the second closure pass. Stable SQL calls share their statement snapshot.
      const finalRead = await db.rpc("read_ask_episode_sources",readArgs).abortSignal(signal());
      if (finalRead.error || !finalRead.data || initialRevision !== hash(revision(finalRead.data)))
        throw new Error("recorded_inventory_changed_during_read");
    }
    result.provenance=coverage.provenance;
    if (coverage.corrections==="unavailable" || coverage.reasons.includes("unlinked_correction_uncertain")) throw new Error("episode_correction_unavailable");
    const effectiveIds=new Set(effective.map(s=>s.id));
    for (const s of candidates) if (s.claim && claimValidation.verified.has(s.claim.id)) effectiveIds.add(s.id);
    if (membership.memberships) {
      // An invalid continuation can change the interpretation of the opening.
      // Never retain the remainder of a partly revalidated membership group.
      for (const s of candidates) if (!effectiveIds.has(s.id)) incomplete.add(s.episode_id!);
      for (const s of candidates) if (context.eligiblePets.some(p=>p.id!==context.pet.id && p.name
        && new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(s.note))) incomplete.add(s.episode_id!);
      const lineages = new Map<string, Source>();
      for (const s of candidates) {
        const legacyId = s.claim ? claimValidation.verified.get(s.claim.id) : s.id;
        const key = legacyId ? `care:${legacyId}` : s.evidenceId || `care:${s.id}`;
        const prior = lineages.get(key);
        if (prior && prior.episode_id !== s.episode_id) { incomplete.add(prior.episode_id!); incomplete.add(s.episode_id!); }
        else if (!prior || !s.claim) lineages.set(key,s);
      }
      candidates = [...lineages.values()].filter(s=>!incomplete.has(s.episode_id!));
      if (incomplete.size) result.reasons.push("episode_membership_unverified_or_incomplete");
    }
    result.entryCount=candidates.filter(s=>effectiveIds.has(s.id)).length;
    const grouped=new Map<string,{source:Source; episode?:EpisodeRow; separate:boolean; occurrences:number|null}>();
    const ambiguous=new Set<string>();
    for (const s of candidates.filter(s=>effectiveIds.has(s.id))) {
      const namesAnotherPet=context.eligiblePets.some(p=>p.id!==context.pet.id && p.name
        && new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(s.note));
      if (namesAnotherPet) { result.coverage="ambiguous"; result.reasons.push("multi_pet_source_grouping_unknown"); continue; }
      const governed = membership.memberships ? governedRecordedRole(s,result.topic,membership.memberships) : null;
      const hasProvenance = membership.memberships?.some(m => m.care_entry_id === s.id && m.recorded_provenance !== undefined);
      const b=governed === "opening" ? { separate:true, occurrences:null }
        : hasProvenance ? null : boundary(s,context.pet.name,result.topic);
      if (!b || s.deleted_at || (result.from && (Date.parse(s.occurred_at)<Date.parse(result.from) || Date.parse(s.occurred_at)>=Date.parse(result.to!)))) continue;
      const ep=episodes.find(e=>e.id===s.episode_id);
      if (!ep || ["superseded","archived","dismissed"].includes(ep.status)) continue;
      const id=`episode:${ep.id}`;
      if (grouped.has(id)) ambiguous.add(id);
      else grouped.set(id,{source:s,episode:ep,separate:b.separate,occurrences:b.occurrences});
    }
    const sorted=[...grouped].filter(([id])=>!ambiguous.has(id)).sort((a,b)=>a[1].source.occurred_at.localeCompare(b[1].source.occurred_at)||a[0].localeCompare(b[0]));
    for (const [id,g] of sorted) {
      // A second generic report could be another description of the same event.
      if (result.items.length && !g.separate) { result.coverage="ambiguous"; result.reasons.push("separate_boundary_unknown"); continue; }
      if (!inventory && result.items.length===8) { result.reasons.push("display_bound"); break; }
      const members=g.episode ? candidates.filter(s=>s.episode_id===g.episode!.id) : [g.source];
      const sourceVersions=members.sort((a,b)=>a.id.localeCompare(b.id)).map(s=>[sourceVersion(s),effectiveIds.has(s.id),coverage.provenance.filter(p=>p.sourceId===(s.evidenceId || `care:${s.id}`))]);
      const version=membership.memberships ? hash([sourceVersions,membership.memberships.filter(m=>m.episode_id===g.episode?.id),
        sources.filter(s=>s.episode_id===g.episode?.id).map(s=>[s.claim || null,claimValidation.sourceRevisions?.get(s.evidenceId || `care:${s.id}`)])]) : hash(sourceVersions);
      result.items.push({id,sourceId:g.source.evidenceId || `care:${g.source.id}`,sourceVersion:version,episodeVersion:g.episode ? hash(g.episode) : null,
        startedAt:g.source.occurred_at,sequenceNumber:g.episode?.sequence_number || null,recurrenceOf:g.episode?.recurrence_of || null,
        ordinal:result.items.length+1,reportedOccurrences:g.occurrences});
    }
    if (ambiguous.size) { result.coverage="ambiguous"; result.reasons.push("conflicting_episode_boundaries"); }
    result.supportedCount=result.items.length;
    if (inventory) {
      const complete = result.coverage === "partial" && incomplete.size === 0 && ambiguous.size === 0
        && inventory.episodeCount === episodes.length && result.items.length === episodes.length
        && new Set(episodes.map(e => e.id)).size === episodes.length
        && inventoryMembersMatch(inventory,membership.memberships)
        && sources.every(s => effectiveIds.has(s.id) && classifiedRecordedSource(s,context.pet.name,result.topic,membership.memberships!))
        && result.items.every(i => Date.parse(episodes.find(e => `episode:${e.id}` === i.id)?.started_at || "") === Date.parse(i.startedAt));
      if (complete) {
        result.exactTotal = result.items.length;
        result.coverage = "recorded_complete";
        result.recordedInventory = { revision:inventory.revision, snapshot:inventory.snapshot, scope:"care_claim_episode_register" };
        result.reasons = ["recorded_register_only_not_lifetime_coverage"];
      } else result.reasons.push("recorded_inventory_semantics_unknown");
      if (result.items.length > 8) result.reasons.push("display_bound");
      result.items = result.items.slice(0,8);
    }
    if (refs) {
      const ordinal=follow?.ordinal;
      const index=ordinal === "last" ? refs.items.length-1 : ["first","second","third","fourth","fifth","sixth","seventh","eighth"].indexOf(ordinal || "");
      const selected=index>=0 ? refs.items[index] : refs.items.find(i=>i.id===refs!.selectedId) || (refs.items.length===1 ? refs.items[0] : null);
      if (!selected) { result.items=[]; result.supportedCount=0; return done(); }
      const current=result.items.find(i=>i.id===selected.id);
      if (!current || current.sourceVersion!==selected.sourceVersion || current.episodeVersion!==selected.episodeVersion) {
        result.referenceStatus="stale"; result.items=[]; result.supportedCount=0; return done();
      }
      result.referenceStatus="resolved"; result.items=[{...current,ordinal:selected.ordinal}]; result.supportedCount=1;
      // Only fresh, effective members of the selected group can supply details.
      // Keep complete notes and dates; do not infer cause or recovery from a label.
      result.details=candidates.filter(s=>s.episode_id===selected.id.slice(8) && effectiveIds.has(s.id) && !s.deleted_at)
        .sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.id.localeCompare(b.id))
        .map(s=>({sourceId:s.evidenceId || `care:${s.id}`,occurredAt:s.occurred_at,note:s.note}));
      result.references={...refs,selectedId:selected.id};
    } else if (context.conversationId && result.items.length) result.references={version:"ask-episodes.v1",ownerId:context.owner.userId,
      conversationId:context.conversationId,petId:context.pet.id,topic:result.topic,from:result.from,to:result.to,coverage:"partial",exactTotal:null,items:result.items,selectedId:null};
    return done();
  } catch(error) {
    result.items=[]; result.supportedCount=0; result.exactTotal=null; result.coverage="unavailable";
    result.reasons.push(error instanceof Error ? error.message : "episode_read_unavailable");
    return done();
  }
}
