export type OperationalEventType =
  | "application_error" | "authorization_denied" | "origin_denied" | "rate_limited"
  | "concurrency_denied" | "rate_store_unavailable" | "ai_admission_denied"
  | "ai_daily_cap_reached" | "ai_emergency_disabled" | "provider_failure"
  | "provider_usage_reconciliation_failure" | "credit_reservation_stale"
  | "idempotency_conflict" | "idempotency_reconciliation_required" | "auth_captcha_failure"
  | "auth_throttled" | "email_delivery_failure" | "account_deletion_started"
  | "password_recovery_authorized" | "password_recovery_completed" | "password_recovery_denied"
  | "account_password_change"
  | "account_deletion_completed" | "account_deletion_failed" | "data_export_started"
  | "data_export_completed" | "cleanup_failed" | "migration_mismatch";

export type OperationalSeverity = "info" | "warning" | "high" | "critical";

export type OperationalEvent = {
  actorId?: string; durationMs?: number; errorCode?: string; eventType: OperationalEventType;
  feature?: string; metadata?: Record<string, unknown>; operationId?: string; requestId: string;
  resourceId?: string; route?: string; severity: OperationalSeverity; timestamp?: string;
};

export interface OperationalEventAdapter { emit(event: Record<string, unknown>): void | Promise<void> }
