import { CsvProductIngestionAdapter, parseCsv } from "./csv-adapter.ts";
import { PURINA_CA_MANUAL_PROVIDER, PURINA_CA_MANUAL_REQUIRED_HEADERS } from "../providers/purina-ca-manual.ts";
import type { ParsedIngestionRecord, ProductIngestionAdapter, ProductIngestionAdapterInput, SourceUseStatus } from "../types";

export class PurinaCanadaManualAdapter implements ProductIngestionAdapter {
  readonly provider = PURINA_CA_MANUAL_PROVIDER.providerId;
  readonly sourceType = PURINA_CA_MANUAL_PROVIDER.sourceType;

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    const text = decodeUtf8(input.body);
    assertStrictHeaders(text);
    if (new TextEncoder().encode(text).byteLength > PURINA_CA_MANUAL_PROVIDER.batchLimits.maxFileBytes) {
      throw new Error("Purina Canada source file exceeds the provider file-size limit.");
    }
    const base = await new CsvProductIngestionAdapter(this.provider).parse({ ...input, body: text });
    if (base.length > PURINA_CA_MANUAL_PROVIDER.batchLimits.maxRecords) {
      throw new Error("Purina Canada source file exceeds the controlled 100-record batch limit.");
    }
    return base.map((record) => enrichAndValidate(record));
  }
}

function enrichAndValidate(record: ParsedIngestionRecord): ParsedIngestionRecord {
  const row = record.product.rawPayload;
  const sourceUrl = required(row.source_url, "source_url", record.rowNumber);
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || !PURINA_CA_MANUAL_PROVIDER.supportedHostnames.some((hostname) => hostname === url.hostname)) {
    throw new Error(`Row ${record.rowNumber} source_url must use an allowlisted Purina Canada HTTPS host.`);
  }
  const sourceUseStatus = required(row.source_use_status, "source_use_status", record.rowNumber) as SourceUseStatus;
  if (!(new Set<SourceUseStatus>(["permitted", "restricted", "unresolved"]).has(sourceUseStatus))) {
    throw new Error(`Row ${record.rowNumber} has an invalid source_use_status.`);
  }
  if (required(row.countries, "countries", record.rowNumber).toUpperCase() !== "CA") {
    throw new Error(`Row ${record.rowNumber} must be scoped only to Canada.`);
  }
  if (required(row.species, "species", record.rowNumber).toLowerCase() !== "dog") {
    throw new Error(`Row ${record.rowNumber} must have an explicit dog species value.`);
  }
  const providerCategory = required(row.subcategory, "subcategory", record.rowNumber).toLowerCase();
  if (!(providerCategory in PURINA_CA_MANUAL_PROVIDER.categoryMappings)) {
    throw new Error(`Row ${record.rowNumber} uses an unsupported provider category.`);
  }
  record.product.sourceMetadata = {
    availabilityAuthoritative: row.availability_authoritative === "true",
    canadaEvidence: required(row.canada_evidence, "canada_evidence", record.rowNumber),
    imageUseStatus: required(row.images_display_status, "images_display_status", record.rowNumber),
    priceAuthoritative: row.price_authoritative === "true",
    providerId: PURINA_CA_MANUAL_PROVIDER.providerId,
    sourceReviewedAt: required(row.source_reviewed_at, "source_reviewed_at", record.rowNumber),
    sourceUseStatus,
    speciesEvidence: "official_canada_product_taxonomy",
  };
  return record;
}

function assertStrictHeaders(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("Purina Canada source CSV is empty.");
  const actual = rows[0].map((value) => value.trim());
  if (actual.length !== PURINA_CA_MANUAL_REQUIRED_HEADERS.length
    || actual.some((value, index) => value !== PURINA_CA_MANUAL_REQUIRED_HEADERS[index])) {
    throw new Error(`Purina Canada source CSV headers must exactly match: ${PURINA_CA_MANUAL_REQUIRED_HEADERS.join(",")}`);
  }
}

function decodeUtf8(body: ProductIngestionAdapterInput["body"]) {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder("utf-8", { fatal: true }).decode(body);
  throw new Error("Purina Canada source must be UTF-8 CSV text.");
}

function required(value: unknown, field: string, row: number | null) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Row ${row} is missing ${field}.`);
  return value.trim();
}
