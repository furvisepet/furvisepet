import {
  DEFAULT_CSV_COLUMN_MAPPING,
  FORMULA_PREFIXES,
  INGESTION_LIMITS,
} from "../constants.ts";
import { assertCollectionLimits, rawProductFromObject } from "../schemas.ts";
import type {
  ParsedIngestionRecord,
  ProductIngestionAdapter,
  ProductIngestionAdapterInput,
} from "../types";

export type CsvColumnMapping = Partial<Record<keyof typeof DEFAULT_CSV_COLUMN_MAPPING, string>>;

export class CsvProductIngestionAdapter implements ProductIngestionAdapter {
  readonly sourceType = "csv" as const;
  readonly provider: string;
  private readonly columnMapping: CsvColumnMapping;

  constructor(provider: string, columnMapping: CsvColumnMapping = {}) {
    this.provider = provider;
    this.columnMapping = columnMapping;
  }

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    const text = decodeText(input.body);
    assertFileSize(text);
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("CSV input is empty.");
    if (rows.length - 1 > INGESTION_LIMITS.maxRecordsPerBatch) {
      throw new Error(`CSV exceeds the batch limit of ${INGESTION_LIMITS.maxRecordsPerBatch} records.`);
    }

    const headers = rows[0].map((header) => header.trim());
    validateHeaders(headers);
    const mapping = { ...DEFAULT_CSV_COLUMN_MAPPING, ...this.columnMapping };
    for (const required of [mapping.productName, mapping.brandName]) {
      if (!headers.includes(required)) throw new Error(`CSV is missing required header: ${required}`);
    }

    const records: ParsedIngestionRecord[] = [];
    for (let index = 1; index < rows.length; index += 1) {
      const cells = rows[index];
      if (cells.every((cell) => !cell.trim())) continue;
      if (cells.length > headers.length) throw new Error(`CSV row ${index + 1} contains more fields than the header.`);
      const sourceRow = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      const formulaLikeFields = Object.entries(sourceRow)
        .filter(([, value]) => FORMULA_PREFIXES.some((prefix) => value.trimStart().startsWith(prefix)))
        .map(([field]) => field);
      const canonical = buildCanonicalCsvObject(sourceRow, mapping);
      const product = rawProductFromObject({ ...canonical, raw_csv_row: sourceRow, sourceMetadata: { formulaLikeFields } });
      product.rawPayload = sourceRow;
      product.sourceMetadata = { formulaLikeFields };
      assertCollectionLimits(product);
      records.push({ product, rowNumber: index + 1 });
    }
    return records;
  }
}

export function parseCsv(text: string) {
  return parseDelimited(text, ",");
}

export function parseDelimited(text: string, delimiter: "," | "\t") {
  if (text.includes("\0")) throw new Error("CSV contains a null byte.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length) throw new Error("CSV contains a quote inside an unquoted field.");
      quoted = true;
    } else if (character === delimiter) {
      pushField();
    } else if (character === "\n") {
      pushField();
      rows.push(row);
      row = [];
    } else if (character !== "\r") {
      field += character;
    }
    if (field.length > INGESTION_LIMITS.maxFieldBytes) {
      throw new Error(`CSV field exceeds ${INGESTION_LIMITS.maxFieldBytes} characters.`);
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length || row.length) {
    pushField();
    rows.push(row);
  }
  return rows;

  function pushField() {
    row.push(field);
    field = "";
  }
}

function buildCanonicalCsvObject(
  row: Record<string, string>,
  mapping: Record<keyof typeof DEFAULT_CSV_COLUMN_MAPPING, string>,
) {
  const value = (key: keyof typeof DEFAULT_CSV_COLUMN_MAPPING) => row[mapping[key]] || "";
  const variants = parseJsonArray(value("variants"), "variants");
  const offers = parseJsonArray(value("offers"), "offers");
  const imageUrls = splitList(value("imageUrls"));
  if (!variants.length && (value("sizeText") || value("gtin"))) {
    variants.push({ gtin: value("gtin"), name: value("sizeText") || "Default", size: value("sizeText") });
  }
  if (!offers.length && (value("destinationUrl") || value("retailerName") || value("priceAmount"))) {
    offers.push({
      affiliateUrl: value("affiliateUrl"),
      availability: value("availability"),
      countryCode: splitList(value("countryCodes"))[0] || "",
      currencyCode: value("currencyCode"),
      destinationUrl: value("destinationUrl"),
      externalProductId: value("retailerExternalId"),
      priceAmount: value("priceAmount"),
      retailerName: value("retailerName"),
    });
  }
  return {
    affiliateUrl: value("affiliateUrl"),
    brandName: value("brandName"),
    categoryName: value("categoryName"),
    countryCodes: splitList(value("countryCodes")),
    currencyCode: value("currencyCode"),
    description: value("description"),
    directions: splitList(value("directions")),
    externalId: value("externalId"),
    gtin: value("gtin"),
    images: imageUrls.map((imageUrl, index) => ({ imageUrl, isPrimary: index === 0 })),
    ingredients: splitList(value("ingredients")),
    manufacturerProductCode: value("manufacturerProductCode"),
    offers,
    productName: value("productName"),
    productType: value("productType"),
    shortDescription: value("shortDescription"),
    sourceUrl: value("sourceUrl"),
    speciesCodes: splitList(value("speciesCodes")),
    subcategoryName: value("subcategoryName"),
    variants,
    warnings: splitList(value("warnings")),
  };
}

function parseJsonArray(value: string, field: string): Record<string, unknown>[] {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new Error();
    }
    return parsed as Record<string, unknown>[];
  } catch {
    throw new Error(`CSV ${field} must contain a JSON array of objects.`);
  }
}

function splitList(value: string) {
  return value.split(/[|;]+/).map((item) => item.trim()).filter(Boolean);
}

function validateHeaders(headers: string[]) {
  if (!headers.length || headers.every((header) => !header)) throw new Error("CSV header is empty.");
  if (headers.some((header) => !header)) throw new Error("CSV contains a blank header.");
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error("CSV contains duplicate headers.");
  }
}

function decodeText(body: ProductIngestionAdapterInput["body"]) {
  if (typeof body === "string") return body.replace(/^\uFEFF/, "");
  if (body instanceof Uint8Array) return new TextDecoder("utf-8", { fatal: true }).decode(body).replace(/^\uFEFF/, "");
  throw new Error("CSV input must be UTF-8 text.");
}

function assertFileSize(text: string) {
  if (new TextEncoder().encode(text).byteLength > INGESTION_LIMITS.maxFileBytes) {
    throw new Error(`CSV exceeds the ${INGESTION_LIMITS.maxFileBytes}-byte file limit.`);
  }
}
