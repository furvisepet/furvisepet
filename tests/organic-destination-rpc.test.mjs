import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260805010000_add_organic_product_destination_resolver.sql", import.meta.url);
const routeUrl = new URL("../app/api/shop/catalog/route.ts", import.meta.url);
const repositoryUrl = new URL("../app/lib/catalog/organic-destinations.ts", import.meta.url);
const compatibilityUrl = new URL("../app/lib/catalog/compatibility.ts", import.meta.url);

async function sources() {
  return {
    compatibility: await readFile(compatibilityUrl, "utf8"),
    migration: await readFile(migrationUrl, "utf8"),
    repository: await readFile(repositoryUrl, "utf8"),
    route: await readFile(routeUrl, "utf8"),
  };
}

test("destination resolver is authenticated-only and has a locked search path", async () => {
  const { migration } = await sources();
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /if auth\.uid\(\) is null[\s\S]*errcode = '42501'/i);
  assert.match(migration, /revoke all on function public\.resolve_organic_product_destinations\(uuid\[\], text, text\) from public, anon, service_role/i);
  assert.match(migration, /grant execute on function public\.resolve_organic_product_destinations\(uuid\[\], text, text\) to authenticated/i);
});

test("inactive, unpublished, country-mismatched, and species-mismatched products resolve nothing", async () => {
  const { migration } = await sources();
  assert.match(migration, /product\.is_active[\s\S]*product\.status = 'active'/);
  assert.match(migration, /market\.country_code = p_country_code[\s\S]*market\.status = 'available'/);
  assert.match(migration, /species\.code = p_species_code[\s\S]*species\.is_active/);
  assert.match(migration, /product_species\.suitability_type in \('intended', 'compatible'\)/);
  assert.match(migration, /p_country_code not in \('CA', 'US'\)/);
  assert.match(migration, /p_species_code not in \('dog', 'cat'\)/);
});

test("only permitted, complete organic provenance with an exact hostname can resolve", async () => {
  const { migration } = await sources();
  assert.match(migration, /'ingestionMode' = 'organic_curated'/);
  assert.match(migration, /'sourceUseStatus' = 'permitted'/);
  assert.match(migration, /'provenanceComplete' = 'true'::jsonb/);
  assert.match(migration, /permitted\.field_name = 'destination_links'/);
  assert.match(migration, /where lower\(allowed\.hostname\) = destination\.hostname/);
  assert.match(migration, /\^https\?\:\/\//);
  assert.doesNotMatch(migration, /like\s+'%|ilike|ends_with|right\s*\(/i);

  const hostnamePattern = /^https?:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?(?:[/?#]|$)/i;
  const allowed = new Set(["manufacturer.example"]);
  const resolves = (url) => allowed.has(url.match(hostnamePattern)?.[1]?.toLowerCase() || "");
  assert.equal(resolves("https://manufacturer.example/item"), true);
  assert.equal(resolves("https://manufacturer.example.evil.test/item"), false);
  assert.equal(resolves("https://manufacturer.example@evil.test/item"), false);
  assert.equal(resolves("https://manufacturer.example\\@evil.test/item"), false);
});

test("the RPC returns only product_id and validated_destination_url", async () => {
  const { migration, repository, route } = await sources();
  assert.match(migration, /returns table\(product_id uuid, validated_destination_url text\)/i);
  const returnQuery = migration.slice(migration.indexOf("return query"), migration.indexOf("from public.product_sources"));
  assert.match(returnQuery, /source\.product_id,[\s\S]*source\.source_url as validated_destination_url/);
  assert.doesNotMatch(returnQuery, /raw_payload|permission|provider|authorization|manifest|reference/i);
  assert.doesNotMatch(repository, /\.from\("product_sources"\)|raw_payload|permissionSnapshot|service.role|SUPABASE_SECRET/i);
  assert.doesNotMatch(route, /createTrustedIngestionClientFromEnv|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE/);
});

test("privileged source resolution is absent from generic queries and compatibility mapping", async () => {
  const { compatibility, repository, route } = await sources();
  assert.match(repository, /supabase\.rpc\("resolve_organic_product_destinations"/);
  assert.match(route, /resolveOrganicProductDestinations\(context\.supabase/);
  assert.doesNotMatch(compatibility, /organicSourceClient|resolveOrganicProductDestinations|product_sources|service.role/i);
});
