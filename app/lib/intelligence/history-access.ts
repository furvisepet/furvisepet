import type { FurviseLiveContext } from "./types.ts";
import type { PlanId } from "../billing/plan-limits.ts";

/** Server-derived access to dated Ask context. Profiles and owner preferences
 * are current account data; this window limits saved pet history, not storage. */
export type AskHistoryAccess = { months: 3 | 60; from: string; to: string };
export function resolveAskHistoryAccess(plan: PlanId, now = new Date()): AskHistoryAccess {
  if (plan !== "free" && plan !== "plus" || !Number.isFinite(now.getTime())) throw new Error("INVALID_HISTORY_ACCESS");
  const months = plan === "plus" ? 60 : 3;
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return { months, from: first.toISOString(), to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString() };
}
export function historyDateAccessible(date: string | null | undefined, access?: AskHistoryAccess): boolean {
  if (!access) return true;
  const time = Date.parse(date || "");
  return Number.isFinite(time) && time >= Date.parse(access.from) && time < Date.parse(access.to);
}
export function clipHistoryPlan<T extends { from: string | null; to: string | null }>(plan: T, access?: AskHistoryAccess): T {
  if (!access) return plan;
  const instant = (value: string) => {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) throw new Error("INVALID_HISTORY_ACCESS_DATE");
    return time;
  };
  const lower = instant(access.from), upper = instant(access.to);
  if (lower >= upper) throw new Error("INVALID_HISTORY_ACCESS");
  const from = plan.from ? Math.max(instant(plan.from), lower) : lower;
  const to = plan.to ? Math.min(instant(plan.to), upper) : upper;
  if (from >= to) {
    const boundary = plan.to && instant(plan.to) <= lower ? access.from : access.to;
    return { ...plan, from: boundary, to: boundary };
  }
  return { ...plan, from: from === lower ? access.from : plan.from, to: to === upper ? access.to : plan.to };
}

/** Apply again immediately before generation so retrieval, references, or an
 * alternate-pet context cannot reintroduce excluded historical projections. */
export function enforceAskHistoryAccess(context: FurviseLiveContext): FurviseLiveContext {
  const access = context.historyAccess;
  if (!access) return context;
  const allowed = (date: string | null | undefined) => historyDateAccessible(date, access);
  const care = <T extends { occurred_at: string }>(rows: T[]) => rows.filter(row => allowed(row.occurred_at));
  const episodes = <T extends { started_at: string | null }>(rows: T[]) => rows.filter(row => allowed(row.started_at));
  const interpretation = context.askInterpretation;
  const state = context.currentState?.state;
  const semanticStates = Object.fromEntries(Object.entries(state?.semanticStates || {}).filter(([, value]) => allowed(value.lastObservedAt)));
  const currentMedications = state?.currentMedications?.filter(value => allowed(value.startedAt));
  const filteredState = state ? {
    ...Object.fromEntries((["breathing", "energy", "appetite", "currentFood"] as const)
      .flatMap(key => state[key] && allowed(state[key].lastObservedAt) ? [[key, state[key]]] : [])),
    semanticStates, ...(currentMedications?.length ? { currentMedications } : {}),
  } : null;
  return { ...context,
    askInterpretation: interpretation?.history ? { ...interpretation, history: clipHistoryPlan(interpretation.history, access) } : interpretation,
    careEntries: care(context.careEntries), selectedCareEntries: care(context.selectedCareEntries),
    activeConcerns: context.activeConcerns.filter(row => allowed(row.opened_at)),
    recentlyResolvedConcerns: context.recentlyResolvedConcerns.filter(row => allowed(row.opened_at)),
    activeEpisodes: episodes(context.activeEpisodes), monitoringEpisodes: episodes(context.monitoringEpisodes),
    recentlyResolvedEpisodes: episodes(context.recentlyResolvedEpisodes),
    currentState: context.currentState && filteredState ? { ...context.currentState, state: filteredState } : null,
    legacyPetMemories: context.legacyPetMemories.filter(row => allowed(row.created_at)),
    memories: context.memories.filter(row => row.subject_type === "owner" || allowed(row.observed_at || row.first_observed_at)),
    conversationTurns: context.conversationTurns.filter(row => allowed(row.createdAt)),
    episodePresentation: undefined,
    ...(context.askHistory ? { askHistory: { ...context.askHistory, entries: care(context.askHistory.entries), originals: care(context.askHistory.originals) } } : {}),
  };
}

/** The episode database accepts paired bounds or an unbounded interval. The request date
 * domain is 1900–2100; subscription scope is intersected before this boundary. */
export function boundedEpisodePlan<T extends { from: string | null; to: string | null }>(plan: T, access?: AskHistoryAccess): T {
  const clipped = clipHistoryPlan(plan, access);
  if (clipped.from === null && clipped.to === null) return clipped;
  return { ...clipped, from: clipped.from || "1900-01-01T00:00:00.000Z", to: clipped.to || "2100-01-01T00:00:00.000Z" };
}
