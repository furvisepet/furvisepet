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

test("mixed save plus read separates the stored fact from the companion question",()=>{
  const cedar={id:"cedar",name:"Cedar"};
  const note=resolveOwnerNoteRequest({message:"Cedar ate less this morning. Log that, then tell me Cedar's last two weights and whether this note includes a weight.",pet:cedar,pets:[cedar]});
  assert.ok(note);
  assert.equal(note.note,"Cedar ate less this morning.");
  assert.equal(note.companionQuestion,"tell me Cedar's last two weights and whether this note includes a weight.");
  assert.equal(note.needsAnswer,true);
});

test("production mixed prompt does not save a statement about the note itself",()=>{
  const cedar={id:"cedar",name:"Cedar"};
  const message="Log that Cedar refused breakfast. Then list Cedar’s last two weights. This new note has no weight.";
  const note=resolveOwnerNoteRequest({message,pet:cedar,pets:[cedar]});
  assert.ok(note);
  assert.equal(note.note,"Cedar refused breakfast.");
  assert.equal(note.companionQuestion,"Then list Cedar’s last two weights. This new note has no weight.");
  assert.equal(note.needsAnswer,true);
});

test("leading save command keeps the care fact and separates a later question",()=>{
  const aster={id:"aster",name:"Aster"};
  const note=resolveOwnerNoteRequest({message:"Save this for today on Aster: drank more water than usual after the walk. Is that the first water note I have, or did I log thirst before?",pet:aster,pets:[aster]});
  assert.ok(note);
  assert.equal(note.note,"drank more water than usual after the walk.");
  assert.equal(note.companionQuestion,"Is that the first water note I have, or did I log thirst before?");
  assert.equal(note.needsAnswer,true);
});

test("exact live Cedar dinner mixed save is recognized and split",()=>{
  const cedar={id:"cedar",name:"Cedar"};
  const message="Cedar ate normally at dinner today. Log that, then tell me Cedar's last two weights and whether this note includes a weight.";
  const note=resolveOwnerNoteRequest({message,pet:cedar,pets:[cedar]});
  assert.ok(note);
  assert.equal(note.note,"Cedar ate normally at dinner today.");
  assert.equal(note.companionQuestion,"tell me Cedar's last two weights and whether this note includes a weight.");
  assert.equal(note.needsAnswer,true);
});

test("relative owner-note dates become real calendar dates when the request timestamp is known",()=>{
  const cedar={id:"cedar",name:"Cedar"};
  for (const phrase of ["today","this morning","this afternoon","this evening","tonight"]) {
    const note=resolveOwnerNoteRequest({
      message:`Cedar ate normally ${phrase}. Save this note.`,
      pet:cedar,pets:[cedar],timeZone:"America/Vancouver",sourceRecordedAt:"2026-09-19T07:04:12.000Z"
    });
    assert.ok(note, phrase);
    assert.equal(note.explicitTime,"2026-09-19",phrase);
    assert.ok(note.occurredAt, phrase);
  }
  const yesterday=resolveOwnerNoteRequest({
    message:"Cedar ate normally yesterday. Save this note.",
    pet:cedar,pets:[cedar],timeZone:"America/Vancouver",sourceRecordedAt:"2026-09-19T07:04:12.000Z"
  });
  assert.equal(yesterday.explicitTime,"2026-09-18");
});
