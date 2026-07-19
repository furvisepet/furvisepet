import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  buildManualAccountCountryUpdate,
  decideAccountCountryDetection,
  detectCountryFromRequestHeaders,
  normalizeAccountProductCountry,
  resolveActiveAccountProductCountry,
} from "../app/lib/account-country.ts";
import { updateUserProductCountryWithClient } from "../app/lib/supabase.ts";

function readUserProfileMigrations() {
  return readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql"))
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .filter((sql) => sql.includes("public.user_profiles"))
    .join("\n");
}

function createAccountProfileClient({ data, error = null }) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(["from", table]);
      return {
        upsert(payload, options) {
          calls.push(["upsert", payload, options]);
          return {
            select() {
              calls.push(["select"]);
              return {
                async single() {
                  calls.push(["single"]);
                  return { data, error };
                },
              };
            },
          };
        },
      };
    },
  };

  return client;
}

test("account country normalizes only supported MVP countries", () => {
  assert.equal(normalizeAccountProductCountry("ca"), "CA");
  assert.equal(normalizeAccountProductCountry("US"), "US");
  assert.equal(normalizeAccountProductCountry("GB"), null);
  assert.equal(normalizeAccountProductCountry(""), null);
});

test("x-vercel-ip-country CA stores CA for a new user", () => {
  const detectedCountry = detectCountryFromRequestHeaders(new Headers({ "x-vercel-ip-country": "CA" }));
  const decision = decideAccountCountryDetection({ currentProfile: null, detectedCountry });

  assert.deepEqual(decision, {
    country: "CA",
    countrySource: "detected",
    shouldWrite: true,
  });
});

test("x-vercel-ip-country US stores US for a new user", () => {
  const detectedCountry = detectCountryFromRequestHeaders(new Headers({ "x-vercel-ip-country": "us" }));
  const decision = decideAccountCountryDetection({ currentProfile: null, detectedCountry });

  assert.equal(decision.country, "US");
  assert.equal(decision.countrySource, "detected");
  assert.equal(decision.shouldWrite, true);
});

test("unsupported country header does not store the unsupported value", () => {
  const detectedCountry = detectCountryFromRequestHeaders(new Headers({ "x-vercel-ip-country": "GB" }));
  const decision = decideAccountCountryDetection({
    currentProfile: null,
    detectedCountry,
    nextPublicProductCountry: "",
    productCountry: "",
  });

  assert.equal(detectedCountry, null);
  assert.equal(decision.country, "CA");
  assert.equal(decision.countrySource, "env_default");
});

test("missing country header uses safe env fallback", () => {
  const decision = decideAccountCountryDetection({
    currentProfile: null,
    detectedCountry: detectCountryFromRequestHeaders(new Headers()),
    nextPublicProductCountry: "",
    productCountry: "US",
  });

  assert.equal(decision.country, "US");
  assert.equal(decision.countrySource, "env_default");
  assert.equal(decision.shouldWrite, true);
});

test("existing manual country is not overwritten by detection", () => {
  const decision = decideAccountCountryDetection({
    currentProfile: { country: "US", country_source: "manual" },
    detectedCountry: "CA",
  });

  assert.equal(decision.country, "US");
  assert.equal(decision.countrySource, "manual");
  assert.equal(decision.shouldWrite, false);
});

test("existing stored country is not re-detected on every call", () => {
  const decision = decideAccountCountryDetection({
    currentProfile: { country: "CA", country_source: "detected" },
    detectedCountry: "US",
  });

  assert.equal(decision.country, "CA");
  assert.equal(decision.countrySource, "detected");
  assert.equal(decision.shouldWrite, false);
});

test("manual override payload stores account-level manual source", () => {
  assert.deepEqual(
    buildManualAccountCountryUpdate({
      country: "us",
      now: "2026-07-17T12:00:00.000Z",
      userId: "user-1",
    }),
    {
      country: "US",
      country_source: "manual",
      country_updated_at: "2026-07-17T12:00:00.000Z",
      user_id: "user-1",
    },
  );
  assert.throws(() => buildManualAccountCountryUpdate({ country: "GB", userId: "user-1" }));
});

test("product country save upserts user profile for first-time users", async () => {
  const savedAt = "2026-07-17T12:00:00.000Z";
  const client = createAccountProfileClient({
    data: {
      country: "US",
      country_source: "manual",
      country_detected_at: null,
      country_updated_at: savedAt,
      user_id: "user-1",
    },
  });

  const row = await updateUserProductCountryWithClient(client, "us", { id: "user-1" });

  assert.equal(row?.country, "US");
  assert.equal(row?.country_source, "manual");
  assert.deepEqual(client.calls[0], ["from", "user_profiles"]);
  assert.equal(client.calls[1][0], "upsert");
  assert.deepEqual(client.calls[1][2], { onConflict: "user_id" });
  assert.equal(client.calls[1][1].user_id, "user-1");
  assert.equal(client.calls[1][1].country, "US");
  assert.equal(client.calls[1][1].country_source, "manual");
  assert.ok(client.calls[1][1].country_updated_at);
});

test("first-time manual save does not require an existing profile row", async () => {
  const client = createAccountProfileClient({
    data: {
      country: "CA",
      country_source: "manual",
      country_detected_at: null,
      country_updated_at: "2026-07-17T12:00:00.000Z",
      user_id: "new-user",
    },
  });

  await updateUserProductCountryWithClient(client, "CA", { id: "new-user" });

  assert.equal(client.calls.some((call) => call[0] === "upsert"), true);
  assert.equal(client.calls.some((call) => call[0] === "insert"), false);
  assert.equal(client.calls.some((call) => call[0] === "update"), false);
});

test("active product country source order prefers account profile before env", () => {
  assert.equal(resolveActiveAccountProductCountry({ accountCountry: "US", productCountry: "CA" }), "US");
  assert.equal(resolveActiveAccountProductCountry({ accountCountry: null, productCountry: "US" }), "US");
  assert.equal(resolveActiveAccountProductCountry({ accountCountry: "GB", productCountry: "GB" }), "CA");
});

test("user_profiles migrations store only account country with owner RLS", () => {
  const migration = readUserProfileMigrations();

  assert.match(migration, /create table if not exists public\.user_profiles/);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /country text/);
  assert.match(migration, /country_source text default null/);
  assert.match(migration, /country_detected_at timestamptz/);
  assert.match(migration, /country_updated_at timestamptz/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/);
  assert.match(migration, /check \(country is null or country in \('US', 'CA'\)\)/);
  assert.match(migration, /check \(country_source is null or country_source in \('detected', 'manual', 'env_default'\)\)/);
  assert.match(migration, /alter table public\.user_profiles enable row level security/);
  assert.match(migration, /for select\s+using \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for insert\s+with check \(auth\.uid\(\) = user_id\)/);
  assert.match(migration, /for update\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(migration, /dog_profiles[\s\S]*country_source/);
});

test("app code uses the public user_profiles table for account country", () => {
  const supabaseSource = readFileSync("app/lib/supabase.ts", "utf8");
  const detectRoute = readFileSync("app/api/account/detect-country/route.ts", "utf8");

  assert.match(supabaseSource, /\.from\("user_profiles"\)/);
  assert.match(detectRoute, /\.from\("user_profiles"\)/);
  assert.doesNotMatch(`${supabaseSource}\n${detectRoute}`, /\.from\("(account_profiles|profiles)"\)/);
});
