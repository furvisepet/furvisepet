import { classifyActiveConcernMessage } from "../ai/turn-classifier.ts";
import { detectAskConcernTags } from "../ask-safety-context.ts";
import type { FurviseLiveContext, IntelligenceSafetyLevel } from "./types";
import { deriveConcernChronology } from "./concern-chronology.ts";

export type ResolvedSafetyState = {
  level: IntelligenceSafetyLevel;
  activeConcernIds: string[];
  recentlyResolvedConcernIds: string[];
  concernMessageState: ReturnType<typeof classifyActiveConcernMessage>;
  currentMessageConcernTags: ReturnType<typeof detectAskConcernTags>;
  currentMessageEmergency: boolean;
  shoppingSuppressed: boolean;
};

export function resolveSafetyState(context: FurviseLiveContext): ResolvedSafetyState {
  const immediateTags = detectAskConcernTags(context.currentMessage);
  const messageState = classifyActiveConcernMessage(
    context.currentMessage,
    context.activeConcerns.length > 0 || context.recentlyResolvedConcerns.length > 0,
  );
  const immediateEmergency = /\b(collapse[ds]?|unconscious|open[- ]mouth breathing|cannot breathe|can't breathe|blue gums?|severe bleeding)\b/i.test(context.currentMessage);
  const chronology = deriveConcernChronology(context.careEntries, [...context.activeConcerns, ...context.recentlyResolvedConcerns]);
  const stateBreathing = context.currentState?.state.breathing?.status;
  let level: IntelligenceSafetyLevel = "routine";
  if (immediateEmergency) level = "emergency";
  else if (immediateTags.length || messageState === "worsening" || messageState === "recurrence") level = "urgent";
  else if (
    (messageState === "resolved" || messageState === "improved") &&
    (context.activeConcerns.length || context.recentlyResolvedConcerns.length)
  ) level = "recently_resolved";
  else if (stateBreathing === "abnormal") level = "urgent";
  else if (stateBreathing === "normal" && messageState !== "unrelated") level = "recently_resolved";
  else if ((context.activeEpisodes || []).some((episode) => episode.severity === "urgent")) level = "urgent";
  else if ((context.activeEpisodes || []).length || (context.monitoringEpisodes || []).length) level = "monitor";
  else if (chronology.state === "urgent") level = "urgent";
  else if (chronology.state === "recently_resolved" && messageState !== "unrelated") level = "recently_resolved";
  else if (context.activeConcerns.some((concern) => concern.severity === "urgent")) level = "urgent";
  else if (context.activeConcerns.length) level = "monitor";
  else if (context.recentlyResolvedConcerns.length && /\b(symptom|breath|tired|energy|normal|fine|better|again)\b/i.test(context.currentMessage)) level = "recently_resolved";
  return {
    level,
    activeConcernIds: [...new Set([...context.activeConcerns.map((concern) => concern.id), ...(chronology.state === "urgent" && chronology.concernId ? [chronology.concernId] : [])])],
    recentlyResolvedConcernIds: context.recentlyResolvedConcerns.map((concern) => concern.id),
    concernMessageState: messageState,
    currentMessageConcernTags: immediateTags,
    currentMessageEmergency: immediateEmergency,
    shoppingSuppressed: level === "urgent" || level === "emergency",
  };
}

export function allowsAcceptedRecoverySafetyReconciliation(safety: ResolvedSafetyState) {
  return !safety.currentMessageEmergency
    && safety.currentMessageConcernTags.length === 0
    && !["worsening", "recurrence", "still_active"].includes(safety.concernMessageState);
}

export function applySafetyFloor(modelLevel: IntelligenceSafetyLevel, deterministic: ResolvedSafetyState) {
  const rank: Record<IntelligenceSafetyLevel, number> = { routine: 0, recently_resolved: 1, monitor: 2, urgent: 3, emergency: 4 };
  return rank[modelLevel] < rank[deterministic.level] ? deterministic.level : modelLevel;
}
