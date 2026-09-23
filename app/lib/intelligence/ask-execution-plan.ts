import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { governCanonicalEvents } from "./semantic-events.ts";

export type GovernedAskExecutionPlan = {
  version: "ask-execution.v1"; sourceMessageId: string; petId: string;
  careActions: AskReasoningResult["careActions"];
  semanticEvents: ReturnType<typeof governCanonicalEvents>["accepted"];
  learnings: AskReasoningResult["learnings"];
};
/** Legacy model/shadow recovery signals cannot request concern-state persistence. */
export function withoutLegacyConcernTransitions<T extends { careActions: AskReasoningResult["careActions"];
  semanticEvents: ReturnType<typeof governCanonicalEvents>["accepted"] }>(input: T) {
  return { careActions: input.careActions.filter(a => !["resolve_concern", "reopen_concern"].includes(a.action)
      && String(a.severity) !== "resolved"),
    semanticEvents: input.semanticEvents.filter(({ event }) => event.transition !== "resolved"
      && event.state !== "resolved" && !event.references.concernId && !event.references.episodeId) };
}
const issuedExecutionPlans = new WeakMap<GovernedAskExecutionPlan, string>();
export function assertGovernedAskExecutionPlan(plan: GovernedAskExecutionPlan) {
  if (issuedExecutionPlans.get(plan) !== JSON.stringify(plan)) throw new Error("ASK_EXECUTION_PLAN_CHANGED");
}

/** Normalize compatibility channels before review. Persistence consumes this
 * exact plan, rather than choosing a different winner after approval. */
export function buildGovernedAskExecutionPlan(input: Omit<GovernedAskExecutionPlan, "version">): GovernedAskExecutionPlan {
  const authorized = withoutLegacyConcernTransitions(input);
  const events = authorized.semanticEvents.filter(item => item.destinations.some(d => ["care_event", "episode_current_state", "state_only"].includes(d)));
  const seenPets = new Set<string>();
  const executableEvents = events.filter(item => {
    const id = item.event.subject.id || input.petId;
    if (seenPets.has(id)) return false;
    seenPets.add(id); return true;
  });
  const plan: GovernedAskExecutionPlan = structuredClone({ version: "ask-execution.v1", sourceMessageId: input.sourceMessageId, petId: input.petId,
    careActions: events.length ? [] : authorized.careActions.slice(0, 1),
    semanticEvents: executableEvents, learnings: input.learnings });
  issuedExecutionPlans.set(plan, JSON.stringify(plan));
  return plan;
}

