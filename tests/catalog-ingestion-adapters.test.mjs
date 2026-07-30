import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CsvProductIngestionAdapter, parseCsv } from "../app/lib/catalog-ingestion/adapters/csv-adapter.ts";
import { JsonProductIngestionAdapter } from "../app/lib/catalog-ingestion/adapters/json-adapter.ts";

const csvFixture = readFileSync(new URL("./fixtures/catalog-ingestion/example-products.csv", import.meta.url), "utf8");
const jsonFixture = readFileSync(new URL("./fixtures/catalog-ingestion/example-products.json", import.meta.url), "utf8");

test("CSV parsing handles UTF-8, quotes, embedded commas, and row numbers", async () => {
  const rows = parseCsv('brand,product_name,description\n"Acme, Inc.",Brush,"Soft, gentle bristles"\n');
  assert.deepEqual(rows[1], ["Acme, Inc.", "Brush", "Soft, gentle bristles"]);
  const records = await new CsvProductIngestionAdapter("fixture").parse({ body: csvFixture });
  assert.equal(records.length, 4);
  assert.equal(records[0].rowNumber, 2);
  assert.equal(records[0].product.brandName, "North Trail");
  assert.deepEqual(records[0].product.ingredients, ["Chicken", "Brown rice"]);
});

test("CSV parsing validates headers, malformed quoting, and configurable columns", async () => {
  await assert.rejects(
    new CsvProductIngestionAdapter("fixture").parse({ body: "brand,name\nAcme,Brush\n" }),
    /missing required header: product_name/,
  );
  assert.throws(() => parseCsv('brand,product_name\nAcme,"Brush\n'), /unterminated quoted field/);
  const adapter = new CsvProductIngestionAdapter("fixture", { productName: "title", brandName: "maker" });
  const records = await adapter.parse({ body: "maker,title\nAcme,Brush\n" });
  assert.equal(records[0].product.productName, "Brush");
});

test("CSV formula-like cells are preserved and flagged without execution", async () => {
  const adapter = new CsvProductIngestionAdapter("fixture");
  const [record] = await adapter.parse({ body: "brand,product_name\nAcme,=2+2\n" });
  assert.equal(record.product.productName, "=2+2");
  assert.deepEqual(record.product.sourceMetadata.formulaLikeFields, ["product_name"]);
});

test("JSON supports arrays and wrapped products with explicit object validation", async () => {
  const adapter = new JsonProductIngestionAdapter("fixture");
  const wrapped = await adapter.parse({ body: jsonFixture });
  assert.equal(wrapped.length, 3);
  assert.equal(wrapped[0].product.variants.length, 2);
  const array = await adapter.parse({ body: JSON.stringify([{ brand: "Acme", name: "Brush" }]) });
  assert.equal(array[0].product.brandName, "Acme");
});

test("JSON rejects malformed text, executable JavaScript, and non-object records", async () => {
  const adapter = new JsonProductIngestionAdapter("fixture");
  await assert.rejects(adapter.parse({ body: "{not json}" }), /JSON is malformed/);
  await assert.rejects(adapter.parse({ body: "module.exports = []" }), /JSON is malformed/);
  await assert.rejects(adapter.parse({ body: "[1]" }), /Each product must be a JSON object/);
});
