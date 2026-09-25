import { bindReadTicket, type ReadTicket } from "./read-ticket.ts";
import { bindCompositionalReadTicket } from "./read-selection.ts";

/** Bind unbound typed ticket variants using caller-authorized subjects and need provenance.
 * Used for both initial proposals and trusted tickets re-entering after JSON transport.
 * The selected binder retains all validation; this boundary does not resolve ownership.
 */
export function bindTypedReadTicket(value: unknown, petIds: readonly string[],
  bindings: Parameters<typeof bindReadTicket>[2] = []): ReadTicket | null {
  if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "selection")) {
    const { selection, ...read } = value as Record<string, unknown>;
    return selection === null ? bindReadTicket(read, petIds, bindings) : bindCompositionalReadTicket(value, petIds);
  }
  return bindReadTicket(value, petIds, bindings);
}
