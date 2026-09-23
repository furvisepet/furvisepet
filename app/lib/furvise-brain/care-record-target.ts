import type { SupabaseClient } from "@supabase/supabase-js";
export type CareRecordReference = Readonly<{ ref: string; recordId: string; ownerId: string; petId: string;
  updatedAt: string; createdAt: string; body: string; eventAt: string }>;
type ExactCareRecordTarget = Readonly<{ kind: "exact_record"; ref: string; recordId: string; updatedAt: string }>;
export const CARE_RECORD_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validExactTarget = (v: unknown): v is ExactCareRecordTarget => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const t = v as ExactCareRecordTarget;
  return Object.keys(t).sort().join() === "kind,recordId,ref,updatedAt" && t.kind === "exact_record"
    && typeof t.ref === "string" && !!t.ref && t.ref.length <= 160 && CARE_RECORD_UUID.test(t.recordId)
    && typeof t.updatedAt === "string" && Number.isFinite(Date.parse(t.updatedAt));
};

export type CareRecordSelector = "last_event_for_subject" | ExactCareRecordTarget;
export const careRecordSelectorSchema = { anyOf: [{ type: "string", enum: ["last_event_for_subject"] },
        { type: "object", additionalProperties: false, required: ["kind", "ref"], properties: {
          kind: { type: "string", enum: ["exact_record"] }, ref: { type: "string", minLength: 1, maxLength: 160 },
        } }] };

export function bindCareRecordSelector(value: unknown, source: {createdAt:string}, subject:{id:string}, authority: {ownerId:string;references:readonly CareRecordReference[]}|undefined, fail:(field:string)=>never): CareRecordSelector {
  let target: CareRecordSelector = "last_event_for_subject";
  if (value !== "last_event_for_subject") {
    const t = value as { kind?: unknown; ref?: unknown } | null;
    if (!t || typeof t !== "object" || Array.isArray(t) || Object.keys(t).sort().join() !== "kind,ref"
      || t.kind !== "exact_record" || typeof t.ref !== "string") return fail("target");
    const refs = authority?.references.filter(r => r.ref === t.ref) || [];
    if (refs.length !== 1) return fail("target.reference");
    const r = refs[0];
    if (r.ownerId !== authority?.ownerId || r.petId !== subject.id || !CARE_RECORD_UUID.test(r.recordId)
      || !Number.isFinite(Date.parse(r.createdAt)) || Date.parse(r.createdAt) > Date.parse(source.createdAt))
      return fail("target.scope");
    target = Object.freeze({ kind: "exact_record", ref: r.ref, recordId: r.recordId, updatedAt: r.updatedAt });
    if (!validExactTarget(target)) return fail("target.version");
  }
  return target;
}
export function careRecordSelectorProviderSchema(references:readonly CareRecordReference[] = []) {
 const schema=structuredClone(careRecordSelectorSchema);
 Object.assign(schema.anyOf[1].properties!.ref,{enum:references.map(r=>r.ref)});
 if(!references.length)schema.anyOf.splice(1,1);
 return schema;
}
export async function resolveCareRecordSelector(job:{target:CareRecordSelector;petId:string;asOf:string},supabase:SupabaseClient,userId:string) {
  let query = supabase.from("pet_care_entries").select("id,updated_at")
    .eq("user_id", userId).eq("pet_profile_id", job.petId).is("deleted_at", null);
  query = typeof job.target === "string"
    ? query.lte("created_at", job.asOf).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1)
    : query.eq("id", job.target.recordId).eq("updated_at", job.target.updatedAt);
  const { data, error } = await query.maybeSingle<{ id: string; updated_at: string }>();
  if (error) throw new Error("CARE_RECORD_TARGET_UNAVAILABLE");
  if (!data) throw new Error("CARE_RECORD_TARGET_MISSING");
  const target = { id: `care:${data.id}`, petId: job.petId, sourceType: "care_update" as const };
  return { target, version: data.updated_at };
}
