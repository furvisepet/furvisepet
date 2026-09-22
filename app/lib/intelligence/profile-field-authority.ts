import "server-only";
import { createHash } from "node:crypto";
import type { DogProfileRow } from "../supabase.ts";
import type { AskContextRecord } from "../ai/ask-reasoning.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";

type FieldDefinition = { storage: keyof DogProfileRow; label: string; semanticKind: string;
  type: "string" | "enum" | "quantity"; values?: readonly string[]; unitStorage?: keyof DogProfileRow; units?: readonly string[] };
export const PROFILE_FIELD_DEFINITIONS = {
  name: { storage: "name", label: "name", semanticKind: "reported_name", type: "string" },
  species: { storage: "species", label: "species", semanticKind: "reported_species", type: "enum", values: ["dog", "cat"] },
  sex: { storage: "sex", label: "sex", semanticKind: "reported_sex", type: "enum", values: ["female", "male", "not_sure"] },
  breed: { storage: "breed", label: "reported breed", semanticKind: "reported_breed", type: "string" },
  weight: { storage: "weight_value", unitStorage: "weight_unit", label: "weight", semanticKind: "saved_profile_body_weight",
    type: "quantity", units: ["kg", "lb"] },
} as const satisfies Record<string, FieldDefinition>;
export type ProfileFieldSelector = keyof typeof PROFILE_FIELD_DEFINITIONS;
export type AuthorizedProfileField = {
  obligationId: string; sourceId: string; sourceDomain: "saved_profile"; subjectId: string;
  fieldSelector: ProfileFieldSelector; semanticKind: string; state: "present" | "empty" | "unavailable";
  storedValue: string | number | null; unit: string | null; reason: string | null;
  snapshot: { profileId: string; contentId: string; updatedAt: string | null };
};
export type ProfileFieldProjection = { subjectIds: string[]; petNames: Record<string, string>; fields: AuthorizedProfileField[] };
const snapshots = new WeakMap<ProfileFieldProjection, { content: string; binding: string }>();
const json = JSON.stringify;
function binding(e: AskEvidenceContract) {
  return json({ subjects: e.scope.authorizedPetIds, status: e.scope.status, readOnly: e.scope.readOnlyRecall,
    request: e.interpretation?.request, sources: e.sources.filter(s => s.source === "profile") });
}
export function isTypedProfileRead(e: AskEvidenceContract | undefined): boolean {
  const r = e?.interpretation?.request;
  return !!e && e.scope.status === "resolved" && e.scope.readOnlyRecall && e.scope.authorizedPetIds.length > 0
    && r?.mode === "read" && r.evidenceBasis === "saved_profile" && !r.readTicket && !r.writeJob && !r.mutationIntent
    && !r.task && !r.projection && !r.quantity && !r.evidenceNeeds?.length
    // Custom JSON may request keys that the planner omitted from profileFields.
    // Keep that mixed/unmigrated contract on the existing model path until the
    // structured-output contract can prove every requested field explicitly.
    && r.outputFormat !== "json"
    && !!r.profileFields?.length && r.profileFields.every(f => Object.hasOwn(PROFILE_FIELD_DEFINITIONS, f));
}
/** Only the owned loader's rows and bound request enter here, never model JSON or proposals. */
export function projectProfileFields(e: AskEvidenceContract | undefined, rows: readonly DogProfileRow[]): ProfileFieldProjection | null {
  if (!isTypedProfileRead(e) || !e) return null;
  const fields: AuthorizedProfileField[] = [];
  const subjectIds = [...new Set(e.scope.authorizedPetIds)];
  const petNames: Record<string, string> = {};
  for (const subjectId of subjectIds) {
    const candidates = rows.filter(p => p.id === subjectId);
    const loaded = e.sources.some(s => s.petId === subjectId && s.source === "profile"
      && s.status === "loaded" && s.loadedIds.includes(subjectId));
    const row = loaded && candidates.length === 1 ? candidates[0] : undefined;
    petNames[subjectId] = e.petNames?.[subjectId] || row?.name || "This pet";
    for (const fieldSelector of [...new Set(e.interpretation!.request!.profileFields!)] as ProfileFieldSelector[]) {
      const d: FieldDefinition = PROFILE_FIELD_DEFINITIONS[fieldSelector];
      const hasValue = !!row && Object.hasOwn(row, d.storage) && row[d.storage] !== undefined;
      const value = hasValue ? row![d.storage] : undefined;
      const rawUnit = row && d.unitStorage ? row[d.unitStorage] : undefined;
      let state: AuthorizedProfileField["state"] = !hasValue ? "unavailable" : value === null || value === "" ? "empty" : "present";
      let reason: string | null = !hasValue ? "field_unavailable" : null;
      if (state === "present") {
        if (d.type === "quantity" && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
          state = "unavailable"; reason = "invalid_value";
        } else if (d.type === "quantity" && (typeof rawUnit !== "string" || !d.units!.includes(rawUnit))) {
          state = "unavailable"; reason = "explicit_unit_required";
        } else if (d.type !== "quantity" && (typeof value !== "string" || !value.trim()
          || d.type === "enum" && !d.values!.includes(value))) {
          state = "unavailable"; reason = "invalid_value";
        }
      }
      // The fingerprint includes exact stored companions, not a display-rounded value.
      const contentId = createHash("sha256").update(json({ subjectId, fieldSelector,
        value: value === undefined ? { unavailable: true } : value,
        unit: rawUnit === undefined ? { unavailable: true } : rawUnit, updatedAt: row?.updated_at ?? null })).digest("hex");
      fields.push({ obligationId: `profile:${subjectId}:${fieldSelector}`, sourceId: `profile:${subjectId}:${fieldSelector}`,
        sourceDomain: "saved_profile", subjectId, fieldSelector, semanticKind: d.semanticKind,
        state, storedValue: state === "present" ? value as string | number : null,
        unit: state === "present" && d.type === "quantity" ? rawUnit as string : null, reason,
        snapshot: { profileId: subjectId, contentId, updatedAt: row?.updated_at ?? null } });
    }
  }
  const projection = { subjectIds, petNames, fields };
  snapshots.set(projection, { content: json(projection), binding: binding(e) });
  return projection;
}
export function profileFieldValue(field: AuthorizedProfileField): string {
  if (field.state === "empty") return "Not recorded in the saved profile.";
  if (field.state === "unavailable") return field.reason === "explicit_unit_required"
    ? "Unavailable: the saved value has no supported explicit unit." : "Unavailable from the saved profile.";
  return String(field.storedValue) + (field.unit ? " " + field.unit : "");
}
export function profileFieldSentence(field: AuthorizedProfileField, name: string): string {
  return `${name} ? saved profile ${PROFILE_FIELD_DEFINITIONS[field.fieldSelector].label}: ${profileFieldValue(field)}`;
}
export function profileFieldRecords(p: ProfileFieldProjection): AskContextRecord[] {
  return p.fields.filter(f => f.state !== "unavailable").map(f => ({
    id: f.sourceId, sourceType: "profile", petId: f.subjectId, petName: p.petNames[f.subjectId],
    kind: f.fieldSelector, value: profileFieldValue(f), occurredAt: null, createdAt: f.snapshot.updatedAt,
    status: null, priority: null, metadata: { sourceDomain: f.sourceDomain, snapshotId: f.snapshot.contentId },
  }));
}
function represented(e: AskEvidenceContract, f: AuthorizedProfileField) {
  return e.represented.some(s => s.sourceId === f.sourceId && s.petId === f.subjectId && s.sourceType === "profile"
    && s.start === 0 && s.end === s.text.length && s.text === profileFieldValue(f))
    && !e.losses.some(l => l.sourceId === f.sourceId);
}
/** Representation loss never becomes an inferred or substituted field value. */
export function bindProfileFieldProjection(e: AskEvidenceContract, p: ProfileFieldProjection) {
  const original = snapshots.get(p);
  if (!original || original.content !== json(p) || original.binding !== binding(e)) throw Error("ASK_PROFILE_SNAPSHOT_BINDING");
  const fields = p.fields.map(f => f.state !== "unavailable" && !represented(e, f)
    ? { ...f, state: "unavailable" as const, storedValue: null, unit: null, reason: "representation_loss" } : f);
  const bound = { ...p, fields };
  snapshots.set(bound, { content: json(bound), binding: binding(e) });
  e.profileFieldProjection = bound;
}
export function profileFieldProjection(e: AskEvidenceContract | undefined): ProfileFieldProjection | null {
  if (!e?.profileFieldProjection) return null;
  const p = e.profileFieldProjection, snapshot = snapshots.get(p);
  if (!snapshot || snapshot.content !== json(p) || snapshot.binding !== binding(e) || !isTypedProfileRead(e)
    || p.fields.some(f => f.state !== "unavailable" && !represented(e, f))) throw Error("ASK_PROFILE_SNAPSHOT_CHANGED");
  return p;
}
/** Server clone transfer only; serialized/model-provided projections have no authority. */
export function carryProfileFieldProjection(source: AskEvidenceContract, target: AskEvidenceContract) {
  const p = profileFieldProjection(source);
  if (!p || !target.profileFieldProjection || json(target.profileFieldProjection) !== json(p)
    || binding(source) !== binding(target)) throw Error("ASK_PROFILE_CLONE_CHANGED");
  snapshots.set(target.profileFieldProjection, snapshots.get(p)!);
  profileFieldProjection(target);
}
