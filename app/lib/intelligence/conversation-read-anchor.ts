import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import { explicitHistoryDays } from "./explicit-history-dates.ts";
import { explicitHistoryMonths } from "./literal-history-window.ts";
import type { FurviseLiveContext } from "./types.ts";
type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;

/** Resolve an elliptical read from USER questions, never assistant values.
 * Anchors identify candidate records; they grant no factual/write authority. */
export function conversationReadAnchor(context: Context) {
  const text = context.currentMessage.trim();
  if (analyzeOwnerAssertions(text).hasOwnerAssertion
    || !/\b(?:that|those|these|same|their|then|later|earlier)\b|^(?:and|convert|compare)\b/i.test(text)
    || /\b(?:fictional|hypothetical|instead|new question|unrelated)\b/i.test(text)) return null;
  const followUp = (value: string) => /\b(?:that|those|these|same|their|then|later|earlier)\b|^(?:and|convert|compare)\b/i.test(value);
  const users = context.conversationTurns.filter(t => t.role === "user" && t.text !== context.currentMessage).slice(-8);
  const owned = context.eligiblePets.filter(p => p.user_id === context.owner.userId);
  const year = new Date().getUTCFullYear();
  const dates = (value: string) => [...explicitHistoryDays(value, year, 8), ...explicitHistoryMonths(value)];
  if (dates(text).length) return null;
  const selected = explicitlyNamedOwnedPets(text, owned);
  for (let index = users.length - 1; index >= 0; index--) {
    const turn = users[index];
    if (/\b(?:fictional|hypothetical|new question|unrelated)\b/i.test(turn.text)) return null;
    const named = explicitlyNamedOwnedPets(turn.text, owned);
    const anchors = dates(turn.text);
    if (!anchors.length) { if (!followUp(turn.text)) return null; continue; }
    if (!named.length) return null;
    if (anchors.length !== 1 || named.length !== 1) return null;
    const switched = users.slice(index + 1).flatMap(t => explicitlyNamedOwnedPets(t.text, owned));
    const pluralComparison = /\b(?:compare|difference|heavier|lighter)\b/i.test(text) && /\b(?:their|those|two|both)\b/i.test(text);
    const subjects = selected.length ? selected : pluralComparison
      ? [...new Map([...named, ...switched].map(p => [p.id,p])).values()] : switched.length ? [switched.at(-1)!] : named;
    if (!subjects.length || subjects.length > 3) return null;
    const anchor = anchors[0];
    const earlier = /\bearlier\b/i.test(text);
    const later = /\b(?:later|recover(?:ed|y)?)\b/i.test(text);
    if (earlier && later) return null;
    const start = anchor.length === 7 ? anchor + "-01" : anchor;
    const from = earlier ? null : start;
    const to = earlier ? start : later ? null : anchor.length === 7
      ? new Date(Date.UTC(Number(anchor.slice(0,4)), Number(anchor.slice(5,7)), 1)).toISOString().slice(0,10)
      : new Date(Date.parse(start) + 86400000).toISOString().slice(0,10);
    return { from, to, petNames: subjects.map(p => p.name!), referenceTurnIds: users.slice(index).map(t => t.id),
      question: "Current request: " + text + "\nPrior USER question identifying the record and property (not factual evidence): " + turn.text };
  }
  return null;
}
