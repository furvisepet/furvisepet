import { observeCalculation } from "./calculation-observation.mjs";
import { isRecordedOperand, isRecordedAnchorOperand, rebindCalculatePlan, type CalculateOperator, type CalculatePlan } from "../furvise-brain/calculate-plan.ts";
import type { ReadTicket } from "../furvise-brain/read-ticket.ts";
import { publicV1AskCapability, type PublicV1AskCapabilityDecision, PUBLIC_V1_CAPABILITIES, PUBLIC_V1_CALCULATION_LIMITATION } from "../public-v1-capabilities.ts";

export const PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze(
 PUBLIC_V1_CAPABILITIES.calculationExecution
  ? ["sum", "mean", "absolute_difference", "convert", "count_records"]
  : [],
);
export const PUBLIC_V1_UNSUPPORTED_CALCULATION_OPERATORS: readonly CalculateOperator[] = Object.freeze(
 PUBLIC_V1_CAPABILITIES.calculationExecution
  ? ["difference", "ratio", "percent_change", "elapsed_days", "percent_of_sum"]
  : ["difference", "absolute_difference", "ratio", "percent_change", "percent_of_sum", "sum", "mean", "count_records", "elapsed_days", "convert"],
);
export const CALCULATION_CAPABILITY_UNSUPPORTED = "unsupported_public_v1";
export const CALCULATION_CAPABILITY_LIMITATION = PUBLIC_V1_CALCULATION_LIMITATION;

/** Product availability follows trusted typed semantics, never the user's words.
 * The algebra remains intact. One unavailable node withholds the entire plan. */
export function calculationCapability(plan: CalculatePlan, ticket: ReadTicket | null, ownerId?: string) {
 const bound = rebindCalculatePlan(plan, ticket);
 const recordedPreview = !!ownerId && process.env.VERCEL_ENV === "preview"
  && process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE === "1"
  && process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID === ownerId
  && ticket?.authority === "stored_report" && bound.calculations.length === 1
  && bound.calculations[0].operator === "difference" && bound.calculations[0].operands.every(isRecordedOperand)
  && (!ticket.predicates.some(p=>p.kind==="measurement")||process.env.FURVISE_PREVIEW_RECORDED_MEASUREMENT==="1")
  && (!bound.calculations[0].operands.some(o=>isRecordedOperand(o)&&isRecordedAnchorOperand(o))||process.env.FURVISE_PREVIEW_RECORDED_ANCHOR==="1");
 const unsupportedOperators = [...new Set(bound.calculations
  .filter(node => !recordedPreview && !PUBLIC_V1_SUPPORTED_CALCULATION_OPERATORS.includes(node.operator))
  .map(node => node.operator))];
 observeCalculation("policy",unsupportedOperators.length?"policy_disabled":"supported",bound,{
  ownerPresent:!!ownerId,ownerMatches:!!ownerId&&process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE_OWNER_ID===ownerId,
  preview:process.env.VERCEL_ENV==="preview",differenceEnabled:process.env.FURVISE_PREVIEW_RECORDED_DIFFERENCE==="1",
  anchorEnabled:process.env.FURVISE_PREVIEW_RECORDED_ANCHOR==="1",storedReport:ticket?.authority==="stored_report",
  singleDifference:bound.calculations.length===1&&bound.calculations[0].operator==="difference",
  allRecorded:bound.calculations.every(c=>c.operands.every(isRecordedOperand)),needsAnchor:bound.calculations.some(c=>c.operands.some(o=>isRecordedOperand(o)&&isRecordedAnchorOperand(o)))
 },unsupportedOperators.length===0);
 return Object.freeze({ supported: unsupportedOperators.length === 0,
  reason: unsupportedOperators.length ? CALCULATION_CAPABILITY_UNSUPPORTED : "supported",
  unsupportedOperators: Object.freeze(unsupportedOperators) });
}

/** The authenticated route may opt this exact preview account into the existing
 * typed recorded-difference executor. Public/default/production policy is
 * unchanged; this decision issues no numeric proof or publication authority.
 * Call after original canonical validation with the server-authenticated owner. */
export function previewRecordedAskCapability(request: unknown, ownerId: string): PublicV1AskCapabilityDecision {
 const decision = publicV1AskCapability(request);
 if (decision.available || decision.reason !== "calculation") return decision;
 if (!request || typeof request !== "object" || Array.isArray(request)) return decision;
 const value = request as {calculatePlan?: CalculatePlan; readTicket?: ReadTicket | null};
 if (!value.calculatePlan || !value.readTicket) return decision;
 try {
  return calculationCapability(value.calculatePlan, value.readTicket, ownerId).supported
   ? Object.freeze({available:true as const, reason:"supported" as const}) : decision;
 } catch { return decision; }
}
