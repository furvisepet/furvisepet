import { CALCULATE_OPERATORS, rebindCalculatePlan, type CalculateOperator, type CalculatePlan } from "../furvise-brain/calculate-plan.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import { PUBLIC_V1_CAPABILITIES, PUBLIC_V1_CALCULATION_LIMITATION } from "../public-v1-capabilities.ts";

export const PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze(
 PUBLIC_V1_CAPABILITIES.calculationExecution ? [...CALCULATE_OPERATORS] : [],
);
export const PUBLIC_V1_UNSUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze(
 PUBLIC_V1_CAPABILITIES.calculationExecution ? [] : [...CALCULATE_OPERATORS],
);
export const CALCULATION_CAPABILITY_UNSUPPORTED = "unsupported_public_v1";
export const CALCULATION_CAPABILITY_LIMITATION = PUBLIC_V1_CALCULATION_LIMITATION;

/** Product availability follows trusted typed semantics, never the user's words.
 * The algebra remains intact. One unavailable node withholds the entire plan. */
export function calculationCapability(plan: CalculatePlan, ticket: ReadTicket | null) {
 const bound = rebindCalculatePlan(plan, ticket);
 const unsupportedOperators = [...new Set(bound.calculations
  .filter(node => !PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS.includes(node.operator))
  .map(node => node.operator))];
 return Object.freeze({ supported: unsupportedOperators.length === 0,
  reason: unsupportedOperators.length ? CALCULATION_CAPABILITY_UNSUPPORTED : "supported",
  unsupportedOperators: Object.freeze(unsupportedOperators) });
}
