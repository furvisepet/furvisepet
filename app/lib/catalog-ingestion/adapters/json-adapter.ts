import { INGESTION_LIMITS } from "../constants.ts";
import { assertCollectionLimits, isRecord, rawProductFromObject } from "../schemas.ts";
import type {
  ParsedIngestionRecord,
  ProductIngestionAdapter,
  ProductIngestionAdapterInput,
} from "../types";

export class JsonProductIngestionAdapter implements ProductIngestionAdapter {
  readonly sourceType = "json" as const;
  readonly provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    const parsed = parseJsonBody(input.body);
    const products = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.products)
        ? parsed.products
        : null;
    if (!products) throw new Error("JSON must be an array of products or an object with a products array.");
    if (products.length > INGESTION_LIMITS.maxRecordsPerBatch) {
      throw new Error(`JSON exceeds the batch limit of ${INGESTION_LIMITS.maxRecordsPerBatch} records.`);
    }
    return products.map((value, index) => {
      try {
        const product = rawProductFromObject(value);
        assertCollectionLimits(product);
        return { product, rowNumber: index + 1 };
      } catch (error) {
        throw new Error(`Invalid JSON product at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}

function parseJsonBody(body: ProductIngestionAdapterInput["body"]) {
  if (typeof body !== "string" && !(body instanceof Uint8Array)) {
    return structuredClone(body);
  }
  const text = typeof body === "string" ? body : new TextDecoder("utf-8", { fatal: true }).decode(body);
  if (new TextEncoder().encode(text).byteLength > INGESTION_LIMITS.maxFileBytes) {
    throw new Error(`JSON exceeds the ${INGESTION_LIMITS.maxFileBytes}-byte file limit.`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("JSON is malformed.");
  }
}
