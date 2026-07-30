import { readFile } from "node:fs/promises";
import { createTrustedIngestionClientFromEnv } from "../app/lib/catalog-ingestion/admin-client.ts";
import { CsvProductIngestionAdapter } from "../app/lib/catalog-ingestion/adapters/csv-adapter.ts";
import { JsonProductIngestionAdapter } from "../app/lib/catalog-ingestion/adapters/json-adapter.ts";
import { PurinaCanadaManualAdapter } from "../app/lib/catalog-ingestion/adapters/purina-ca-manual-adapter.ts";
import { preparePrivateAuthorizedCatalog, resolvePrivatePath } from "../app/lib/catalog-ingestion/providers/manual-authorized-upload.ts";
import { recordIngestionEvent } from "../app/lib/catalog-ingestion/audit.ts";
import {
  approveIngestionBatch,
  approveIngestionRecord,
  applyIngestionOverride,
  createIngestionBatch,
  getBatchReviewSummary,
  getIngestionRecord,
  rejectIngestionRecord,
  replaceNormalizedPayloadForReview,
  reviewIngestionClaim,
  resolveIngestionRecordAction,
  storeProcessedRecords,
  storeRawRecords,
  updateBatchStatus,
} from "../app/lib/catalog-ingestion/batches.ts";
import { loadCatalogDuplicateCandidates } from "../app/lib/catalog-ingestion/catalog-candidates.ts";
import {
  processIngestionInput,
  processParsedIngestionRecord,
  summarizeProcessedRecords,
} from "../app/lib/catalog-ingestion/pipeline.ts";
import { publishApprovedBatch, retryFailedRecords } from "../app/lib/catalog-ingestion/publish.ts";

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "preview":
    await preview(args);
    break;
  case "provider-001":
    await provider001(args);
    break;
  case "authorized":
    await authorizedCatalog(args);
    break;
  case "stage":
    await stage(args);
    break;
  case "list":
    await listBatches();
    break;
  case "summary":
    await summary(args[0]);
    break;
  case "inspect":
    await inspect(args[0]);
    break;
  case "approve":
    await approve(args[0], args[1], args[2], args.slice(3).join(" "));
    break;
  case "approve-batch":
    await approveBatch(args[0]);
    break;
  case "reject":
    await reject(args[0], args[1], args.slice(2).join(" "));
    break;
  case "resolve":
    await resolve(args[0], args[1], args[2]);
    break;
  case "review-claim":
    await reviewClaim(args[0], args[1], args[2], args[3], args.slice(4).join(" "));
    break;
  case "override":
    await override(args[0], args[1], args[2], args[3], args.slice(4).join(" "));
    break;
  case "replace-normalized":
    await replaceNormalized(args[0], args[1]);
    break;
  case "publish":
    await publish(args[0]);
    break;
  case "retry":
    await retry(args[0]);
    break;
  default:
    usage();
    process.exitCode = 1;
}

async function preview([format, filename, provider = "preview"] = []) {
  const adapter = adapterFor(format, provider);
  const body = await readSourceFile(filename);
  const result = await processIngestionInput({ adapter, input: { body, filename } });
  output({ format, provider, summary: result.summary });
}

async function stage([format, filename, provider, sourceType] = []) {
  if (!provider) throw new Error("stage requires a provider.");
  const adapter = adapterFor(format, provider);
  return stageWithAdapter({ adapter, filename, sourceType: sourceType || adapter.sourceType });
}

async function stageWithAdapter({ adapter, body: providedBody, filename, manifest = null, sourceType = adapter.sourceType }) {
  const supabase = createTrustedIngestionClientFromEnv();
  const body = providedBody ?? await readSourceFile(filename);
  const batch = await createIngestionBatch(supabase, {
    countryCode: manifest?.country || null,
    filename,
    provider: adapter.provider,
    providerManifest: manifest,
    sourceName: filename,
    sourceType,
    speciesCode: manifest?.species || null,
  });
  const batchId = String(batch.id);
  await updateBatchStatus(supabase, batchId, "parsing", { started_at: new Date().toISOString() });
  await recordIngestionEvent(supabase, { batchId, eventType: "parsing_started" });
  let parsed;
  try {
    parsed = await adapter.parse({ body, filename });
  } catch (error) {
    await updateBatchStatus(supabase, batchId, "failed", { completed_at: new Date().toISOString() });
    await recordIngestionEvent(supabase, { batchId, eventType: "parsing_failed", message: error instanceof Error ? error.message : "Parsing failed." });
    throw error;
  }
  await storeRawRecords(supabase, batchId, parsed);
  const { data: speciesRows, error: speciesError } = await supabase.from("species").select("code").eq("is_active", true);
  if (speciesError) throw new Error("Could not load supported species.");
  const supportedSpecies = (speciesRows || []).map((row) => row.code);
  const processed = [];
  for (const record of parsed) {
    const normalizedPreview = processParsedIngestionRecord({ parsed: record, provider: adapter.provider, supportedSpecies });
    const candidates = await loadCatalogDuplicateCandidates(supabase, normalizedPreview.normalized, adapter.provider);
    const previousNormalizedHash = await loadPreviousHash(supabase, adapter.provider, normalizedPreview.normalized.externalId);
    processed.push(processParsedIngestionRecord({ candidates, parsed: record, previousNormalizedHash, provider: adapter.provider, supportedSpecies }));
  }
  await storeProcessedRecords(supabase, batchId, processed);
  output({ batchId, quality: qualitySummary(processed), summary: summarizeProcessedRecords(processed) });
  return batchId;
}

async function authorizedCatalog([action, contractFilename, metadataFilename, feedFilename, mappingFilename] = []) {
  if (!(action === "preview" || action === "stage")) throw new Error("authorized action must be preview or stage.");
  required(contractFilename, "private contract configuration filename");
  required(metadataFilename, "private authorization metadata filename");
  required(feedFilename, "private feed filename");
  const contract = JSON.parse(await readFile(resolvePrivatePath(contractFilename), "utf8"));
  const metadata = JSON.parse(await readFile(resolvePrivatePath(metadataFilename), "utf8"));
  const mapping = mappingFilename ? JSON.parse(await readFile(resolvePrivatePath(mappingFilename), "utf8")) : undefined;
  const prepared = await preparePrivateAuthorizedCatalog({ contract, feedPath: feedFilename, mapping, metadata });
  if (action === "preview") {
    const result = await processIngestionInput({ adapter: prepared.adapter, input: { body: prepared.body, filename: prepared.filename } });
    output({ provider: prepared.adapter.provider, quality: qualitySummary(result.records), summary: result.summary });
    return;
  }
  await stageWithAdapter({ adapter: prepared.adapter, body: prepared.body, filename: prepared.filename, manifest: metadata });
}

async function provider001([action, filename = "data/product-providers/purina-ca-001/products.csv"] = []) {
  if (!(["preview", "stage", "refresh"].includes(action))) throw new Error("provider-001 action must be preview, stage, or refresh.");
  const adapter = new PurinaCanadaManualAdapter();
  const manifest = JSON.parse(await readSourceFile("data/product-providers/purina-ca-001/manifest.json"));
  if (action === "preview") {
    const result = await processIngestionInput({ adapter, input: { body: await readSourceFile(filename), filename } });
    output({ provider: adapter.provider, quality: qualitySummary(result.records), summary: result.summary });
    return;
  }
  await stageWithAdapter({ adapter, filename, manifest });
}

async function listBatches() {
  const supabase = createTrustedIngestionClientFromEnv();
  const { data, error } = await supabase.from("product_ingestion_batches")
    .select("id, provider, source_type, source_name, status, total_records, valid_records, invalid_records, duplicate_records, published_records, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Could not list ingestion batches.");
  output(data || []);
}

async function summary(batchId) {
  required(batchId, "batch ID");
  output(await getBatchReviewSummary(createTrustedIngestionClientFromEnv(), batchId));
}

async function inspect(recordId) {
  required(recordId, "record ID");
  output(await getIngestionRecord(createTrustedIngestionClientFromEnv(), recordId));
}

async function approve(batchId, recordId, actor = process.env.FURVISE_REVIEWER, note = "") {
  required(batchId, "batch ID"); required(recordId, "record ID");
  required(actor, "reviewer actor"); required(note, "approval reason");
  await approveIngestionRecord(createTrustedIngestionClientFromEnv(), batchId, recordId, actor, note);
  output({ approved: recordId });
}

async function approveBatch(batchId) {
  required(batchId, "batch ID");
  await approveIngestionBatch(createTrustedIngestionClientFromEnv(), batchId);
  output({ approved: true });
}

async function reject(batchId, recordId, message) {
  required(batchId, "batch ID"); required(recordId, "record ID");
  await rejectIngestionRecord(createTrustedIngestionClientFromEnv(), batchId, recordId, message || null);
  output({ rejected: recordId });
}

async function resolve(recordId, action, productId) {
  required(recordId, "record ID");
  if (!(["create", "update", "skip"].includes(action))) throw new Error("resolve action must be create, update, or skip.");
  await resolveIngestionRecordAction(createTrustedIngestionClientFromEnv(), recordId, action, productId || null);
  output({ action, recordId });
}

async function reviewClaim(recordId, claimIndex, decision, actor, note) {
  required(recordId, "record ID"); required(claimIndex, "claim index"); required(actor, "reviewer actor"); required(note, "review note");
  if (!(decision === "allow" || decision === "exclude")) throw new Error("Claim decision must be allow or exclude.");
  output(await reviewIngestionClaim(createTrustedIngestionClientFromEnv(), recordId, Number(claimIndex), decision, actor, note));
}

async function override(recordId, fieldPath, jsonValue, actor, reason) {
  required(recordId, "record ID"); required(fieldPath, "field path"); required(jsonValue, "JSON value"); required(actor, "reviewer actor"); required(reason, "override reason");
  const allowed = ["productName", "category", "speciesCodes", "countryCodes", "images", "variants"];
  if (!allowed.includes(fieldPath)) throw new Error(`Override field must be one of: ${allowed.join(", ")}`);
  output(await applyIngestionOverride(createTrustedIngestionClientFromEnv(), recordId, fieldPath, JSON.parse(jsonValue), actor, reason));
}

async function replaceNormalized(recordId, filename) {
  required(recordId, "record ID");
  const payload = JSON.parse(await readSourceFile(filename));
  const result = await replaceNormalizedPayloadForReview(createTrustedIngestionClientFromEnv(), recordId, payload);
  output(result);
}

async function publish(batchId) {
  required(batchId, "batch ID");
  output(await publishApprovedBatch(createTrustedIngestionClientFromEnv(), batchId));
}

async function retry(batchId) {
  required(batchId, "batch ID");
  output(await retryFailedRecords(createTrustedIngestionClientFromEnv(), batchId));
}

async function loadPreviousHash(supabase, provider, externalId) {
  if (!externalId) return null;
  const { data } = await supabase.from("product_sources").select("content_hash")
    .eq("provider", provider).eq("external_id", externalId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (data?.content_hash) return data.content_hash;
  const { data: staged } = await supabase.from("product_ingestion_records")
    .select("normalized_hash, product_ingestion_batches!inner(provider)")
    .eq("external_id", externalId)
    .eq("product_ingestion_batches.provider", provider)
    .not("normalized_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return staged?.normalized_hash || null;
}

function qualitySummary(records) {
  const states = { blocked: 0, manual_review: 0, publishable: 0, publishable_with_gaps: 0 };
  let claimFlags = 0;
  for (const record of records) { states[record.quality.state] += 1; claimFlags += record.claims.length; }
  return { claimFlags, states };
}

function adapterFor(format, provider) {
  if (format === "csv") return new CsvProductIngestionAdapter(provider);
  if (format === "json") return new JsonProductIngestionAdapter(provider);
  throw new Error("Format must be csv or json.");
}

async function readSourceFile(filename) {
  required(filename, "filename");
  return readFile(filename, "utf8");
}

function output(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function required(value, label) { if (!value) throw new Error(`Missing ${label}.`); }
function usage() {
  process.stdout.write([
    "Usage:",
    "  catalog-ingestion.mjs authorized preview|stage CONTRACT.json METADATA.json FEED [MAPPING.json]",
    "  npm.cmd run catalog:ingest -- preview <csv|json> <file> [provider]",
    "  npm.cmd run catalog:ingest -- provider-001 <preview|stage|refresh> [file]",
    "  npm.cmd run catalog:ingest -- stage <csv|json> <file> <provider> [source-type]",
    "  npm.cmd run catalog:ingest -- list",
    "  npm.cmd run catalog:ingest -- summary <batch-id>",
    "  npm.cmd run catalog:ingest -- inspect <record-id>",
    "  npm.cmd run catalog:ingest -- approve <batch-id> <record-id> <actor> <reason>",
    "  npm.cmd run catalog:ingest -- approve-batch <batch-id>",
    "  npm.cmd run catalog:ingest -- reject <batch-id> <record-id> [reason]",
    "  npm.cmd run catalog:ingest -- resolve <record-id> <create|update|skip> [product-id]",
    "  npm.cmd run catalog:ingest -- review-claim <record-id> <index> <allow|exclude> <actor> <note>",
    "  npm.cmd run catalog:ingest -- override <record-id> <field> <json-value> <actor> <reason>",
    "  npm.cmd run catalog:ingest -- replace-normalized <record-id> <json-file>",
    "  npm.cmd run catalog:ingest -- publish <batch-id>",
    "  npm.cmd run catalog:ingest -- retry <batch-id>",
  ].join("\n") + "\n");
}
