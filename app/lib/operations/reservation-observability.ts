import { unavailableOwnerReservations, type OwnerReservationSnapshot } from "../ai/usage-guard/owner-reservation-observation";
/** SQL projections never replace owner-scoped current guard observations. */
export function reservationObservability(days: number, now = new Date(), live: OwnerReservationSnapshot = unavailableOwnerReservations("not_observed", now)) {
  return {
    observedAt: now.toISOString(),
    scope: "existing_owner_dashboard_selected_SQL_window" as const,
    windowDays: days,
    sqlProjection: { backingStore: "Postgres_owner_dashboard_snapshot", completeness: "best_effort_telemetry_not_invoice",
      stale: "may_lag_live_guard", unresolvedUsage: "costs.unreconciled_and_costs.pendingReserved_are_unsettled_projection_only" },
    liveProviderReservations: live,
    allClear: null, reconciliationPerformed: false,
  };
}
export type ReservationObservability = ReturnType<typeof reservationObservability>;
