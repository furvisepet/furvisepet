import assert from "node:assert/strict";
import { buildFurvisePlanningContext } from "../../app/lib/intelligence/planning-context.ts";

// Controlled storage, not a replacement planner: execute the real normal loader
// against owned chronological rows and enforce each query's actual predicates.
export async function ownedPlanningFixture(context, alter = () => {}) {
  const owner = context.owner.userId;
  const conversationId = context.conversationId || "controlled-conversation";
  const turns = [...context.conversationTurns];
  if (!turns.some(turn => turn.id === context.currentTurn.id)) turns.push(context.currentTurn);
  let precedingRequest = null;
  const rows = {
    dog_profiles: structuredClone(context.eligiblePets),
    ask_conversations: [{ id: conversationId, user_id: owner, pet_profile_id: context.pet.id }],
    ask_conversation_messages: turns.map((turn, i) => {
      if (turn.role === "user") precedingRequest = "request:" + turn.id;
      return { id: turn.id, user_id: owner, conversation_id: conversationId,
        request_id: precedingRequest, role: turn.role,
        user_text: turn.role === "user" ? turn.text : null,
        response_data: turn.role === "furvise" ? { summary: turn.text } : null,
        sequence_number: i + 1,
        created_at: turn.createdAt || new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() };
    }),
  };
  alter(rows);
  const queries = [];
  const db = { from(table) {
    assert.ok(Object.hasOwn(rows, table), "unexpected storage capability: " + table);
    const filters = [], orders = [], record = { table, predicates: [] };
    let maximum = Infinity, single = false, columns = null;
    queries.push(record);
    const q = {
      select(fields) { columns = fields === "*" ? null : fields.split(","); return q; },
      eq(key, value) { record.predicates.push(["eq", key, value]); filters.push(row => row[key] === value); return q; },
      in(key, values) { record.predicates.push(["in", key, [...values]]); filters.push(row => values.includes(row[key])); return q; },
      lt(key, value) { record.predicates.push(["lt", key, value]); filters.push(row => row[key] < value); return q; },
      order(key, { ascending }) { orders.push([key, ascending]); return q; },
      limit(count) { maximum = count; return q; },
      maybeSingle() { single = true; return q; },
      then(resolve, reject) {
        let data = rows[table].filter(row => filters.every(filter => filter(row)));
        for (const [key, ascending] of orders) data = [...data].sort((a, b) =>
          (a[key] === b[key] ? 0 : a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1));
        data = data.slice(0, maximum).map(row => columns ?
          Object.fromEntries(columns.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])) : structuredClone(row));
        const error = single && data.length > 1 ? { code: "multiple_rows" } : null;
        return Promise.resolve({ data: single ? data[0] || null : data, error }).then(resolve, reject);
      },
    };
    return q;
  }};
  const planned = await buildFurvisePlanningContext({ supabase: db, userId: owner,
    petId: context.pet.id, conversationId, currentMessage: context.currentMessage,
    sourceMessageId: context.currentTurn.id, locale: "en", timeZone: context.timeZone || "UTC" });
  return { context: planned, rows, queries };
}
