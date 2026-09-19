export function classifyRecoveryCallback({ redirectType, flowValues, handoffValues }) {
  const flow = flowValues.length === 1 ? flowValues[0] : null;
  const handoffId = handoffValues.length === 1 ? handoffValues[0] : "";
  const recoveryCandidate = redirectType === "recovery"
    || flowValues.includes("recovery")
    || handoffValues.length > 0;
  const handoffEligible = recoveryCandidate
    && (redirectType == null || redirectType === "recovery")
    && flowValues.length === 1
    && flow === "recovery"
    && handoffValues.length === 1;
  return { flow, handoffEligible, handoffId, recoveryCandidate };
}
