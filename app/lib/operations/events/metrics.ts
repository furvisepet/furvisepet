import type { OperationalEventType, OperationalSeverity } from "./types";
export interface OperationalMetrics { record(input: { eventType: OperationalEventType; severity: OperationalSeverity }): void | Promise<void> }
export const noopOperationalMetrics: OperationalMetrics = { record() {} };
