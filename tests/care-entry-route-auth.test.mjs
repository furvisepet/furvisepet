import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAuthenticatedApiContext } from "../app/lib/authenticated-api-core.ts";

const routeSource = readFileSync(new URL("../app/api/care-entries/[id]/route.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../app/lib/supabase.ts", import.meta.url), "utf8");

function authClient(user) {
  return {
    auth: {
      async getUser(token) {
        return { data: { user }, error: null, token };
      },
    },
  };
}

test("authenticated care-entry DELETE accepts the bearer session and derives the server user", async () => {
  let receivedToken = "";
  const result = await resolveAuthenticatedApiContext(
    new Request("https://www.furvise.com/api/care-entries/11111111-1111-4111-8111-111111111111", {
      headers: { Authorization: "Bearer authenticated-get-token" },
      method: "DELETE",
    }),
    {
      configurationAvailable: true,
      createBearerClient(token) {
        receivedToken = token;
        return authClient({ id: "server-owned-user" });
      },
      createCookieClient: async () => null,
    },
  );

  assert.equal(receivedToken, "authenticated-get-token");
  assert.equal("response" in result, false);
  assert.equal(result.userId, "server-owned-user");
});

test("authenticated care-entry DELETE accepts the forwarded cookie session", async () => {
  let cookieClientRequested = false;
  const result = await resolveAuthenticatedApiContext(
    new Request("https://www.furvise.com/api/care-entries/11111111-1111-4111-8111-111111111111", {
      headers: { cookie: "sb-project-auth-token=encoded-session", origin: "https://www.furvise.com" },
      method: "DELETE",
    }),
    {
      configurationAvailable: true,
      createBearerClient: () => { throw new Error("bearer client must not be used"); },
      createCookieClient: async () => {
        cookieClientRequested = true;
        return authClient({ id: "cookie-session-user" });
      },
    },
  );

  assert.equal(cookieClientRequested, true);
  assert.equal("response" in result, false);
  assert.equal(result.userId, "cookie-session-user");
});

test("unauthenticated care-entry requests are rejected", async () => {
  const result = await resolveAuthenticatedApiContext(
    new Request("https://www.furvise.com/api/care-entries/11111111-1111-4111-8111-111111111111"),
    {
      configurationAvailable: true,
      createBearerClient: () => { throw new Error("bearer client must not be used"); },
      createCookieClient: async () => authClient(null),
    },
  );

  assert.equal("response" in result, true);
  assert.equal(result.response.status, 401);
  assert.deepEqual(await result.response.json(), { error: "Authentication required." });
});

test("care-entry DELETE is the sole deletion contract and keeps server-owned authorization", () => {
  const deleteRoute = routeSource.slice(routeSource.indexOf("export async function DELETE"));

  assert.doesNotMatch(routeSource, /export async function GET/);
  assert.match(deleteRoute, /getAuthenticatedApiContext\(request\)/);
  assert.match(deleteRoute, /\.eq\("user_id", context\.userId\)/);
  assert.doesNotMatch(deleteRoute, /body\.(?:userId|user_id)|searchParams\.get\(["'](?:userId|user_id)/);
  assert.doesNotMatch(clientSource, /getCareEntryRemovalImpact|stopTrackingIssue/);
  assert.match(clientSource, /removeCareEntryFromHistory[\s\S]*authenticatedApiFetch\(`\/api\/care-entries\/\$\{entryId\}`,[\s\S]*method: "DELETE"/);
  assert.match(clientSource, /credentials: "same-origin"/);
});
