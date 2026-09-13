import type { SemanticTemporalContext } from "../../semantic-frame/types.ts";
import type { NormalizedTemporalSemantics } from "../types.ts";

export function normalizeTemporalSemanticsV2(temporal: SemanticTemporalContext): NormalizedTemporalSemantics | null {
  const occurredAt = normalizedInstant(temporal.occurredAt);
  const validFrom = normalizedInstant(temporal.validFrom);
  const validTo = normalizedInstant(temporal.validTo);
  if ((temporal.occurredAt && !occurredAt) || (temporal.validFrom && !validFrom) || (temporal.validTo && !validTo)) return null;
  if (validFrom && validTo && validTo < validFrom) return null;
  return { occurredAt, validFrom, validTo, precision: temporal.precision };
}

function normalizedInstant(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : null;
}

