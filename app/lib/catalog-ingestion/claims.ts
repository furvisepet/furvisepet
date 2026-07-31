import type { ClaimFlag, NormalizedIngestionProduct } from "./types";

const CLAIM_PATTERNS = [
  ["cure", /\bcures?\b/i],
  ["treat", /\btreats?\b/i],
  ["prevent", /\bprevents?\b/i],
  ["guaranteed", /\bguaranteed\b/i],
  ["vet_approved", /\bvet(?:erinarian)? approved\b/i],
  ["vet_recommended", /\b(?:vet|veterinarian)[ -]recommended\b/i],
  ["clinically_proven", /\bclinically proven\b/i],
  ["prescription", /\bprescription\b/i],
  ["medicated", /\bmedicated\b/i],
  ["therapeutic", /\btherapeutic\b/i],
  ["hypoallergenic", /\bhypoallergenic\b/i],
  ["safe_for_all_pets", /\bsafe for all pets\b/i],
] as const;

export function detectClaimFlags(product: NormalizedIngestionProduct): ClaimFlag[] {
  const fields: [string, string][] = [
    ["productName", product.productName],
    ["shortDescription", product.shortDescription || ""],
    ["description", product.description || ""],
    ...product.directions.map((value, index) => [`directions[${index}]`, value] as [string, string]),
    ...product.warnings.map((value, index) => [`warnings[${index}]`, value] as [string, string]),
  ];
  const flags: ClaimFlag[] = [];
  for (const [field, value] of fields) {
    for (const [claimType, pattern] of CLAIM_PATTERNS) {
      const match = value.match(pattern);
      if (!match) continue;
      flags.push({
        claimType,
        publishDecision: "pending",
        reviewStatus: "pending",
        reviewerNote: null,
        sourceClaim: match[0],
        sourceField: field,
        sourceLocation: product.sourceUrl || "source record",
      });
    }
  }
  return flags;
}

