import { explicitHistoryDays } from "./explicit-history-dates.ts";
import { explicitHistoryMonths, requestsPastPresentComparison } from "./literal-history-window.ts";
export type EvidenceNeedWindow = { from: string; to: string };
/** Only a single explicit calendar label in a validated USER quote supplies a
 * local interval. Ambiguous/open comparisons retain the planner's wider scope. */
export function evidenceNeedWindow(quote: string): EvidenceNeedWindow | undefined {
  if (!/\b(?:19|20)\d{2}\b/.test(quote)
    || /\b(?:before|after|since|until|between|as of|earlier|later|this year|last year|next year)\b/i.test(quote)
    || requestsPastPresentComparison(quote)) return;
  const days = [...new Set([...explicitHistoryDays(quote, new Date().getUTCFullYear(), 8),
    ...(quote.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])])];
  const labels = [...days, ...explicitHistoryMonths(quote)];
  if (labels.length !== 1) return;
  const label = labels[0], start = label.length === 7 ? label + "-01" : label;
  if (!Number.isFinite(Date.parse(start)) || new Date(start).toISOString().slice(0,10) !== start) return;
  return { from: new Date(start).toISOString(), to: label.length === 7
    ? new Date(Date.UTC(Number(label.slice(0,4)),Number(label.slice(5,7)),1)).toISOString()
    : new Date(Date.parse(start)+86400000).toISOString() };
}
export function withinEvidenceNeedWindow(occurredAt: string | null | undefined, window?: EvidenceNeedWindow) {
  if (!window) return true;
  const time = occurredAt ? Date.parse(occurredAt) : NaN;
  return Number.isFinite(time) && time >= Date.parse(window.from) && time < Date.parse(window.to);
}
