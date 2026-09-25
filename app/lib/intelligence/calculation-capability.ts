import { rebindCalculatePlan, type CalculateOperator, type CalculatePlan } from "../furvise-brain/calculate-plan.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";

export const PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze([
 "sum", "mean", "absolute_difference", "convert", "count_records",
]);
export const PUBLIC_V1_UNSUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze([
 "difference", "ratio", "percent_change", "elapsed_days", "percent_of_sum",
]);
export const CALCULATION_CAPABILITY_UNSUPPORTED = "unsupported_public_v1";
export const CALCULATION_CAPABILITY_LIMITATION = "Furvise cannot perform this type of calculation yet.";

/** Product availability follows trusted typed semantics, never the user's words.
 * The algebra remains intact. One unavailable node withholds the entire plan. */
export function calculationCapability(plan: CalculatePlan, ticket: ReadTicket) {
 const bound = rebindCalculatePlan(plan, ticket);
 const unsupportedOperators = [...new Set(bound.calculations
  .filter(node => !PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS.includes(node.operator))
  .map(node => node.operator))];
 return Object.freeze({ supported: unsupportedOperators.length === 0,
  reason: unsupportedOperators.length ? CALCULATION_CAPABILITY_UNSUPPORTED : "supported",
  unsupportedOperators: Object.freeze(unsupportedOperators) });
}
