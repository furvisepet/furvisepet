import { createHash } from "node:crypto";
import type { CareEntryRow } from "../supabase.ts";

import { readSourceSemantics, type SourceSemantics } from "../furvise-brain/source-semantics.ts";
export { readSourceSemantics } from "../furvise-brain/source-semantics.ts";
export type SourceSemanticsSnapshot = Readonly<{
  id: string; ownerId: string; petId: string; note: string; title: string | null;
  occurredAt: string; createdAt: string; updatedAt: string; sourceMessageId: string | null; sourceSpanId: string | null;
}>;
export type AttributedSourceSemantics = Readonly<SourceSemantics & {
  version: "source-semantics.v1"; source: SourceSemanticsSnapshot;
}>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).sort().join() === [...names].sort().join();
const instant = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function sourceSemanticsSnapshot(row: CareEntryRow): SourceSemanticsSnapshot {
  return { id: row.id, ownerId: row.user_id, petId: row.pet_profile_id, note: row.note, title: row.title ?? null,
    occurredAt: row.occurred_at, createdAt: row.created_at, updatedAt: row.updated_at,
    sourceMessageId: row.intelligence_source_message_id ?? null,
    sourceSpanId: (row.care_event_metadata as { sourceSpanId?: string } | null)?.sourceSpanId ?? null };
}
export const sourceSemanticsDigest = (payload: string) => createHash("sha256").update(payload, "utf8").digest("hex");
/** The persisted payload is hashed as exact bytes, avoiding JSONB/JS reserialization differences. */
export function readAttributedSourceSemantics(claim: Record<string, unknown>, source: CareEntryRow | undefined, ownerId: string): AttributedSourceSemantics | null {
  const metadata = claim.governance_metadata;
  if (!source || source.deleted_at || source.user_id !== ownerId || !object(metadata)
    || typeof metadata.sourceSemanticsPayload !== "string" || metadata.sourceSemanticsPayload.length > 16000
    || claim.source_message_lineage_id !== source.id || claim.claim_kind !== "assertion"
    || claim.user_id !== ownerId || claim.subject_type !== "pet" || claim.subject_id !== source.pet_profile_id
    || claim.operation_type !== "assert" || claim.knowledge_status !== "unconfirmed" || claim.modality !== "reported"
    || claim.persistence_destination !== "none" || claim.turn_payload_hash !== sourceSemanticsDigest(metadata.sourceSemanticsPayload)) return null;
  try {
    const payload = JSON.parse(metadata.sourceSemanticsPayload);
    if (!object(payload) || !keys(payload, ["version", "source", "classification", "target"])
      || payload.version !== "source-semantics.v1" || !object(payload.source)
      || !readSourceSemantics({ classification: payload.classification, target: payload.target })) return null;
    const snapshot = sourceSemanticsSnapshot(source), persistedSource = payload.source;
    if (!keys(persistedSource, Object.keys(snapshot)) || Object.entries(snapshot).some(([key, value]) => persistedSource[key] !== value)
      || !instant(source.occurred_at) || !instant(source.created_at) || !instant(source.updated_at)) return null;
    return payload as AttributedSourceSemantics;
  } catch { return null; }
}
export type CorrectionReadDomain = {
  ownerId: string; petId: string; from: string | null; to: string | null; conceptKey?: string | null;
  /** Exact target IDs are authoritative only for an independently complete selection. */
  sourceIds?: readonly string[]; claimIds?: readonly string[]; exactSetComplete?: boolean;
  exactTargets?: readonly {kind: "source" | "claim"; id: string; ownerId: string; petId: string; occurredAt: string | null; conceptKey: string | null}[];
};
export function attributedCorrectionRelevance(value: AttributedSourceSemantics, domain: CorrectionReadDomain): "disjoint" | "relevant" | "unknown" {
  if (value.source.ownerId !== domain.ownerId || value.source.petId !== domain.petId) return "disjoint";
  if (value.classification === "observation") return "disjoint";
  if (value.classification === "unknown" || !value.target || value.target.kind === "target_unknown") return "unknown";
  const t = value.target;
  if (t.kind === "source" || t.kind === "claim") {
    const ids = t.kind === "source" ? domain.sourceIds : domain.claimIds;
    if (ids?.includes(t.id)) return "relevant";
    if (domain.exactSetComplete && ids) return "disjoint";
    const target = domain.exactTargets?.find(x => x.kind === t.kind && x.id === t.id);
    if (!target || target.ownerId !== domain.ownerId || target.petId !== domain.petId || !target.occurredAt) return "unknown";
    const at = Date.parse(target.occurredAt);
    if (!Number.isFinite(at)) return "unknown";
    if (domain.from && at < Date.parse(domain.from) || domain.to && at >= Date.parse(domain.to)) return "disjoint";
    if (target.conceptKey && domain.conceptKey && target.conceptKey !== domain.conceptKey) return "disjoint";
    return domain.from && domain.to ? "relevant" : "unknown";
  }
  if (t.kind !== "scope") return "unknown";
  if (t.to && domain.from && Date.parse(t.to) <= Date.parse(domain.from)
    || t.from && domain.to && Date.parse(t.from) >= Date.parse(domain.to)) return "disjoint";
  // Both keys must be supplied by an existing canonical concept contract. No aliases/prose are normalized here.
  if (t.conceptKey && domain.conceptKey && t.conceptKey !== domain.conceptKey) return "disjoint";
  return t.from && t.to && domain.from && domain.to && (!t.conceptKey || domain.conceptKey) ? "relevant" : "unknown";
}
