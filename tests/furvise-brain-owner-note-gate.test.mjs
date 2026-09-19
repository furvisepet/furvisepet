import assert from "node:assert/strict";
import test from "node:test";

import { resolveOwnerNoteRequest } from "../app/lib/intelligence/owner-note-request.ts";
import { persistOwnerNote } from "../app/lib/intelligence/persist-owner-note.ts";

const pet = { id: "pebble", name: "Pebble" };

test("natural-language note carries current-turn authorization provenance", () => {
  const note = resolveOwnerNoteRequest({
    message: "Pebble ate normally. Save this note.",
    pet,
    pets: [pet],
  });
  assert.equal(note.authorizationSource, "current_turn");
  assert.match(note.authorizationEvidence, /save this note/i);
  assert.equal(note.note, "Pebble ate normally.");
});

test("standalone save directive authorizes persistence but is not stored as pet history",()=>{
  const note=resolveOwnerNoteRequest({message:"Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk. Save that for today.",pet,pets:[pet]});
  assert.equal(note.note,"Pebble skipped breakfast but ate dinner fine. A bit slower on the evening walk.");
  assert.match(note.authorizationEvidence,/save that for today/i);
});

test("explicit note control carries transport authorization provenance", () => {
  const note = resolveOwnerNoteRequest({
    message: "Pebble rolled down the hill yesterday lol",
    mode: "note",
    pet,
    pets: [pet],
  });
  assert.equal(note.authorizationSource, "transport");
  assert.equal(note.authorizationEvidence, "note_mode");
});

test("direct persistence refuses a note object with no authorization evidence", async () => {
  let calls = 0;
  await assert.rejects(persistOwnerNote({
    userId: "owner",
    petId: "pebble",
    sourceMessageId: "message",
    requestId: "request",
    note: {
      note: "Pebble rolled down the hill yesterday lol",
      occurredAt: null,
      explicitTime: null,
      needsAnswer: false,
      authorizationSource: "current_turn",
      authorizationEvidence: "",
    },
  }, async () => {
    calls += 1;
    return { data: null, error: null };
  }), /FURVISE_MUTATION_NOT_AUTHORIZED/);
  assert.equal(calls, 0, "database organ must not be reached without brain authorization");
});
