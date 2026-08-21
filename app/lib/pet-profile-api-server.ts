import "server-only";

import { validateDogProfileInput } from "./ai-analysis";
import { getAuthenticatedApiContext } from "./authenticated-api-server";
import { normalizeAvoidIngredientValues, normalizeSpecies, normalizeWellnessGoal, parsePositiveNumber, type DogProfile } from "./petwise";
import { API_BODY_LIMITS, RequestBoundaryError, hasOnlyKeys, readBoundedJson } from "./security/request";
import { beginIdempotentRateLimitedOperation } from "./security/idempotency";
import type { DogProfileRow } from "./supabase";

const PROFILE_KEYS = ["name", "species", "breed", "age", "ageUnit", "ageUnknown", "weight", "weightUnit", "weightUnknown", "currentFood", "currentFoodUnknown", "mainConcern", "otherConcern", "avoidIngredients", "avoidIngredientsNoneKnown", "customAvoidIngredient", "monthlyBudget", "sex", "routineNote", "wellnessGoal"] as const;

export async function saveProfile(request: Request, profileId: string | null) {
  const context = await getAuthenticatedApiContext(request);
  if ("response" in context) return context.response;
  let raw: unknown;
  try { raw = await readBoundedJson(request, API_BODY_LIMITS.standard); }
  catch (error) {
    const tooLarge = error instanceof RequestBoundaryError && error.code === "PAYLOAD_TOO_LARGE";
    return Response.json({ error: tooLarge ? "That pet profile is too large." : "Send a valid pet profile." }, { status: tooLarge ? 413 : 400 });
  }
  if (!hasOnlyKeys(raw, ["profile"])) return Response.json({ error: "The pet profile contains unsupported fields." }, { status: 400 });
  const candidate = (raw as { profile?: unknown }).profile;
  if (!hasOnlyKeys(candidate, PROFILE_KEYS) || !profileFieldsAreBounded(candidate)) return Response.json({ error: "Review the pet profile fields and try again." }, { status: 400 });
  const validation = validateDogProfileInput(candidate);
  if (!validation.ok) return Response.json({ error: validation.message }, { status: 400 });
  if (profileId) {
    const { data: owned } = await context.supabase.from("dog_profiles").select("id").eq("id", profileId).eq("user_id", context.userId).maybeSingle<{ id: string }>();
    if (!owned) return Response.json({ error: "That pet profile is not available." }, { status: 404 });
  }
  const gate = await beginIdempotentRateLimitedOperation({ operationType: profileId ? "profile.update" : "profile.create", payload: { profile: validation.profile, profileId }, policy: "PROFILE_WRITE", request, route: profileId ? "/api/pets/[id]" : "/api/pets", supabase: context.supabase, userId: context.userId });
  if ("response" in gate) return gate.response;
  return gate.operation.execute(async () => {
    const payload = buildPayload(validation.profile, context.userId, !profileId);
    const query = profileId ? context.supabase.from("dog_profiles").update(payload).eq("id", profileId).eq("user_id", context.userId) : context.supabase.from("dog_profiles").insert({ ...payload, idempotency_key: gate.operation.key });
    const { data, error } = await query.select().single<DogProfileRow>();
    if (!profileId && error?.code === "23505") {
      const { data: replay } = await context.supabase.from("dog_profiles").select("*").eq("user_id", context.userId).eq("idempotency_key", gate.operation.key).maybeSingle<DogProfileRow>();
      if (replay) return Response.json({ profile: replay }, { status: 201 });
    }
    if (error?.message?.includes("PET_LIMIT_REACHED")) return Response.json({ code: "PET_LIMIT_REACHED", error: "Your current pet limit was reached." }, { status: 409 });
    if (error || !data) return Response.json({ error: "The pet profile could not be saved." }, { status: 503 });
    return Response.json({ profile: data }, { status: profileId ? 200 : 201 });
  });
}

function profileFieldsAreBounded(value: unknown) {
  const profile = value as Record<string, unknown>;
  const strings = ["name", "breed", "age", "weight", "currentFood", "otherConcern", "customAvoidIngredient", "monthlyBudget", "routineNote"];
  if (strings.some((key) => typeof profile[key] === "string" && (profile[key] as string).length > (key === "routineNote" ? 2_000 : 300))) return false;
  return !Array.isArray(profile.avoidIngredients) || (profile.avoidIngredients.length <= 30 && profile.avoidIngredients.every((item) => typeof item === "string" && item.length <= 120));
}

function buildPayload(profile: DogProfile, userId: string, includeOwner: boolean) {
  const age = profile.ageUnknown || !profile.age.trim() ? Number.NaN : parsePositiveNumber(profile.age);
  const weight = profile.weightUnknown || !profile.weight.trim() ? Number.NaN : parsePositiveNumber(profile.weight);
  const budget = profile.monthlyBudget.trim() ? parsePositiveNumber(profile.monthlyBudget) : Number.NaN;
  return { ...(includeOwner ? { user_id: userId } : {}), name: profile.name.trim(), species: normalizeSpecies(profile.species) || null, breed: profile.breed.trim() || null, age_value: Number.isFinite(age) ? age : null, age_unit: Number.isFinite(age) ? profile.ageUnit : null, weight_value: Number.isFinite(weight) ? weight : null, weight_unit: Number.isFinite(weight) ? profile.weightUnit : null, current_food: profile.currentFoodUnknown ? null : profile.currentFood.trim() || null, main_concern: profile.mainConcern === "Other" ? profile.otherConcern.trim() : profile.mainConcern || null, wellness_goal: normalizeWellnessGoal(profile.wellnessGoal) || null, avoid_ingredients: profile.avoidIngredientsNoneKnown ? [] : profile.avoidIngredients.length ? normalizeAvoidIngredientValues(profile.avoidIngredients) : null, monthly_budget: Number.isFinite(budget) ? budget : null, sex: profile.sex || null, routine_note: profile.routineNote?.trim() || null, updated_at: new Date().toISOString() };
}
