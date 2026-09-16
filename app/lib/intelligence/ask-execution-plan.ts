import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { DatedCareNote } from "./dated-note-batch.ts";
import type { governCanonicalEvents } from "./semantic-events.ts";

export type GovernedAskExecutionPlan = {
  version: "ask-execution.v1"; sourceMessageId: string; petId: string;
  noteBatch?: DatedCareNote[];
  careActions: AskReasoningResult["careActions"];
  semanticEvents: ReturnType<typeof governCanonicalEvents>["accepted"];
  learnings: AskReasoningResult["learnings"];
};
const issuedExecutionPlans = new WeakMap<GovernedAskExecutionPlan, string>();
export function assertGovernedAskExecutionPlan(plan: GovernedAskExecutionPlan) {
  if (issuedExecutionPlans.get(plan) !== JSON.stringify(plan)) throw new Error("ASK_EXECUTION_PLAN_CHANGED");
}

/** Normalize compatibility channels before review. Persistence consumes this
 * exact plan, rather than choosing a different winner after approval. */
export function buildGovernedAskExecutionPlan(input: Omit<GovernedAskExecutionPlan, "version">): GovernedAskExecutionPlan {
  const events = input.semanticEvents.filter(item => item.destinations.some(d => ["care_event", "episode_current_state", "state_only"].includes(d)));
  const seenPets = new Set<string>();
  const executableEvents = events.filter(item => {
    const id = item.event.subject.id || input.petId;
    if (seenPets.has(id)) return false;
    seenPets.add(id); return true;
  });
  const resolution = input.careActions.find(action => action.action === "resolve_concern" && action.relatedRecordId);
  const plan: GovernedAskExecutionPlan = structuredClone({ version: "ask-execution.v1", sourceMessageId: input.sourceMessageId, petId: input.petId,
    noteBatch: input.noteBatch || [],
    careActions: input.noteBatch?.length ? [] : resolution ? [resolution] : events.length ? [] : input.careActions.slice(0, 1),
    semanticEvents: input.noteBatch?.length || resolution ? [] : executableEvents, learnings: input.noteBatch?.length ? [] : input.learnings });
  issuedExecutionPlans.set(plan, JSON.stringify(plan));
  return plan;
}

