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

test("authenticated care-entry GET accepts the bearer session and derives the server user", async () => {
  let receivedToken = "";
  const result = await resolveAuthenticatedApiContext(
    new Request("https://www.furvise.com/api/care-entries/11111111-1111-4111-8111-111111111111", {
      headers: { Authorization: "Bearer authenticated-get-token" },
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

test("care-entry GET and DELETE share authentication and server-owned authorization", () => {
  const getRoute = routeSource.slice(routeSource.indexOf("export async function GET"), routeSource.indexOf("export async function PATCH"));
  const deleteRoute = routeSource.slice(routeSource.indexOf("export async function DELETE"));

  for (const source of [getRoute, deleteRoute]) {
    assert.match(source, /getAuthenticatedApiContext\(request\)/);
    assert.match(source, /\.eq\("user_id", context\.userId\)/);
    assert.doesNotMatch(source, /body\.(?:userId|user_id)|searchParams\.get\(["'](?:userId|user_id)/);
  }
  assert.match(clientSource, /getCareEntryRemovalImpact[\s\S]*authenticatedApiFetch\(`\/api\/care-entries\/\$\{entryId\}`,[\s\S]*method: "GET"/);
  assert.match(clientSource, /removeCareEntryFromHistory[\s\S]*authenticatedApiFetch\(`\/api\/care-entries\/\$\{entryId\}`,[\s\S]*method: "DELETE"/);
  assert.match(clientSource, /credentials: "same-origin"/);
});
