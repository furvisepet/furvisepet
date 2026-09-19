import { createHash } from "node:crypto";
export type CheckStatus = "passed" | "failed" | "not_applicable" | "not_evaluated";
export type CompletionChecks = {
  structuralValidity: CheckStatus; evidenceSupport: CheckStatus; subjectDateCorrectness: CheckStatus;
  calculationCorrectness: CheckStatus; taskCompletion: CheckStatus;
};
type CompleteChecks = { [K in keyof CompletionChecks]: "passed" | "not_applicable" } & { structuralValidity: "passed"; taskCompletion: "passed" };
type Binding = { version: "answer-assessment.v1"; bodyHash: string; evidenceHash: string; reasons: string[] };
export type AnswerAssessment = Binding & (
  { outcome: "complete"; checks: CompleteChecks } |
  { outcome: "limited" | "failed"; checks: CompletionChecks }
);
const keys = ["structuralValidity", "evidenceSupport", "subjectDateCorrectness", "calculationCorrectness", "taskCompletion"] as const;
const statuses: readonly string[] = ["passed", "failed", "not_applicable", "not_evaluated"];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");
/** Outcome is derived by the server; model/JSON outcome fields confer no authority.
 * Delivery and persistence are separate route/client responsibilities. */
export function createAnswerAssessment(input: { checks: CompletionChecks; body: unknown; evidence: unknown; reasons?: string[]; unsafe?: boolean }): AnswerAssessment {
  if (!input.checks || Object.keys(input.checks).sort().join() !== [...keys].sort().join()
    || keys.some(key => !statuses.includes(input.checks[key]))) throw new Error("INVALID_COMPLETION_CHECKS");
  const checks = { ...input.checks };
  const binding: Binding = { version: "answer-assessment.v1", bodyHash: hash(input.body), evidenceHash: hash(input.evidence),
    reasons: [...new Set(input.reasons || [])] };
  if (input.unsafe || checks.structuralValidity === "failed" || checks.evidenceSupport === "failed"
    || checks.subjectDateCorrectness === "failed" || checks.calculationCorrectness === "failed")
    return { ...binding, outcome: "failed", checks };
  if (checks.structuralValidity === "passed" && checks.taskCompletion === "passed"
    && keys.every(key => checks[key] === "passed" || checks[key] === "not_applicable"))
    return { ...binding, outcome: "complete", checks: checks as CompleteChecks };
  return { ...binding, outcome: "limited", checks };
}
/** Diagnostics from persisted JSON are not reusable approval capabilities. */
export function assessmentMatches(assessment: AnswerAssessment, body: unknown, evidence: unknown) {
  return assessment.bodyHash === hash(body) && assessment.evidenceHash === hash(evidence);
}

/** Readiness keeps a freshly reviewed execution plan alive until its write.
 * It is not a success receipt; completion still depends on actual persistence. */
export function reviewedTaskReadyForExecution(completion: readonly { index: number; status: string }[], checks?: CompletionChecks): boolean {
  const whole = completion.find(item => item.index === 0);
  return !!whole && ["answered", "action_ready"].includes(whole.status)
    && completion.some(item => item.status === "action_ready")
    && completion.every(item => ["answered", "action_ready", "refused", "not_requested"].includes(item.status))
    && !!checks && checks.structuralValidity === "passed"
    && [checks.evidenceSupport, checks.subjectDateCorrectness, checks.calculationCorrectness]
      .every(status => status === "passed" || status === "not_applicable");
}
