import type { SupabaseClient } from "@supabase/supabase-js";
import { recordIngestionEvent, safeDatabaseMessage } from "./audit.ts";
import type { ProcessedIngestionRecord } from "./pipeline.ts";
import { stableContentHash } from "./hashing.ts";
import { detectClaimFlags } from "./claims.ts";
import { evaluatePublicationGate } from "./publication-gate.ts";
import { assessIngestionQuality, sourceUse } from "./quality.ts";
import type { BatchReviewSummary, ClaimFlag, DuplicateDetectionResult, IngestionSourceType, NormalizedIngestionProduct, ParsedIngestionRecord } from "./types";
import { validateNormalizedProduct } from "./validate.ts";

export async function createIngestionBatch(
  supabase: SupabaseClient,
  input: {
    actorId?: string | null;
    countryCode?: string | null;
    filename?: string | null;
    provider: string;
    providerManifest?: Record<string, unknown> | null;
    sourceName?: string | null;
    sourceType: IngestionSourceType;
    sourceUrl?: string | null;
    speciesCode?: string | null;
  },
) {
  const { data, error } = await supabase.from("product_ingestion_batches").insert({
    country_code: input.countryCode?.trim().toUpperCase() || null,
    created_by: input.actorId || null,
    filename: input.filename || null,
    provider: input.provider.trim(),
    provider_manifest: input.providerManifest || null,
    source_name: input.sourceName || null,
    source_type: input.sourceType,
    source_url: input.sourceUrl || null,
    species_code: input.speciesCode?.trim().toLowerCase() || null,
    status: "uploaded",
  }).select("*").single();
  if (error || !data) throw new Error(`Could not create ingestion batch: ${safeDatabaseMessage(error)}`);
  await recordIngestionEvent(supabase, { actorId: input.actorId, batchId: data.id, eventType: "batch_created" });
  return data as Record<string, unknown>;
}

export async function storeProcessedRecords(
  supabase: SupabaseClient,
  batchId: string,
  records: ProcessedIngestionRecord[],
) {
  await updateBatchStatus(supabase, batchId, "validating", { started_at: new Date().toISOString() });
  const rows = records.map((record) => ({
    batch_id: batchId,
    content_hash: record.contentHash,
    claim_flags: record.claims,
    duplicate_match_type: record.duplicate.matchType,
    duplicate_product_id: record.duplicate.candidateProductId,
    external_id: record.normalized.externalId,
    normalized_hash: record.normalizedHash,
    normalized_payload: record.normalized,
    proposed_action: record.duplicate.proposedAction,
    quality_assessment: record.quality,
    quality_state: record.quality.state,
    raw_payload: record.parsed.product.rawPayload,
    row_number: record.parsed.rowNumber,
    status: record.status,
    source_use_status: sourceUse(record.normalized),
    validation_errors: record.validation.errors,
    validation_warnings: record.validation.warnings,
  }));
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase.from("product_ingestion_records").upsert(rows.slice(index, index + 200), {
      onConflict: "batch_id,row_number",
    });
    if (error) throw new Error(`Could not store ingestion records: ${safeDatabaseMessage(error)}`);
  }
  await refreshBatchCounts(supabase, batchId);
  for (const record of records) {
    if (record.duplicate.matchType === "none" || record.duplicate.proposedAction === "skip") continue;
    await recordIngestionEvent(supabase, {
      batchId,
      eventType: "duplicate_detected",
      metadata: {
        candidateProductId: record.duplicate.candidateProductId,
        matchType: record.duplicate.matchType,
        reasons: record.duplicate.reasons,
      },
    });
  }
  const invalid = records.filter((record) => record.status === "invalid").length;
  const status = invalid ? "partially_valid" : "ready_for_review";
  await updateBatchStatus(supabase, batchId, status);
  await recordIngestionEvent(supabase, {
    batchId,
    eventType: "validation_completed",
    metadata: { invalidRecords: invalid, totalRecords: records.length },
  });
}

export async function storeRawRecords(supabase: SupabaseClient, batchId: string, records: ParsedIngestionRecord[]) {
  await updateBatchStatus(supabase, batchId, "parsing", { started_at: new Date().toISOString() });
  const rows = records.map((record) => ({
    batch_id: batchId,
    content_hash: stableContentHash(record.product.rawPayload),
    external_id: record.product.externalId || null,
    raw_payload: record.product.rawPayload,
    row_number: record.rowNumber,
    status: "parsed",
  }));
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase.from("product_ingestion_records").upsert(rows.slice(index, index + 200), { onConflict: "batch_id,row_number" });
    if (error) throw new Error(`Could not preserve raw ingestion records: ${safeDatabaseMessage(error)}`);
  }
  await refreshBatchCounts(supabase, batchId);
  await recordIngestionEvent(supabase, { batchId, eventType: "parsing_completed", metadata: { totalRecords: rows.length } });
}

export async function approveIngestionRecord(supabase: SupabaseClient, batchId: string, recordId: string, actor: string, note: string, actorId?: string | null) {
  if (!actor.trim() || !note.trim()) throw new Error("Reviewer actor and approval reason are required.");
  const record = await getIngestionRecord(supabase, recordId);
  if (record.batch_id !== batchId) throw new Error("Ingestion record does not belong to this batch.");
  if (record.status === "invalid") throw new Error("Invalid records cannot be approved.");
  if (record.proposed_action === "manual_review") throw new Error("Resolve the duplicate or category review before approval.");
  const normalized = record.normalized_payload as NormalizedIngestionProduct | null;
  if (!normalized?.category?.categorySlug) throw new Error("Resolve the category mapping before approval.");
  const claims = asClaims(record.claim_flags);
  const duplicate = duplicateFromRecord(record);
  const quality = assessIngestionQuality(normalized, duplicate, claims);
  const gate = evaluatePublicationGate({ claims, duplicate, product: normalized, quality, reviewerApproved: true });
  if (!gate.allowed) {
    await supabase.from("product_ingestion_records").update({ publication_gate: gate, quality_assessment: quality, quality_state: quality.state }).eq("id", recordId);
    throw new Error(`Record does not pass the publication gate: ${gate.reasons.map((reason) => reason.code).join(", ")}`);
  }
  const { error } = await supabase.from("product_ingestion_records").update({
    publication_gate: gate,
    quality_assessment: quality,
    quality_state: quality.state,
    reviewer_actor: actor.trim(),
    reviewer_approved_at: new Date().toISOString(),
    reviewer_note: note.trim(),
    status: "approved",
  }).eq("id", recordId);
  if (error) throw new Error(`Could not approve ingestion record: ${safeDatabaseMessage(error)}`);
  await recordIngestionEvent(supabase, { actorId, batchId, eventType: "record_approved", metadata: { actor: actor.trim(), reason: note.trim() }, recordId });
  await refreshBatchCounts(supabase, batchId);
}

export async function replaceNormalizedPayloadForReview(
  supabase: SupabaseClient,
  recordId: string,
  payload: NormalizedIngestionProduct,
  actorId?: string | null,
  actor = "legacy-reviewer",
  reason = "Full normalized payload replacement",
) {
  const record = await getIngestionRecord(supabase, recordId);
  const validation = validateNormalizedProduct(payload);
  const claims = detectClaimFlags(payload);
  const duplicate = duplicateFromRecord(record);
  const quality = assessIngestionQuality(payload, duplicate, claims);
  const status = validation.publishable ? (validation.warnings.length ? "valid_with_warnings" : "valid") : "invalid";
  const { error } = await supabase.from("product_ingestion_records").update({
    claim_flags: claims,
    normalized_hash: stableContentHash(payload),
    normalized_payload: payload,
    publication_gate: null,
    quality_assessment: quality,
    quality_state: quality.state,
    reviewer_approved_at: null,
    reviewer_actor: null,
    reviewer_note: null,
    source_use_status: sourceUse(payload),
    status,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings,
  }).eq("id", recordId);
  if (error) throw new Error(`Could not update reviewed payload: ${safeDatabaseMessage(error)}`);
  await insertOverride(supabase, {
    actor,
    batchId: String(record.batch_id),
    fieldPath: "$",
    newValue: payload,
    oldValue: record.normalized_payload,
    reason,
    recordId,
  });
  await recordIngestionEvent(supabase, { actorId, batchId: String(record.batch_id), eventType: "normalized_payload_reviewed", recordId });
  await refreshBatchCounts(supabase, String(record.batch_id));
  return validation;
}

export async function applyIngestionOverride(
  supabase: SupabaseClient,
  recordId: string,
  fieldPath: "productName" | "category" | "speciesCodes" | "countryCodes" | "images" | "variants",
  newValue: unknown,
  actor: string,
  reason: string,
  actorId?: string | null,
) {
  if (!actor.trim() || !reason.trim()) throw new Error("Override actor and reason are required.");
  const record = await getIngestionRecord(supabase, recordId);
  const current = structuredClone(record.normalized_payload) as NormalizedIngestionProduct;
  if (!current || typeof current !== "object") throw new Error("Normalized payload is unavailable.");
  const oldValue = structuredClone((current as unknown as Record<string, unknown>)[fieldPath]);
  (current as unknown as Record<string, unknown>)[fieldPath] = structuredClone(newValue);
  const validation = validateNormalizedProduct(current);
  const claims = detectClaimFlags(current);
  const duplicate = duplicateFromRecord(record);
  const quality = assessIngestionQuality(current, duplicate, claims);
  const status = validation.publishable ? (validation.warnings.length ? "valid_with_warnings" : "valid") : "invalid";
  const { error } = await supabase.from("product_ingestion_records").update({
    claim_flags: claims,
    normalized_hash: stableContentHash(current),
    normalized_payload: current,
    publication_gate: null,
    quality_assessment: quality,
    quality_state: quality.state,
    reviewer_approved_at: null,
    reviewer_actor: null,
    reviewer_note: null,
    source_use_status: sourceUse(current),
    status,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings,
  }).eq("id", recordId);
  if (error) throw new Error(`Could not apply ingestion override: ${safeDatabaseMessage(error)}`);
  await insertOverride(supabase, { actor, batchId: String(record.batch_id), fieldPath, newValue, oldValue, reason, recordId });
  await recordIngestionEvent(supabase, { actorId, batchId: String(record.batch_id), eventType: "record_overridden", metadata: { actor, fieldPath, reason }, recordId });
  return { quality, validation };
}

export async function reviewIngestionClaim(
  supabase: SupabaseClient,
  recordId: string,
  claimIndex: number,
  decision: "allow" | "exclude",
  actor: string,
  note: string,
  actorId?: string | null,
) {
  if (!actor.trim() || !note.trim()) throw new Error("Claim reviewer and note are required.");
  const record = await getIngestionRecord(supabase, recordId);
  const claims = asClaims(record.claim_flags);
  if (!claims[claimIndex]) throw new Error("Claim index does not exist.");
  const oldValue = structuredClone(claims[claimIndex]);
  claims[claimIndex] = { ...claims[claimIndex], publishDecision: decision, reviewerNote: note.trim(), reviewStatus: "reviewed" };
  const product = record.normalized_payload as NormalizedIngestionProduct;
  const quality = assessIngestionQuality(product, duplicateFromRecord(record), claims);
  const { error } = await supabase.from("product_ingestion_records").update({ claim_flags: claims, publication_gate: null, quality_assessment: quality, quality_state: quality.state }).eq("id", recordId);
  if (error) throw new Error(`Could not review claim: ${safeDatabaseMessage(error)}`);
  await insertOverride(supabase, { actor, batchId: String(record.batch_id), fieldPath: `claim_flags[${claimIndex}]`, newValue: claims[claimIndex], oldValue, reason: note, recordId });
  await recordIngestionEvent(supabase, { actorId, batchId: String(record.batch_id), eventType: "claim_reviewed", metadata: { actor, claimIndex, decision }, recordId });
  return claims[claimIndex];
}

export async function resolveIngestionRecordAction(
  supabase: SupabaseClient,
  recordId: string,
  action: "create" | "update" | "skip",
  duplicateProductId?: string | null,
  actorId?: string | null,
) {
  if ((action === "update" || action === "skip") && !duplicateProductId) throw new Error("An existing product ID is required for update or skip.");
  const record = await getIngestionRecord(supabase, recordId);
  const { error } = await supabase.from("product_ingestion_records").update({
    duplicate_product_id: duplicateProductId || null,
    proposed_action: action,
    status: "valid_with_warnings",
    publication_gate: null,
    reviewer_approved_at: null,
  }).eq("id", recordId);
  if (error) throw new Error(`Could not resolve ingestion action: ${safeDatabaseMessage(error)}`);
  await recordIngestionEvent(supabase, { actorId, batchId: String(record.batch_id), eventType: "duplicate_resolved", metadata: { action, duplicateProductId: duplicateProductId || null }, recordId });
}

export async function approveIngestionBatch(supabase: SupabaseClient, batchId: string, actorId?: string | null) {
  const { data, error } = await supabase.from("product_ingestion_records").select("id, status")
    .eq("batch_id", batchId)
    .in("status", ["valid", "valid_with_warnings", "possible_duplicate"])
    .limit(1);
  if (error) throw new Error(`Could not check batch review state: ${safeDatabaseMessage(error)}`);
  if (data?.length) throw new Error("Review or reject every publishable record before approving the batch.");
  const { count, error: approvedError } = await supabase.from("product_ingestion_records")
    .select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("status", "approved");
  if (approvedError) throw new Error(`Could not check approved records: ${safeDatabaseMessage(approvedError)}`);
  if (!count) throw new Error("A batch needs at least one approved record before publication.");
  await updateBatchStatus(supabase, batchId, "approved");
  await recordIngestionEvent(supabase, { actorId, batchId, eventType: "batch_approved", metadata: { approvedRecords: count } });
}

export async function rejectIngestionRecord(supabase: SupabaseClient, batchId: string, recordId: string, message?: string | null, actorId?: string | null) {
  const { error } = await supabase.from("product_ingestion_records").update({ status: "rejected" }).eq("id", recordId).eq("batch_id", batchId);
  if (error) throw new Error(`Could not reject ingestion record: ${safeDatabaseMessage(error)}`);
  await recordIngestionEvent(supabase, { actorId, batchId, eventType: "record_rejected", message, recordId });
  await refreshBatchCounts(supabase, batchId);
}

export async function getBatchReviewSummary(supabase: SupabaseClient, batchId: string): Promise<BatchReviewSummary> {
  const { data, error } = await supabase.from("product_ingestion_records")
    .select("status, duplicate_match_type, proposed_action")
    .eq("batch_id", batchId)
    .limit(5_000);
  if (error) throw new Error(`Could not load batch summary: ${safeDatabaseMessage(error)}`);
  const rows = data || [];
  return {
    exactDuplicates: rows.filter((row) => row.duplicate_match_type === "exact").length,
    failedRecords: rows.filter((row) => row.status === "failed").length,
    invalidRecords: rows.filter((row) => row.status === "invalid").length,
    possibleDuplicates: rows.filter((row) => row.duplicate_match_type === "possible" || row.duplicate_match_type === "probable").length,
    proposedCreates: rows.filter((row) => row.proposed_action === "create").length,
    proposedUpdates: rows.filter((row) => row.proposed_action === "update").length,
    publishedRecords: rows.filter((row) => row.status === "published").length,
    totalRecords: rows.length,
    validRecords: rows.filter((row) => row.status === "valid").length,
    validWithWarnings: rows.filter((row) => row.status === "valid_with_warnings").length,
  };
}

function duplicateFromRecord(record: Record<string, unknown>): DuplicateDetectionResult {
  const matchType = record.duplicate_match_type;
  const proposedAction = record.proposed_action;
  return {
    candidateProductId: typeof record.duplicate_product_id === "string" ? record.duplicate_product_id : null,
    matchType: matchType === "exact" || matchType === "probable" || matchType === "possible" ? matchType : "none",
    proposedAction: proposedAction === "update" || proposedAction === "skip" || proposedAction === "merge" || proposedAction === "manual_review" ? proposedAction : "create",
    reasons: [],
  };
}

function asClaims(value: unknown): ClaimFlag[] {
  return Array.isArray(value) ? value as ClaimFlag[] : [];
}

async function insertOverride(supabase: SupabaseClient, input: {
  actor: string;
  batchId: string;
  fieldPath: string;
  newValue: unknown;
  oldValue: unknown;
  reason: string;
  recordId: string;
}) {
  const { error } = await supabase.from("product_ingestion_overrides").insert({
    actor: input.actor.trim(),
    batch_id: input.batchId,
    field_path: input.fieldPath,
    new_value: input.newValue,
    old_value: input.oldValue,
    reason: input.reason.trim(),
    record_id: input.recordId,
  });
  if (error) throw new Error(`Could not audit ingestion override: ${safeDatabaseMessage(error)}`);
}

export async function getIngestionRecord(supabase: SupabaseClient, recordId: string) {
  const { data, error } = await supabase.from("product_ingestion_records").select("*").eq("id", recordId).single();
  if (error || !data) throw new Error(`Could not load ingestion record: ${safeDatabaseMessage(error)}`);
  return data as Record<string, unknown>;
}

export async function updateBatchStatus(supabase: SupabaseClient, batchId: string, status: string, fields: Record<string, unknown> = {}) {
  const { error } = await supabase.from("product_ingestion_batches").update({ ...fields, status }).eq("id", batchId);
  if (error) throw new Error(`Could not update ingestion batch: ${safeDatabaseMessage(error)}`);
}

export async function refreshBatchCounts(supabase: SupabaseClient, batchId: string) {
  const { error } = await supabase.rpc("refresh_product_ingestion_batch_counts", { p_batch_id: batchId });
  if (error) throw new Error(`Could not refresh ingestion counts: ${safeDatabaseMessage(error)}`);
}
