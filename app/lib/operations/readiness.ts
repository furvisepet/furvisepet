export const SECURITY_SCHEMA_CONTRACT_VERSION = 1;

// This is an application compatibility contract, not a chronological floor.
// Add only migrations whose authority boundary is required by this app version.
export const REQUIRED_SECURITY_MIGRATIONS = [
  "20260818084249", // Production operations/readiness primitives.
  "20260818194748", // AI credit state machine and service-only settlement.
  "20260819033443", // Immutable AI settlement disposition.
  "20260820010000", // Canonical memory semantic integrity.
  "20260820070956", // Server-authored action capabilities.
  "20260821021825", // Entitlement and pet-data boundaries.
  "20260821050646", // Permanent-delete service-role authority.
  "20260823062212", // Canonical Ask memory persistence authority.
  "20260823120000", // Exact action targets, freshness, and expiry.
  "20260823120001", // Controlled Care History update boundary.
  "20260823120002", // Restricted browser Care History writes.
] as const;

export type SecurityCompatibilitySnapshot = {
  contract_version?: unknown;
  failed_checks?: unknown;
};

export function schemaReadinessFailures(input: {
  billingAccountsError: unknown;
  deletionTombstonesError: unknown;
  latestMigration: unknown;
  securityCompatibility: SecurityCompatibilitySnapshot | null | undefined;
  securityCompatibilityError: unknown;
}) {
  const failures: string[] = [];
  if (input.billingAccountsError) failures.push("billing_accounts_unavailable");
  if (input.deletionTombstonesError) failures.push("deletion_tombstones_unavailable");
  if (typeof input.latestMigration !== "string" || !/^\d{14}$/.test(input.latestMigration)) {
    failures.push("migration_history_unavailable");
  }
  if (input.securityCompatibilityError) failures.push("compatibility_query_failed");

  const snapshot = input.securityCompatibility;
  if (!snapshot || snapshot.contract_version !== SECURITY_SCHEMA_CONTRACT_VERSION || !Array.isArray(snapshot.failed_checks)) {
    failures.push("compatibility_contract_invalid");
  } else {
    for (const failure of snapshot.failed_checks) {
      failures.push(typeof failure === "string" && /^[a-z0-9_:-]{1,80}$/.test(failure) ? failure : "compatibility_result_invalid");
    }
  }
  return [...new Set(failures)];
}

export function requiredSchemaIsReady(input: {
  billingAccountsError: unknown;
  deletionTombstonesError: unknown;
  latestMigration: unknown;
  securityCompatibility: SecurityCompatibilitySnapshot | null | undefined;
  securityCompatibilityError: unknown;
}) {
  return schemaReadinessFailures(input).length === 0;
}
