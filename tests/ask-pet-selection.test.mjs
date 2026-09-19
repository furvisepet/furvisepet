import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAskPetSelection } from "../app/lib/ask-pet-selection.ts";

const pets = [
  { id: "mani", created_at: "2026-08-10T22:38:00Z" },
  { id: "luna", created_at: "2026-08-10T22:37:00Z" },
];

test("Ask pet selection honors conversation, explicit, stored, then stable fallback precedence", () => {
  assert.equal(resolveAskPetSelection({ boundConversationPetId: "mani", explicitPetId: "luna", storedPetId: "luna", pets }), "mani");
  assert.equal(resolveAskPetSelection({ explicitPetId: "luna", storedPetId: "mani", pets }), "luna");
  assert.equal(resolveAskPetSelection({ storedPetId: "luna", pets }), "luna");
  assert.equal(resolveAskPetSelection({ pets }), "luna");
});

test("Ask pet selection ignores deleted or invalid stored IDs", () => {
  assert.equal(resolveAskPetSelection({ storedPetId: "deleted-pet", pets }), "luna");
});

test("Ask fallback is independent of incoming mutable update order", () => {
  assert.equal(resolveAskPetSelection({ pets: [...pets].reverse() }), "luna");
});

test("Ask persists selector changes and encodes opened or created conversations for refresh", () => {
  const page = readFileSync(new URL("../app/ask/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getActivePetId\(window\.localStorage\)/);
  assert.match(page, /function switchPet[\s\S]*persistActivePetId\(petId\)/);
  assert.match(page, /function openConversation[\s\S]*persistActivePetId\(payload\.conversation\.petId\)/);
  assert.match(page, /replaceAskLocation\(\{ conversationId: payload\.conversation\.id \}\)/);
  assert.match(page, /replaceAskLocation\(\{ conversationId: payload\.conversationId \}\)/);
});
