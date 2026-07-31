import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CsvProductIngestionAdapter } from "../app/lib/catalog-ingestion/adapters/csv-adapter.ts";
import { JsonProductIngestionAdapter } from "../app/lib/catalog-ingestion/adapters/json-adapter.ts";
import { processIngestionInput } from "../app/lib/catalog-ingestion/pipeline.ts";
import { publishApprovedRecord, summarizePublicationResults } from "../app/lib/catalog-ingestion/publish.ts";

const csv = readFileSync(new URL("./fixtures/catalog-ingestion/example-products.csv", import.meta.url), "utf8");
const json = readFileSync(new URL("./fixtures/catalog-ingestion/example-products.json", import.meta.url), "utf8");

test("small CSV and JSON batches produce accurate review summaries", async () => {
  const csvResult = await processIngestionInput({ adapter: new CsvProductIngestionAdapter("fixture"), input: { body: csv } });
  assert.deepEqual(csvResult.summary, {
    exactDuplicates: 0,
    failedRecords: 0,
    invalidRecords: 1,
    possibleDuplicates: 0,
    proposedCreates: 4,
    proposedUpdates: 0,
    publishedRecords: 0,
    totalRecords: 4,
    validRecords: 0,
    validWithWarnings: 3,
  });
  const jsonResult = await processIngestionInput({ adapter: new JsonProductIngestionAdapter("fixture"), input: { body: json } });
  assert.equal(jsonResult.summary.totalRecords, 3);
  assert.equal(jsonResult.summary.invalidRecords, 0);
});

test("repeated unchanged imports are idempotent no-ops", async () => {
  const first = await processIngestionInput({ adapter: new JsonProductIngestionAdapter("fixture"), input: { body: json } });
  const hashes = new Map(first.records.map((record) => [record.normalized.externalId, record.normalizedHash]));
  const second = await processIngestionInput({ adapter: new JsonProductIngestionAdapter("fixture"), input: { body: json }, previousHashes: hashes });
  assert.equal(second.records.every((record) => record.duplicate.proposedAction === "skip"), true);
});

test("record-level publication failures produce partial batch outcomes", () => {
  assert.deepEqual(summarizePublicationResults([{ ok: true }, { ok: false }, { ok: true }]), {
    failed: 1,
    published: 2,
    status: "failed",
  });
});

test("publishing rejects records that were not explicitly approved", async () => {
  await assert.rejects(
    publishApprovedRecord({}, { id: "batch", provider: "fixture", source_type: "json", source_url: null, status: "approved" }, {
      attempt_count: 0,
      batch_id: "batch",
      duplicate_product_id: null,
      id: "record",
      normalized_hash: "hash",
      normalized_payload: {},
      proposed_action: "create",
      raw_payload: {},
      status: "valid",
    }),
    /Only approved ingestion records can be published/,
  );
});
