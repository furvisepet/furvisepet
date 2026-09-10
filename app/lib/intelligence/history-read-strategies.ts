import { explicitHistoryMonths } from "./literal-history-window.ts";
import type { EvidenceNeed } from "./evidence-needs.ts";
import { explicitHistoryDays } from "./explicit-history-dates.ts";
type Window = { from: string | null; to: string | null };
export type HistoryReadStrategy = Window & { descending: boolean; lexical: boolean; terms: string[]; target?: string; needId?: string };
/** Date targets and ordering are independent. Targets narrow the authorized
 * window; they never expand access, synthesize facts or change query budgets. */
export function compileHistoryReadStrategies(question: string, year: number, window: Window, proposed: HistoryReadStrategy[], pageBudget: number, needs: readonly EvidenceNeed[] = []) {
  const days = [...new Set([...explicitHistoryDays(question, year, 8), ...(question.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])])]
    .filter(day => Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day).sort();
  const anchors = [...days, ...explicitHistoryMonths(question)];
  const targets = anchors.map(day => {
    const start = day + (day.length === 7 ? "-01" : "") + "T00:00:00.000Z";
    const end = day.length === 7 ? new Date(Date.UTC(Number(day.slice(0,4)), Number(day.slice(5,7)), 1)).toISOString()
      : new Date(Date.parse(start) + 86400000).toISOString();
    return { target: day, from: window.from && window.from > start ? window.from : start,
      to: window.to && window.to < end ? window.to : end, descending: false, lexical: false, terms: [] as string[] };
  }).filter(target => target.from < target.to && (target.from !== window.from || target.to !== window.to));
  // Retain a global strategy even with many anchors. Excess targets are an
  // explicit coverage loss, never silently treated as an absent record.
  const facets: HistoryReadStrategy[] = needs.filter(need => need.terms.length).map(need => ({
    ...window, needId: need.id, descending: need.order === "earliest" ? false : need.order === "latest" ? true : proposed.some(strategy => strategy.descending), lexical: true, terms: need.terms,
  }));
  const specialized: HistoryReadStrategy[] = [];
  for (let index = 0; index < Math.max(targets.length, facets.length); index++) {
    if (targets[index]) specialized.push(targets[index]);
    if (facets[index]) specialized.push(facets[index]);
  }
  const reserved = specialized.slice(0, Math.max(0, pageBudget - 1));
  const omitted = specialized.slice(reserved.length);
  const remaining = pageBudget - reserved.length;
  const broad = proposed.length <= remaining ? [...proposed]
    : [...proposed].sort((a, b) => Number(b.descending) - Number(a.descending) || Number(b.lexical) - Number(a.lexical)).slice(0, remaining);
  if (needs.length && broad.length && broad.every(strategy => strategy.lexical)) {
    const periodContext = proposed.find(strategy => !strategy.lexical && strategy.descending) || proposed.find(strategy => !strategy.lexical);
    if (periodContext) broad[broad.length - 1] = periodContext;
  }
  return { strategies: [...reserved, ...broad], omittedTargets: omitted.flatMap(t => t.target ? [t.target] : []),
    omittedNeeds: omitted.flatMap(t => t.needId ? [t.needId] : []) };
}
