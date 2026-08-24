export const SECURITY_SCHEMA_CONTRACT_VERSION = 2;

// Stable migration names are used instead of timestamp versions because the
// deployment API may assign its own ledger version while preserving the
// migration name. Effective authority is still verified semantically by the
// database compatibility contract.
export const REQUIRED_SECURITY_MIGRATION_NAMES = [
  "add_pet_profile_lifecycle_v1",
  "secure_ai_credit_state_machine",
  "enforce_ai_credit_settlement_disposition",
  "enforce_furvise_memory_semantic_integrity",
  "server_authored_ask_action_capabilities",
  "harden_entitlement_and_pet_data_boundaries",
  "repair_permanent_pet_delete_admin_role",
  "authorize_ask_memory_persistence",
  "harden_ask_action_capability_targets_freshness_expiry",
  "add_controlled_care_entry_update_boundary",
  "restrict_authenticated_care_entry_writes",
  "prepare_canonical_care_state_authority",
  "enforce_canonical_care_state_authority",
  "security_compatibility_contract_v2",
  "harden_security_compatibility_contract_v2",
  "harden_security_compatibility_protected_authority_families",
  "add_billing_checkout_single_flight",
  "harden_billing_checkout_single_flight_readiness",
  "align_billing_checkout_currency_authority",
  "add_billing_payment_recovery_grace",
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
      failures.push(typeof failure === "string" && /^[a-z0-9_:-]{1,96}$/.test(failure) ? failure : "compatibility_result_invalid");
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
