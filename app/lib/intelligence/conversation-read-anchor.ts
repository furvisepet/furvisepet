import { analyzeOwnerAssertions } from "../ai/owner-assertion.ts";
import { explicitlyNamedOwnedPets } from "./entities/resolve-turn-subject.ts";
import { explicitHistoryDays } from "./history-dates.ts";
import { explicitHistoryMonths } from "./history-dates.ts";
import { ASK_HISTORY_MAX_PETS } from "./history-limits.ts";
import type { FurviseLiveContext } from "./types.ts";
type Context = Pick<FurviseLiveContext, "owner" | "eligiblePets" | "pet" | "currentMessage" | "conversationTurns">;
export type ConversationReadScope = {
  version: "read-scope.v1"; activePetIds: string[]; comparisonPetIds: string[];
  anchor: string; task: string; referenceTurnIds: string[];
};
const reference = (text: string) => /\b(?:that|those|these|same|their|then|later|earlier|both)\b|^(?:and|convert|compare)\b/i.test(text);
const reset = (text: string) => /\b(?:fictional|hypothetical|instead|new question|unrelated)\b/i.test(text);
const plural = (text: string) => /\b(?:those|these|their|both)\b|\bthe\s+(?:two|three)\s+(?:pets?|animals?)\b/i.test(text);
const unique = (ids: readonly string[]) => [...new Set(ids)];
/** Reconstruct a bounded server-owned scope from USER turns. Assistant statements
 * never supply identity, dates, measurements or write authority. No DB migration
 * is needed; reconstruction uses the same persisted turn sequence as the read. */
export function reconstructConversationReadScope(context: Context): ConversationReadScope | null {
  const owned = context.eligiblePets.filter(p => p.user_id === context.owner.userId);
  const users = context.conversationTurns.filter(t => t.role === "user" && t.text !== context.currentMessage).slice(-8);
  let scope: ConversationReadScope | null = null;
  for (const turn of users) {
    const text = turn.text.trim();
    if (reset(text) || analyzeOwnerAssertions(text).hasOwnerAssertion) { scope = null; continue; }
    const names = explicitlyNamedOwnedPets(text, owned).map(p => p.id);
    const days = explicitHistoryDays(text, new Date().getUTCFullYear(), 8);
    const anchors = unique(days.length ? days : explicitHistoryMonths(text));
    if (anchors.length) {
      scope = anchors.length === 1 && names.length ? { version: "read-scope.v1", activePetIds: names,
        comparisonPetIds: names, anchor: anchors[0], task: text, referenceTurnIds: [turn.id] } : null;
      continue;
    }
    if (!scope || !reference(text)) { scope = null; continue; }
    if (names.length) {
      scope.activePetIds = names;
      scope.comparisonPetIds = /\bonly\b/i.test(text) ? names : unique([...scope.comparisonPetIds, ...names]);
    } else if (plural(text)) scope.activePetIds = [...scope.comparisonPetIds];
    scope.referenceTurnIds.push(turn.id);
  }
  return scope;
}
/** Scope locates records; it never proves any value or authorizes an update. */
export function conversationReadAnchor(context: Context) {
  const text = context.currentMessage.trim();
  if (analyzeOwnerAssertions(text).hasOwnerAssertion || !reference(text) || reset(text)) return null;
  const days = explicitHistoryDays(text, new Date().getUTCFullYear(), 8);
  if (days.length || explicitHistoryMonths(text).length) return null;
  const scope = reconstructConversationReadScope(context);
  if (!scope) return null;
  const owned = context.eligiblePets.filter(p => p.user_id === context.owner.userId);
  const selected = explicitlyNamedOwnedPets(text, owned).map(p => p.id);
  const ids = selected.length ? selected : plural(text) ? scope.comparisonPetIds : scope.activePetIds;
  if (!ids.length || ids.length > ASK_HISTORY_MAX_PETS) return null;
  const subjects = ids.map(id => owned.find(p => p.id === id));
  if (subjects.some(p => !p?.name)) return null;
  const earlier = /\bearlier\b/i.test(text), later = /\b(?:later|recover(?:ed|y)?)\b/i.test(text);
  if (earlier && later) return null;
  const start = scope.anchor.length === 7 ? scope.anchor + "-01" : scope.anchor;
  const from = earlier ? null : start;
  const to = earlier ? start : later ? null : scope.anchor.length === 7
    ? new Date(Date.UTC(Number(scope.anchor.slice(0,4)), Number(scope.anchor.slice(5,7)), 1)).toISOString().slice(0,10)
    : new Date(Date.parse(start) + 86400000).toISOString().slice(0,10);
  return { from, to, petNames: subjects.map(p => p!.name!), referenceTurnIds: scope.referenceTurnIds,
    scope: { ...scope, activePetIds: [...ids] },
    question: "Current request: " + text + "\nPrior USER question identifying the record and property (not factual evidence): " + scope.task };
}
