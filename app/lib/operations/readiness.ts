export const REQUIRED_CORE_MIGRATION = "20260818084249";

export function requiredSchemaIsReady(input: {
  billingAccountsError: unknown;
  deletionTombstonesError: unknown;
  latestMigration: unknown;
}) {
  return !input.billingAccountsError
    && !input.deletionTombstonesError
    && typeof input.latestMigration === "string"
    && /^\d{14}$/.test(input.latestMigration)
    && input.latestMigration >= REQUIRED_CORE_MIGRATION;
}
