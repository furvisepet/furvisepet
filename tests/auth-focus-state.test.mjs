import assert from "node:assert/strict";
import test from "node:test";
import { reconcileAuthState } from "../app/lib/auth-state.ts";

test("repeated confirmation preserves identity; real auth changes propagate", () => {
  const previous = { status: "signedIn", user: { id: "owner-a", user_metadata: { name: "A" } } };
  assert.equal(reconcileAuthState(previous, structuredClone(previous)), previous);
  for (const next of [
    { status: "signedOut", user: null },
    { status: "signedIn", user: { ...previous.user, id: "owner-b" } },
    { status: "signedIn", user: { ...previous.user, user_metadata: { name: "Updated" } } },
    { status: "signedIn", user: { ...previous.user, app_metadata: { role: "changed" } } },
  ]) assert.equal(reconcileAuthState(previous, next), next);
  assert.equal(reconcileAuthState({ status: "loading", user: null }, previous), previous);
});
