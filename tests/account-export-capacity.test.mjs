import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { buildUserDataExport, encodeUserDataExport } from "../app/lib/operations/user-data-export.ts";

const user = { id: "qa-owner" };

function fakeClient(tableRows) {
  return {
    from(table) {
      const rows = tableRows[table] ?? [];
      return {
        select() { return this; },
        eq(column, value) {
          assert.equal(column, "user_id");
          assert.equal(value, user.id);
          return this;
        },
        order() { return this; },
        range(start, end) {
          return { data: rows.slice(start, end + 1), error: null, count: rows.length };
        },
      };
    },
  };
}

test("a long account exports every paged conversation message beyond the old receipt limit", async () => {
  const messages = Array.from({ length: 613 }, (_, index) => ({
    id: index, content: "A saved reply about the pet. ".repeat(12), provider_response: "private",
  }));
  const body = await buildUserDataExport(fakeClient({ ask_conversation_messages: messages }), user, fakeClient({}));
  assert.ok(Buffer.byteLength(body) > 96 * 1024);
  const exported = JSON.parse(body).conversationMessages;
  assert.deepEqual(exported, messages.map(({ id, content }) => ({ id, content })));
});

test("the byte bound applies across sections before an oversized download is returned", async () => {
  const large = [{ text: "é".repeat(4_400_000) }];
  await assert.rejects(
    buildUserDataExport(fakeClient({ pet_care_entries: large, ask_conversation_messages: large }), user, fakeClient({})),
    { message: "EXPORT_TOO_LARGE" },
  );
});

test("a large complete JSON export is downloaded as a lossless gzip archive", async () => {
  const plain = await encodeUserDataExport('{"formatVersion":1}');
  assert.equal(plain.suffix, ".json");
  assert.equal(plain.contentType, "application/json; charset=utf-8");
  const json = JSON.stringify({ conversationMessages: ["A long saved account. ".repeat(250_000)] });
  const archive = await encodeUserDataExport(json);
  assert.equal(archive.suffix, ".json.gz");
  assert.equal(archive.contentType, "application/gzip");
  assert.ok(archive.body.byteLength < 4 * 1024 * 1024);
  assert.equal(gunzipSync(archive.body).toString("utf8"), json);
});

test("the compact usage section exports more than 5,000 rows through the owner client", async () => {
  const events = Array.from({ length: 5814 }, (_, id) => ({ id, feature: "ask", status: "complete" }));
  const admin = fakeClient({ ai_usage_events: [{ id: "must not use the admin client" }] });
  const body = await buildUserDataExport(admin, user, fakeClient({ ai_usage_events: events }));
  assert.deepEqual(JSON.parse(body).aiUsage, events);
  await assert.rejects(buildUserDataExport(fakeClient({
    dog_profiles: Array.from({ length: 5001 }, (_, id) => ({ id })),
  }), user, fakeClient({})), { message: "EXPORT_TOO_LARGE" });
});
