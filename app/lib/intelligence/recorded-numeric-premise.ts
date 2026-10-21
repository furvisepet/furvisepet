import {isRecordedAnchorOperand,type CalculateRecordedOperand} from "../furvise-brain/calculate-plan.ts";
import type { CareEntryRow } from "../supabase.ts";
import type { ReadScope } from "../furvise-brain/lungs.ts";
import {recordedOperandCandidates,matchesReadPredicates} from "../furvise-brain/read-measurement.ts";
import { measurementCandidates } from "../furvise-brain/measurement-candidates.ts";
import { units } from "../furvise-brain/calculation-units.ts";
import { exact, finite } from "../furvise-brain/calculation-rational.ts";
import { readLabsSnapshotMatches, type LabsList } from "./labs-list.ts";
import { selectionPublication } from "./selection-publication.ts";
import { sourceSemanticsSnapshot, sourceSemanticsDigest } from "./correction-relevance.ts";

export type RecordedNumericPosition = Readonly<{clauseId:number;item:number}> | Readonly<{source:"anchor"}>;
type RecordedSourceRequest=Readonly<{subjectId:string;unit:string;role:"target"|"reference"}>&RecordedNumericPosition;
export type RecordedNumericRequest = Readonly<{
  subjectId: string;
  start: number; end: number; quote: string; unit: string;
  operator: "difference"; role: "target" | "reference";
}>&RecordedNumericPosition;
/** Trusted server inputs, not client claims. readSource must perform the normal
 * authorized current-row lookup with every supplied scope field. No permission,
 * classification, durable certificate or source snapshot is minted by this API. */
export type RecordedNumericContext = Readonly<{
  requestId: string;
  scope: Pick<ReadScope, "userId" | "ownedPetIds">;
  labs: LabsList;
  readSource(query: Readonly<{ ownerId: string; subjectId: string; recordId: string }>): Promise<CareEntryRow | null>;
}>;
declare const recordedNumericBrand: unique symbol;
export type RecordedNumericPremise = Readonly<{
  readonly [recordedNumericBrand]: true;
  kind: "recorded-numeric-premise.v1"; authority: "stored_report";
  statement: "authorized_record_states_value";
  requestId: string; ownerId: string; subjectId: string;
  source: Readonly<{ recordId: string; sourceId: string; version: string;
    snapshotSHA256: string; bodySHA256: string; eventAt: string; recordedAt: string }>;
  selection: RecordedNumericPosition & Readonly<{receiptSHA256:string;labsSHA256:string}>;
  measurement: Readonly<{ start: number; end: number; quote: string; numericText: string;
    unit: string; sourceUnit: string; dimension: string; exact: Readonly<{ numerator: string; denominator: string }> }>;
  purpose: Readonly<{ operator: "difference"; role: "target" | "reference" }>;
}>;
const receipts = new WeakMap<RecordedNumericPremise, { labs: LabsList; bytes: string; body:string }>();
export const recordedOperandPosition=(o:CalculateRecordedOperand):RecordedNumericPosition=>isRecordedAnchorOperand(o)?{source:"anchor"}:{clauseId:o.clause,item:o.item};
export function recordedNumericProofBody(p:RecordedNumericPremise,labs:LabsList):string{
 const r=receipts.get(p);if(!r||r.labs!==labs||r.bytes!==JSON.stringify(p)||!readLabsSnapshotMatches(labs))throw Error("RECORDED_NUMERIC_PREMISE_INVALID:proof");return r.body;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 160): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const instant = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const fail = (reason: string): never => { throw Error("RECORDED_NUMERIC_PREMISE_INVALID:" + reason); };
const digest = (v: unknown) => sourceSemanticsDigest(JSON.stringify(v));
function request(value: unknown): RecordedNumericRequest {
  const anchor=object(value)&&value.source==="anchor";
  const keys = ["subjectId", ...(anchor?["source"]:["clauseId","item"]), "start", "end", "quote", "unit", "operator", "role"];
  if (!object(value) || Object.keys(value).sort().join() !== keys.sort().join()
    || !string(value.subjectId) || !string(value.quote, 400) || !string(value.unit, 80)
    || !Object.hasOwn(units, value.unit) || value.operator !== "difference"
    || !["target", "reference"].includes(value.role as string)
    || !(anchor?["start","end"]:["clauseId", "item", "start", "end"]).every(k => Number.isInteger(value[k]) && Number(value[k]) >= 0)
    || Number(value.end) <= Number(value.start)) return fail("request");
  return value as unknown as RecordedNumericRequest;
}
function selected(context: RecordedNumericContext, r: RecordedSourceRequest) {
  if (!string(context.requestId) || !string(context.scope?.userId)
    || !Array.isArray(context.scope.ownedPetIds) || !context.scope.ownedPetIds.includes(r.subjectId))
    return fail("scope");
  const labs = context.labs;
  if (!labs || !readLabsSnapshotMatches(labs)) return fail("labs_snapshot");
  if (labs.ticket.authority !== "stored_report"
    || !["read", "read_since_event"].includes(labs.ticket.operation)
    || !labs.ticket.subjects.petIds.includes(r.subjectId)) return fail("report_authority");
  const view = selectionPublication(labs.ticket, labs.coverage, labs.records);
  if("source" in r){
    const anchors=labs.coverage.anchors.filter(a=>a.petId===r.subjectId);
    const sources=labs.coverage.anchorSources?.filter(a=>a.petId===r.subjectId);
    const streams=labs.coverage.effectiveStream?.filter(s=>s.petId===r.subjectId);
    const a=anchors[0],source=sources?.[0],stream=streams?.[0];
    if(labs.ticket.operation!=="read_since_event"||!labs.ticket.temporal.anchor||anchors.length!==1||sources?.length!==1
      ||!view?.transportValid||!view.complete||streams?.length!==1||!stream?.storedReportsCertified||!stream.replacementSeedsExhausted
      ||!stream.acquiredIds.includes(a.eventId)||!stream.effectiveIds.includes(a.eventId)||source!.eventId!==a.eventId||source!.eventAt!==a.eventAt
      ||!instant(source!.version)||!instant(source!.recordedAt)||!/^[a-f0-9]{64}$/.test(source!.snapshotSHA256)||!/^[a-f0-9]{64}$/.test(source!.bodySHA256))return fail("anchor_source");
    return {ownerId:context.scope.userId,requestId:context.requestId,row:{id:a.eventId,petId:r.subjectId,sourceId:source!.sourceId,event_at:a.eventAt,recorded_at:source!.recordedAt,body:null},
      anchorSnapshot:source!,receiptSHA256:digest({anchor:a,source,stream}),labsSHA256:digest(labs)};
  }
  const matches = view?.certificates.filter(c => c.subjectId === r.subjectId && c.clauseId === r.clauseId);
  if (!view?.transportValid || matches?.length !== 1 || !matches[0].certified
    || matches[0].status !== "complete" || matches[0].blockingReasons.length) return fail("selected_report");
  const recordId = matches[0].selectedEventIds[r.item];
  const rows = labs.records.filter(row => row.id === recordId && row.petId === r.subjectId);
  if (!recordId || rows.length !== 1 || !string(rows[0].sourceId, 500)) return fail("selected_source");
  return { ownerId: context.scope.userId, requestId: context.requestId, row: rows[0],
    anchorSnapshot:null,receiptSHA256: digest(matches[0]), labsSHA256: digest(labs) };
}
async function sourceRecord(context: RecordedNumericContext, r: RecordedSourceRequest) {
  const before = selected(context, r);
  if (typeof context.readSource !== "function") return fail("source_reader");
  const source = await context.readSource(Object.freeze({
    ownerId: before.ownerId, subjectId: r.subjectId, recordId: before.row.id,
  }));
  const after = selected(context, r);
  if (digest(before) !== digest(after)) return fail("read_changed");
  if (!source || source.deleted_at || source.user_id !== before.ownerId
    || source.pet_profile_id !== r.subjectId || source.id !== before.row.id) return fail("source_scope");
  if (!instant(source.updated_at) || !instant(source.created_at) || !instant(source.occurred_at)
    || !Object.hasOwn(source, "note") || !(source.note === null || typeof source.note === "string")
    || !(source.title == null || typeof source.title === "string"))
    return fail("source_version");
  const body = source.note ?? source.title ?? "";
  if (!body.length || body.length > 16000 || !before.anchorSnapshot&&body !== before.row.body
    || source.occurred_at !== before.row.event_at || source.created_at !== before.row.recorded_at)
    return fail("source_snapshot");
  if(before.anchorSnapshot){
    const a=before.anchorSnapshot,snapshot={...sourceSemanticsSnapshot(source),category:source.category??null,deletedAt:source.deleted_at??null};
    if(source.updated_at!==a.version||sourceSemanticsDigest(body)!==a.bodySHA256||digest(snapshot)!==a.snapshotSHA256)return fail("anchor_snapshot_changed");
  }
  if (!before.anchorSnapshot&&!matchesReadPredicates(source,context.labs.ticket.predicates))
    return fail("source_predicates");
  return {before,source,body};
}
export async function readRecordedOperandBody(context:RecordedNumericContext,slot:CalculateRecordedOperand):Promise<string>{
 return (await sourceRecord(context,{subjectId:slot.subjectId,unit:slot.unit,role:slot.role as "target"|"reference",...recordedOperandPosition(slot)})).body;
}
async function resolve(context:RecordedNumericContext,r:RecordedNumericRequest){
  const {before,source,body}=await sourceRecord(context,r);
  if (r.end > body.length || body.slice(r.start, r.end) !== r.quote) return fail("span");
  const candidates = "source" in r?measurementCandidates(body,units[r.unit].dimension):recordedOperandCandidates(body,r.unit,context.labs.ticket);
  // The foundation deliberately accepts one unambiguous compatible measurement.
  // Existing typed measurementSelector integration is a later explicit gate.
  if (candidates.length !== 1) return fail("measurement_ambiguity");
  const candidate = candidates[0];
  if (candidate.sourceSpan.start !== r.start || candidate.sourceSpan.end !== r.end
    || candidate.literal !== r.quote) return fail("numeric_span");
  if(context.labs.ticket.predicates.some(p=>p.kind==="measurement")?units[r.unit].dimension!==units[candidate.sourceUnit].dimension:units[r.unit].canonical!==candidate.unit)return fail("unit");
  const value = candidate.exact; finite(value);
  const snapshot = { ...sourceSemanticsSnapshot(source), category: source.category ?? null, deletedAt: source.deleted_at ?? null };
  const payload = {
    kind: "recorded-numeric-premise.v1" as const, authority: "stored_report" as const,
    statement: "authorized_record_states_value" as const,
    requestId: before.requestId, ownerId: before.ownerId, subjectId: r.subjectId,
    source: Object.freeze({ recordId: source.id, sourceId: before.row.sourceId, version: source.updated_at,
      snapshotSHA256: digest(snapshot), bodySHA256: sourceSemanticsDigest(body),
      eventAt: source.occurred_at, recordedAt: source.created_at }),
    selection: Object.freeze({ ...("source" in r?{source:"anchor" as const}:{clauseId:r.clauseId,item:r.item}),
      receiptSHA256: before.receiptSHA256, labsSHA256: before.labsSHA256 }),
    measurement: Object.freeze({ start: r.start, end: r.end, quote: candidate.literal,
      numericText: candidate.numericText, unit: candidate.unit, sourceUnit: candidate.sourceUnit,
      dimension: candidate.dimension, exact: Object.freeze(exact(value)) }),
    purpose: Object.freeze({ operator: r.operator, role: r.role }),
  };
  return {proof:Object.freeze(payload) as RecordedNumericPremise,body};
}
/** Issues only a request-local recorded-value proof. Never clinical, settled,
 * corrected or effective truth; never an executable CalculatePlan operand. */
export async function issueRecordedNumericPremise(context: RecordedNumericContext, value: unknown): Promise<RecordedNumericPremise> {
  const {proof,body} = await resolve(context, request(value));
  receipts.set(proof, { labs: context.labs, bytes: JSON.stringify(proof),body });
  return proof;
}
/** Required immediately before any future use, and again before publication.
 * A normal authorized reload is mandatory. JSON/structured clones cannot mint
 * authority; a new server read requires reissuance, not receipt promotion. */
export async function revalidateRecordedNumericPremise(
  value: unknown, context: RecordedNumericContext, intended: unknown,
): Promise<RecordedNumericPremise> {
  if (!object(value)) return fail("proof");
  const proof = value as unknown as RecordedNumericPremise, receipt = receipts.get(proof);
  if (!receipt || receipt.labs !== context.labs || receipt.bytes !== JSON.stringify(proof)) return fail("proof");
  const current = await resolve(context, request(intended));
  if (JSON.stringify(current.proof) !== receipt.bytes) return fail("stale_or_changed");
  return proof;
}
