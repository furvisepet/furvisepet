/** Bounded acquisition, independent of model calls. Coverage describes database
 * query scopes, never a proof of semantic recall or current/corrected truth. */
export const EVIDENCE_GOALS = Object.freeze(["exact_quote", "relevant_records", "boundary", "comparison", "complete_set"]);
export const HISTORY_PAGE_BUDGET = 8;
export const HISTORY_PAGE_SIZE = 16;
export const HISTORY_CANDIDATE_BUDGET = 64;

export async function discoverHistory(request, fetchPage) {
 const terms = [...new Set(request.terms ?? [])];
 const budget = Math.max(1, Math.min(HISTORY_PAGE_BUDGET, request.pageBudget ?? 2));
 const candidateBudget = Math.max(1, Math.min(HISTORY_CANDIDATE_BUDGET, request.candidateBudget ?? HISTORY_CANDIDATE_BUDGET));
 const lanes = terms.length ? [
  { mode: "lexical", terms, offset: request.offset ?? 0, total: null, inspected: 0, pages: 0, exhausted: false },
  { mode: "broader", terms: [], offset: request.offset ?? 0, total: null, inspected: 0, pages: 0, exhausted: false },
 ] : [{ mode: "scoped", terms: [], offset: request.offset ?? 0, total: null, inspected: 0, pages: 0, exhausted: false }];
 const sources = [], seen = new Map(), laneSources = lanes.map(() => []);
 let unavailable = false, inspectedRows = 0;
 for (let page = 0; page < budget; page++) {
  const lane = lanes[page % lanes.length];
  const next = lane.exhausted ? lanes.find(value => !value.exhausted) : lane;
  if (!next) break;
  const remaining = candidateBudget - inspectedRows;
  if (remaining <= 0) break;
  // Reserve acquisition capacity for discovery lanes not yet inspected, too.
  const waiting = lanes.filter(value => !value.exhausted && value.pages === 0).length;
  const limit = Math.min(HISTORY_PAGE_SIZE, Math.max(1, Math.floor(remaining / Math.max(1, waiting))));
  try {
   const result = await fetchPage({ terms: next.terms, offset: next.offset, limit });
   if (!result || !Array.isArray(result.sources) || result.sources.length > limit) throw new Error("ASK_READ_DATABASE_INVALID");
   inspectedRows += result.sources.length;
   next.pages++; next.inspected += result.sources.length;
   next.total = Number.isSafeInteger(result.total) && result.total >= 0 ? result.total : null;
   next.exhausted = !result.hasMore;
   next.offset += limit;
   for (const source of result.sources) {
    const previous = seen.get(source.id);
    if (previous && ["kind", "ownerId", "petId", "body", "eventAt", "recordedAt"].some(key => previous[key] !== source[key])) throw new Error("ASK_READ_SOURCE_CHANGED");
    if (!previous) { seen.set(source.id, source); laneSources[lanes.indexOf(next)].push(source); }
   }
  } catch (error) {
   // Unavailability may affect one goal without erasing other answerable goals.
   // Identity, malformed data and inconsistent source failures remain fatal.
   if (error?.message !== "ASK_READ_HISTORY_UNAVAILABLE") throw error;
   unavailable = true; break;
  }
 }
 // Interleave discovery lanes so literal matches cannot crowd out every broader
 // candidate before the final evidence allocator sees them.
 for (let index = 0; index < Math.max(0, ...laneSources.map(rows => rows.length)); index++) for (const rows of laneSources) if (rows[index]) sources.push(rows[index]);
 const lexical = lanes.find(lane => lane.mode === "lexical");
 const complete = lanes.every(lane => lane.exhausted) && !(request.offset > 0) && !unavailable;
 return { sources, total: lanes.at(-1).total, matchedTotal: lexical?.total ?? null,
  hasMore: lanes.some(lane => !lane.exhausted), searchRelaxed: !!lexical && lexical.total === 0,
  discovery: lanes.map(lane => ({mode:lane.mode,offset:lane.offset,total:lane.total,inspected:lane.inspected,pages:lane.pages,exhausted:lane.exhausted})), inspected: sources.length,
  scopeExhausted: complete, unavailable, semanticRecallVerified: false };
}

/** Allocate whole sources across goals before redistributing unused capacity.
 * Do not shorten attributed note bodies to make a source fit. */
export function allocateEvidence(groups, limits) {
 const selected = [], known = new Map(), visible = groups.map(() => []);
 const deferred = groups.map(() => []);
 let characters = 0;
 const slots = Math.floor(limits.records / Math.max(1, groups.length));
 const share = Math.floor(limits.sourceCharacters / Math.max(1, groups.length));
 const add = (row, index, quota) => {
  const key = row.kind + ":" + row.id;
  let source = known.get(key);
  if (!source) {
   if (selected.length >= limits.records || row.body.length > 12000 || characters + row.body.length > limits.sourceCharacters || row.body.length > quota) return false;
   source = { ...row, handle: "s" + (selected.length + 1) };
   selected.push(source); known.set(key, source); characters += row.body.length;
  }
  if (!visible[index].includes(source)) visible[index].push(source);
  return true;
 };
 // Round-robin within equal reservations, rather than filling the first goal.
 const spent = groups.map(() => 0);
 const longest = Math.max(0, ...groups.map(group => group.length));
 for (let row = 0; row < longest; row++) for (let index = 0; index < groups.length; index++) {
  const source = groups[index][row];
  if (!source) continue;
  if (visible[index].length >= slots || !add(source, index, share - spent[index])) deferred[index].push(source);
  else spent[index] += source.body.length;
 }
 for (let row = 0; row < longest; row++) for (let index = 0; index < groups.length; index++) {
  const source = deferred[index][row];
  if (source) add(source, index, limits.sourceCharacters - characters);
 }
 return { sources: selected, visible, omitted: groups.map((group, index) => group.filter(row => !visible[index].some(source => source.kind === row.kind && source.id === row.id)).length) };
}
