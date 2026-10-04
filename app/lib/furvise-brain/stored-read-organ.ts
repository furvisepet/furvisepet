import { assertCatalogPermit, type CatalogPermit } from "../intelligence/catalog-intent.ts";
import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createIdempotencyAdminClient } from "../security/idempotency/admin-client.ts";
import { parseStoredApplicationActions } from "../application-actions/contracts.ts";
import { confirmFurviseWriteReceipt } from "./write-contract.ts";
import { removeJobActionMatches } from "./remove-job.ts";
import { replaceJobActionMatches } from "./replace-job.ts";
import { isEligibleStoredMemory, memoryDisplayContent } from "../intelligence/memory-integrity.ts";
import { calculateMemoryFreshness } from "../intelligence/memory-freshness.ts";
import type { FurviseMemoryRow } from "../intelligence/types.ts";
import { storedReadDigest, type StoredRead, type StoredReadReference } from "./stored-read.ts";

export type StoredReadRecord = {
  id: string; sourceId: string; subjectId: string; version: string; text: string;
  persistedBodies?: readonly string[];
  operation?: { kind: string; status: string; targetId: string | null; sourceMessageId: string };
  provenance: { domain: StoredRead["domain"]; sourceType: string; sourceId: string };
};
export type StoredReadResult = {
  request: StoredRead; asOf: string; status: "complete" | "complete_empty" | "unavailable" | "unsupported";
  reason: string | null; records: StoredReadRecord[];
};
const issued = new WeakMap<StoredReadResult, string>();
const referenceColumns = "id,user_id,pet_profile_id,source_message_id,assistant_message_id,action_payload,status,receipt,expires_at,created_at";
type Capability = { id: string; user_id: string; pet_profile_id: string; source_message_id: string;
  assistant_message_id: string; action_payload: unknown; status: string; receipt: unknown; expires_at: string; created_at: string };
export const STORED_READ_LIMIT = 100;
/** Bounded owned reference metadata, independent of the current wording and of surviving conversations. */
export async function loadStoredReadReferences(permit: CatalogPermit, db?: SupabaseClient): Promise<StoredReadReference[]> {
  assertCatalogPermit(permit, "receipt", "hydrating");
  const { ownerId } = permit;
  try {
    let query = (db || createIdempotencyAdminClient()).from("ask_action_capabilities")
      .select(referenceColumns).eq("user_id", ownerId).lte("created_at", permit.cutoff);
    if (permit.scope === "subjects") query = query.in("pet_profile_id", [...permit.subjectIds]);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(permit.maxRows);
    if (error || !Array.isArray(data) || data.length > permit.maxRows || Buffer.byteLength(JSON.stringify(data), "utf8") > permit.maxBytes) throw Error("ASK_CATALOG_UNAVAILABLE");
    return (data as Capability[]).flatMap(row => {
      const action = parseStoredApplicationActions([row.action_payload])[0];
      if (row.user_id !== ownerId || Date.parse(row.created_at) > Date.parse(permit.cutoff)
        || permit.scope === "subjects" && !permit.subjectIds.includes(row.pet_profile_id) || !action || action.petId !== row.pet_profile_id
        || action.sourceMessageId !== row.source_message_id) return [];
      return [{ ref: randomUUID(), ownerId, capabilityId: row.id, sourceMessageId: row.source_message_id,
        assistantMessageId: row.assistant_message_id, petId: row.pet_profile_id, actionKind: action.kind,
        createdAt: row.created_at, payloadDigest: storedReadDigest(row.action_payload) }];
    });
  } catch { throw Error("ASK_CATALOG_UNAVAILABLE"); }
}
function issue(result: StoredReadResult) {
  issued.set(result, JSON.stringify(result));
  return result;
}
export function verifiedStoredReadResult(result: StoredReadResult | undefined, request: StoredRead | undefined | null) {
  return result && request && issued.get(result) === JSON.stringify(result)
    && JSON.stringify(result.request) === JSON.stringify(request) ? result : null;
}
/** Only an already verified server result can cross a server-owned clone boundary. */
export function carryStoredReadResult(source: StoredReadResult | undefined, target: StoredReadResult | undefined, request: StoredRead | undefined | null) {
  if (!verifiedStoredReadResult(source, request) || !target || JSON.stringify(source) !== JSON.stringify(target))
    throw Error("STORED_READ_SNAPSHOT_CHANGED");
  issued.set(target, JSON.stringify(target));
}
/** One typed organ; adapters understand schemas, never questions or conversation prose. */
export async function executeStoredRead(request: StoredRead, input: {
  ownerId: string; ownedPetIds: readonly string[]; db: SupabaseClient; capabilityDb?: SupabaseClient; now?: Date;
}): Promise<StoredReadResult> {
  const now = input.now || new Date();
  const base = { request: structuredClone(request), asOf: now.toISOString(), records: [] as StoredReadRecord[] };
  const unavailable = (reason: string, status: StoredReadResult["status"] = "unavailable") => issue({ ...base, status, reason });
  if (request.ownerId !== input.ownerId || request.operation !== "read" || request.projection !== "records"
    || request.subjectIds.some(id => !input.ownedPetIds.includes(id))
    || (request.scope === "owner" ? request.subjectIds.length !== 0 : request.subjectIds.length === 0))
    return unavailable("scope_unavailable");
  if (request.domain === "current_state") return unavailable("stored_state_not_certified", "unsupported");
  try {
    if (request.domain === "operation_receipt") {
      const ref = request.reference;
      if (!ref || ref.ownerId !== input.ownerId
        || request.scope === "subjects" && !request.subjectIds.includes(ref.petId)) return unavailable("operation_reference_unavailable");
      const {data,error} = await (input.capabilityDb || createIdempotencyAdminClient()).from("ask_action_capabilities")
        .select(referenceColumns).eq("user_id", input.ownerId).eq("id", ref.capabilityId).maybeSingle();
      const row = data as Capability | null;
      if (error || !row || row.user_id !== input.ownerId || row.pet_profile_id !== ref.petId
        || row.source_message_id !== ref.sourceMessageId || row.assistant_message_id !== ref.assistantMessageId || row.created_at !== ref.createdAt
        || storedReadDigest(row.action_payload) !== ref.payloadDigest) return unavailable("operation_reference_changed");
      const action = parseStoredApplicationActions([row.action_payload])[0];
      const receipt = parseStoredApplicationActions([row.receipt])[0];
      if (!action || action.kind !== ref.actionKind || action.petId !== ref.petId || action.sourceMessageId !== ref.sourceMessageId)
        return unavailable("operation_identity_invalid");
      if (row.status === "pending") return unavailable("operation_not_terminal");
      if (!receipt || !["succeeded","failed","cancelled"].includes(row.status)) return unavailable("operation_receipt_unverified");
      const canonical = action.kind === "care_history.add" ? action.appendJob
        : action.kind === "care_history.edit" ? action.replaceJob && replaceJobActionMatches(action.replaceJob, action)
        : action.removeJob && removeJobActionMatches(action.removeJob, action);
      if (!canonical) return unavailable("operation_not_canonical");
      const proof = confirmFurviseWriteReceipt({ operationId: row.id, authorized: action, returned: receipt,
        persistedStatus: row.status, persistedReceipt: receipt });
      // A write receipt proves operation status, not the medical truth of its content
      // or the continued existence of a once-written record.
      const persistedBodies = proof.status !== "succeeded" ? []
        : receipt.appendJob ? receipt.appendJob.items.map(item => item.body.text)
        : receipt.replaceJob ? [receipt.replaceJob.body.text] : [];
      const text = "The referenced " + (action.kind === "pet.delete_permanently" ? "pet profile removal" : proof.operation + " operation")
        + " " + proof.status + ". This receipt does not establish whether linked records still exist or whether their contents are current facts."
        + (persistedBodies.length ? "\nPersisted entry bodies, as recorded by this operation:\n"
          + persistedBodies.map((body, index) => `Entry ${index + 1}: ${JSON.stringify(body)}`).join("\n") : "");
      return issue({ ...base, status:"complete", reason:null, records:[{
        id:row.id, sourceId:"operation_receipt:"+row.id, subjectId:ref.petId,
        version:storedReadDigest({payload:row.action_payload,status:row.status,receipt:row.receipt}), text, persistedBodies,
        operation:{kind:action.kind,status:proof.status,targetId:action.removeJob?.resolvedTarget.recordId || action.targetSourceId || null,sourceMessageId:row.source_message_id},
        provenance:{domain:"operation_receipt",sourceType:action.kind,sourceId:row.source_message_id},
      }] });
    }
    if (request.domain !== "memory" || request.reference) return unavailable("read_not_supported","unsupported");
    let query = input.db.from("furvise_memories").select("*",{count:"exact"}).eq("user_id",input.ownerId).eq("status","active");
    query = request.scope === "owner" ? query.eq("subject_type","owner").is("pet_id",null)
      : query.eq("subject_type","pet").in("pet_id",request.subjectIds);
    const {data,error,count} = await query.order("id",{ascending:true}).limit(STORED_READ_LIMIT+1);
    if (error || !Array.isArray(data) || count !== data.length || data.length > STORED_READ_LIMIT) return unavailable("effective_set_incomplete");
    const rows = data as FurviseMemoryRow[];
    if(rows.some(row=>row.user_id!==input.ownerId || (request.scope==="owner"
      ? row.subject_type!=="owner" || row.pet_id!==null : row.subject_type!=="pet" || !request.subjectIds.includes(row.pet_id || ""))))
      return unavailable("memory_scope_mismatch");
    const candidates = rows.filter(row=>row.status==="active" && !row.superseded_by && isEligibleStoredMemory(row)
      && Number.isFinite(Date.parse(row.updated_at)) && calculateMemoryFreshness(row,now).usableForAnswer);
    // Existing Ask/user-edit memories retain exact USER provenance. Other source
    // types need their own provenance adapter; never relabel them as verified.
    if(candidates.some(row=>!["ask_message","user_edit"].includes(row.source_type))) return unavailable("memory_provenance_unsupported","unsupported");
    const sourceIds=[...new Set(candidates.flatMap(row=>row.source_id?[row.source_id]:[]))];
    const sources=sourceIds.length ? await input.db.from("ask_conversation_messages").select("id,user_id,role,user_text")
      .eq("user_id",input.ownerId).in("id",sourceIds) : {data:[],error:null};
    if(sources.error || !Array.isArray(sources.data))return unavailable("memory_provenance_unavailable");
    const lineage=sourceIds.length ? await input.db.from("pet_care_entries").select("intelligence_source_message_id,deleted_at",{count:"exact"})
      .eq("user_id",input.ownerId).in("intelligence_source_message_id",sourceIds) : {data:[],error:null,count:0};
    if(lineage.error || !Array.isArray(lineage.data) || lineage.count!==lineage.data.length)return unavailable("memory_lineage_unavailable");
    const suppressed=new Set(lineage.data.filter(row=>row.deleted_at).map(row=>row.intelligence_source_message_id));
    const records:StoredReadRecord[]=candidates.flatMap(row=>{
      const source=sources.data.find(s=>s.id===row.source_id && s.user_id===input.ownerId && s.role==="user");
      if(suppressed.has(row.source_id) || !source || !row.source_excerpt || !source.user_text?.includes(row.source_excerpt))return [];
      return [{id:row.id,sourceId:"memory:"+row.id,subjectId:row.pet_id || input.ownerId,version:storedReadDigest(row),
        text:memoryDisplayContent(row),provenance:{domain:"memory",sourceType:row.source_type,sourceId:row.source_id!}}];
    });
    return issue({...base,status:records.length?"complete":"complete_empty",reason:null,records});
  } catch { return unavailable("stored_read_unavailable"); }
}
