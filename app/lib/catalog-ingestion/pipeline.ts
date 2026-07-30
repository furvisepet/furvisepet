import { detectProductDuplicate } from "./deduplicate.ts";
import { detectClaimFlags } from "./claims.ts";
import { stableContentHash } from "./hashing.ts";
import { normalizeIngestionProduct } from "./normalize.ts";
import { assessIngestionQuality } from "./quality.ts";
import type {
  BatchReviewSummary,
  ClaimFlag,
  DuplicateCandidate,
  DuplicateDetectionResult,
  NormalizedIngestionProduct,
  ParsedIngestionRecord,
  ProductIngestionAdapter,
  ProductIngestionAdapterInput,
  QualityAssessment,
  ValidationResult,
} from "./types";
import { validateNormalizedProduct } from "./validate.ts";

export type ProcessedIngestionRecord = {
  claims: ClaimFlag[];
  contentHash: string;
  duplicate: DuplicateDetectionResult;
  normalized: NormalizedIngestionProduct;
  normalizedHash: string;
  parsed: ParsedIngestionRecord;
  quality: QualityAssessment;
  status: "valid" | "valid_with_warnings" | "invalid" | "possible_duplicate";
  validation: ValidationResult;
};

export async function processIngestionInput({
  adapter,
  candidates = [],
  input,
  previousHashes = new Map<string, string>(),
  supportedSpecies = ["dog", "cat"],
}: {
  adapter: ProductIngestionAdapter;
  candidates?: DuplicateCandidate[];
  input: ProductIngestionAdapterInput;
  previousHashes?: Map<string, string>;
  supportedSpecies?: Iterable<string>;
}) {
  const parsed = await adapter.parse(input);
  const records: ProcessedIngestionRecord[] = [];
  const seenExternalIds = new Set<string>();
  for (const item of parsed) {
    const record = processParsedIngestionRecord({
      candidates,
      parsed: item,
      previousNormalizedHash: item.product.externalId ? previousHashes.get(item.product.externalId) : null,
      provider: adapter.provider,
      supportedSpecies,
    });
    const externalId = record.normalized.externalId;
    if (externalId && seenExternalIds.has(externalId) && record.duplicate.matchType === "none") {
      record.duplicate = { candidateProductId: null, matchType: "exact", proposedAction: "manual_review", reasons: ["provider_batch_external_id"] };
      record.quality = assessIngestionQuality(record.normalized, record.duplicate, record.claims);
      record.status = "possible_duplicate";
    }
    if (externalId) seenExternalIds.add(externalId);
    records.push(record);
  }
  return { records, summary: summarizeProcessedRecords(records) };
}

export function processParsedIngestionRecord({
  candidates = [],
  parsed,
  previousNormalizedHash = null,
  provider,
  supportedSpecies = ["dog", "cat"],
}: {
  candidates?: DuplicateCandidate[];
  parsed: ParsedIngestionRecord;
  previousNormalizedHash?: string | null;
  provider: string;
  supportedSpecies?: Iterable<string>;
}): ProcessedIngestionRecord {
    const normalized = normalizeIngestionProduct(parsed.product);
    const contentHash = stableContentHash(parsed.product.rawPayload);
    const normalizedHash = stableContentHash(normalized);
    const validation = validateNormalizedProduct(normalized, { supportedSpecies });
    const duplicate = detectProductDuplicate({
      candidates,
      normalizedHash,
      previousNormalizedHash,
      product: normalized,
      provider,
    });
    const claims = detectClaimFlags(normalized);
    const quality = assessIngestionQuality(normalized, duplicate, claims);
    const status = deriveRecordStatus(validation, duplicate);
    return { claims, contentHash, duplicate, normalized, normalizedHash, parsed, quality, status, validation };
}

export function summarizeProcessedRecords(records: ProcessedIngestionRecord[]): BatchReviewSummary {
  return {
    exactDuplicates: records.filter((record) => record.duplicate.matchType === "exact").length,
    failedRecords: 0,
    invalidRecords: records.filter((record) => record.status === "invalid").length,
    possibleDuplicates: records.filter((record) => record.duplicate.matchType === "possible" || record.duplicate.matchType === "probable").length,
    proposedCreates: records.filter((record) => record.duplicate.proposedAction === "create").length,
    proposedUpdates: records.filter((record) => record.duplicate.proposedAction === "update").length,
    publishedRecords: 0,
    totalRecords: records.length,
    validRecords: records.filter((record) => record.status === "valid").length,
    validWithWarnings: records.filter((record) => record.status === "valid_with_warnings").length,
  };
}

function deriveRecordStatus(validation: ValidationResult, duplicate: DuplicateDetectionResult): ProcessedIngestionRecord["status"] {
  if (!validation.publishable) return "invalid";
  if (duplicate.proposedAction === "manual_review" || duplicate.matchType === "possible" || duplicate.matchType === "probable") return "possible_duplicate";
  return validation.warnings.length ? "valid_with_warnings" : "valid";
}
