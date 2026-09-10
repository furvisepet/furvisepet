import { explicitHistoryDays } from "./explicit-history-dates.ts";
type Window = { from: string | null; to: string | null };
export type HistoryReadStrategy = Window & { descending: boolean; lexical: boolean; terms: string[]; target?: string };
/** Date targets and ordering are independent. Targets narrow the authorized
 * window; they never expand access, synthesize facts or change query budgets. */
export function compileHistoryReadStrategies(question: string, year: number, window: Window, proposed: HistoryReadStrategy[], pageBudget: number) {
  const days = [...new Set([...explicitHistoryDays(question, year, 8), ...(question.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])])]
    .filter(day => Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day).sort();
  const targets = days.map(day => {
    const start = day + "T00:00:00.000Z", end = new Date(Date.parse(start) + 86400000).toISOString();
    return { target: day, from: window.from && window.from > start ? window.from : start,
      to: window.to && window.to < end ? window.to : end, descending: false, lexical: false, terms: [] as string[] };
  }).filter(target => target.from < target.to && (target.from !== window.from || target.to !== window.to));
  // Retain a global strategy even with many anchors. Excess targets are an
  // explicit coverage loss, never silently treated as an absent record.
  const reserved = targets.slice(0, Math.max(0, pageBudget - 1));
  const remaining = pageBudget - reserved.length;
  const broad = proposed.length <= remaining ? proposed
    : [...proposed].sort((a, b) => Number(b.descending) - Number(a.descending) || Number(b.lexical) - Number(a.lexical)).slice(0, remaining);
  return { strategies: [...reserved, ...broad], omittedTargets: targets.slice(reserved.length).map(t => t.target) };
}
