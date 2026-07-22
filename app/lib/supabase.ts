"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  MAIN_CONCERN_OPTIONS,
  initialProfile,
  normalizeProfile,
  normalizeAvoidIngredientValues,
  normalizeSpecies,
  normalizeWellnessGoal,
  parsePositiveNumber,
} from "./petwise";
import type { DogProfile, MainConcern, PetSpecies } from "./petwise";
import {
  buildManualAccountCountryUpdate,
  normalizeAccountCountrySource,
  normalizeAccountProductCountry,
  type AccountCountrySource,
} from "./account-country";
import {
  normalizeCareDatabaseError,
  prepareCareEntryForInsert,
  prepareCareEntryForUpdate,
} from "./care-log.mjs";

export const PROFILE_ID_STORAGE_KEY = "petwise:dog-profile-id";
export const PROFILE_MEMORIES_STORAGE_KEY = "petwise:dog-profile-memories";
const AUTH_PERSISTENCE_STORAGE_KEY = "petwise:auth-persistence";

export type DogProfileRow = {
  id: string;
  user_id: string;
  name: string;
  species: PetSpecies | null;
  breed: string | null;
  age_value: number | null;
  age_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  current_food: string | null;
  main_concern: string | null;
  wellness_goal: string | null;
  avoid_ingredients: string[] | null;
  monthly_budget: number | null;
  created_at: string;
  updated_at: string;
};

export type DogMemoryRow = {
  id: string;
  user_id: string;
  dog_profile_id: string;
  type: string | null;
  text: string;
  confidence: string | null;
  source: string | null;
  created_at: string;
};

export type ProductFeedbackType =
  | "saved"
  | "tried"
  | "worked"
  | "did_not_work"
  | "too_expensive"
  | "avoid_product";

export type DogProductFeedbackRow = {
  id: string;
  user_id: string;
  dog_profile_id: string;
  product_id: string;
  product_name: string;
  feedback_type: ProductFeedbackType;
  note: string | null;
  created_at: string;
};

export type UserProfileRow = {
  user_id: string;
  country: "US" | "CA" | null;
  country_source: AccountCountrySource | null;
  country_detected_at: string | null;
  country_updated_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CareEntryCategory =
  | "symptom"
  | "food"
  | "medication"
  | "activity"
  | "grooming"
  | "vet_visit"
  | "behavior"
  | "general";

export type CareEntrySeverity = "mild" | "moderate" | "severe" | null;

export type CareEntryInput = {
  petProfileId: string;
  category: CareEntryCategory;
  title?: string;
  note: string;
  severity?: Exclude<CareEntrySeverity, null> | null;
  occurredAt: string;
};

export type CareEntryRow = {
  id: string;
  user_id: string;
  pet_profile_id: string;
  category: CareEntryCategory;
  title: string | null;
  note: string;
  severity: Exclude<CareEntrySeverity, null> | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

export type CareEntryWithPetName = CareEntryRow & {
  pet_name: string;
};

export type CreateCareEntryUnlessDuplicateResult =
  | { action: "created"; entry: CareEntryRow }
  | { action: "duplicate"; entry: CareEntryRow };

export type DogProfileWithMemories = DogProfileRow & {
  dog_memories: DogMemoryRow[];
  dog_product_feedback?: DogProductFeedbackRow[];
};

export type MemoryInput = {
  type: string;
  text: string;
  confidence: string;
  source?: string;
};

export type SaveDogMemoriesResult = {
  saved: DogMemoryRow[];
  skippedDuplicates: number;
};

export type ProductFeedbackInput = {
  dogProfileId: string;
  productId: string;
  productName: string;
  feedbackType: ProductFeedbackType;
  note?: string;
};

export type ToggleProductFeedbackResult =
  | { action: "added"; feedback: DogProductFeedbackRow }
  | { action: "removed"; feedback: DogProductFeedbackRow };

let browserClient: SupabaseClient | null | undefined;
type BrowserAuthPersistence = "persistent" | "session";
type BrowserAuthStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function getSupabaseConfigError() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local.";
  }
  return "";
}

function getBrowserAuthPersistence(preferredMode?: BrowserAuthPersistence) {
  if (preferredMode) return preferredMode;
  if (typeof window === "undefined") return "persistent";

  try {
    const storedMode = window.sessionStorage.getItem(AUTH_PERSISTENCE_STORAGE_KEY);
    return storedMode === "session" ? "session" : "persistent";
  } catch {
    return "persistent";
  }
}

function setBrowserAuthPersistence(mode: BrowserAuthPersistence | null) {
  if (typeof window === "undefined") return;

  try {
    if (mode === null) {
      window.sessionStorage.removeItem(AUTH_PERSISTENCE_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(AUTH_PERSISTENCE_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore storage access issues and fall back to in-memory auth state.
  }
}

function getBrowserStorageForMode(mode: BrowserAuthPersistence): BrowserAuthStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return mode === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function readBrowserStorageItem(storage: BrowserAuthStorage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeBrowserStorageItem(storage: BrowserAuthStorage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Ignore storage access issues and let Supabase keep auth state in memory.
  }
}

function removeBrowserStorageItem(storage: BrowserAuthStorage | null, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // Ignore storage access issues and let Supabase keep auth state in memory.
  }
}

function createBrowserAuthStorage(): BrowserAuthStorage {
  return {
    getItem(key) {
      const mode = getBrowserAuthPersistence();
      const primary = getBrowserStorageForMode(mode);
      const fallback = getBrowserStorageForMode(mode === "session" ? "persistent" : "session");
      return readBrowserStorageItem(primary, key) ?? readBrowserStorageItem(fallback, key);
    },
    removeItem(key) {
      removeBrowserStorageItem(getBrowserStorageForMode("persistent"), key);
      removeBrowserStorageItem(getBrowserStorageForMode("session"), key);
    },
    setItem(key, value) {
      const mode = getBrowserAuthPersistence();
      const primary = getBrowserStorageForMode(mode);
      const fallback = getBrowserStorageForMode(mode === "session" ? "persistent" : "session");
      writeBrowserStorageItem(primary, key, value);
      removeBrowserStorageItem(fallback, key);
    },
  };
}

function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof window === "undefined") {
    return null;
  }

  return createClient(normalizeSupabaseUrl(url), key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: createBrowserAuthStorage(),
    },
  });
}

export function setBrowserSupabasePersistence(mode: BrowserAuthPersistence | null) {
  setBrowserAuthPersistence(mode);
}

export function getBrowserSupabase(persistSession?: boolean) {
  if (typeof persistSession === "boolean") {
    setBrowserAuthPersistence(persistSession ? null : "session");
  }

  if (typeof window === "undefined") return null;
  if (browserClient !== undefined) return browserClient;

  browserClient = createBrowserSupabase();
  return browserClient;
}

export async function getCurrentUser() {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function getCurrentAccessToken() {
  const supabase = getBrowserSupabase();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

export async function loadUserProfileForUser(user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("user_profiles")
    .select()
    .eq("user_id", user.id)
    .maybeSingle<UserProfileRow>();

  if (error) throw friendlyDatabaseError(error, "account profile");
  return normalizeUserProfileRow(data);
}

export async function updateUserProductCountryForUser(country: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  return updateUserProductCountryWithClient(supabase, country, user);
}

export async function updateUserProductCountryWithClient(
  supabase: Pick<SupabaseClient, "from">,
  country: string,
  user: Pick<User, "id">,
) {
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(buildManualAccountCountryUpdate({ country, userId: user.id }), { onConflict: "user_id" })
    .select()
    .single<UserProfileRow>();

  if (error) throw friendlyDatabaseSaveError(error, "account profile");
  return normalizeUserProfileRow(data);
}

export async function detectAccountProductCountry() {
  const token = await getCurrentAccessToken();
  if (!token) return null;

  const response = await fetch("/api/account/detect-country", {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });
  const payload = await response.json().catch(() => null) as { profile?: unknown } | null;
  if (!response.ok) return null;
  return normalizeUserProfileRow(payload?.profile);
}

export async function saveDogProfileForUser(
  profile: DogProfile,
  user: User,
  existingProfileId?: string | null,
) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const payload = toDogProfilePayload(profile, user.id);
  if (existingProfileId) {
    const { data, error } = await supabase
      .from("dog_profiles")
      .update(payload)
      .eq("id", existingProfileId)
      .eq("user_id", user.id)
      .select()
      .single<DogProfileRow>();

    if (error) throw friendlyDatabaseSaveError(error, "pet profile");
    return data;
  }

  const { data, error } = await supabase
    .from("dog_profiles")
    .insert(payload)
    .select()
    .single<DogProfileRow>();

  if (error) throw friendlyDatabaseSaveError(error, "pet profile");
  return data;
}

export async function loadDogProfilesWithMemories(user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: profiles, error: profilesError } = await supabase
    .from("dog_profiles")
    .select()
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<DogProfileRow[]>();

  if (profilesError) throw friendlyDatabaseError(profilesError, "saved pet profiles");
  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const [memories, feedback] = await Promise.all([
    loadOptionalDogMemories(profileIds, user),
    loadOptionalDogProductFeedback(profileIds, user),
  ]);
  const memoriesByProfile = groupRowsByProfileId(memories);
  const feedbackByProfile = groupRowsByProfileId(feedback);

  return profiles.map((profile) => ({
    ...profile,
    dog_memories: memoriesByProfile.get(profile.id) || [],
    dog_product_feedback: feedbackByProfile.get(profile.id) || [],
  }));
}

export async function countDogProfilesForUser(user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { count, error } = await supabase
    .from("dog_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) throw friendlyDatabaseError(error, "saved pet profiles");
  return count || 0;
}

export async function loadDogProfileForUser(profileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("dog_profiles")
    .select()
    .eq("id", profileId)
    .eq("user_id", user.id)
    .single<DogProfileRow>();

  if (error) throw friendlyDatabaseError(error, "pet profile");
  return data;
}

type CareLogHelperDeps = {
  getClient?: () => SupabaseClient | null;
  getCurrentUser?: () => Promise<User | null>;
};

export async function listCareEntriesForPet(
  petProfileId: string,
  deps: CareLogHelperDeps = {},
) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  await ensurePetOwnership(petProfileId, user, deps.getClient);

  const { data, error } = await supabase
    .from("pet_care_entries")
    .select()
    .eq("pet_profile_id", petProfileId)
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .returns<CareEntryRow[]>();

  if (error) throw normalizeCareDatabaseError(error, "care entries");
  return data || [];
}

export async function listRecentCareEntries(limit: number, deps: CareLogHelperDeps = {}) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  const { data: entries, error } = await supabase
    .from("pet_care_entries")
    .select()
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false })
    .limit(limit)
    .returns<CareEntryRow[]>();

  if (error) throw normalizeCareDatabaseError(error, "care entries");
  if (!entries || entries.length === 0) return [];

  const petIds = Array.from(new Set(entries.map((entry) => entry.pet_profile_id)));
  const { data: pets, error: petsError } = await supabase
    .from("dog_profiles")
    .select("id, name")
    .in("id", petIds)
    .eq("user_id", user.id)
    .returns<{ id: string; name: string }[]>();

  if (petsError) throw friendlyDatabaseError(petsError, "saved pets");

  const petNameById = new Map((pets || []).map((pet) => [pet.id, pet.name]));
  return entries.map((entry) => ({
    ...entry,
    pet_name: petNameById.get(entry.pet_profile_id) || "Unknown pet",
  }));
}

export async function createCareEntry(input: CareEntryInput, deps: CareLogHelperDeps = {}) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  await ensurePetOwnership(input.petProfileId, user, deps.getClient);
  const payload = prepareCareEntryForInsert(input, user.id);

  const { data, error } = await supabase
    .from("pet_care_entries")
    .insert(payload)
    .select()
    .single<CareEntryRow>();

  if (error) throw normalizeCareDatabaseError(error, "care entry");
  return data;
}

export async function createCareEntryUnlessDuplicate(
  input: CareEntryInput,
  deps: CareLogHelperDeps = {},
): Promise<CreateCareEntryUnlessDuplicateResult> {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  await ensurePetOwnership(input.petProfileId, user, deps.getClient);

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentEntries, error: recentError } = await supabase
    .from("pet_care_entries")
    .select("id,user_id,pet_profile_id,category,title,note,severity,occurred_at,created_at,updated_at")
    .eq("pet_profile_id", input.petProfileId)
    .eq("user_id", user.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<CareEntryRow[]>();

  if (recentError) throw normalizeCareDatabaseError(recentError, "care entries");

  const duplicate = (recentEntries || []).find((entry) => isDuplicateFurviseCareEntry(entry, input));
  if (duplicate) return { action: "duplicate", entry: duplicate };

  const payload = prepareCareEntryForInsert(input, user.id);
  const { data, error } = await supabase
    .from("pet_care_entries")
    .insert(payload)
    .select()
    .single<CareEntryRow>();

  if (error) throw normalizeCareDatabaseError(error, "care entry");
  return { action: "created", entry: data };
}

export async function updateCareEntry(
  entryId: string,
  input: CareEntryInput,
  deps: CareLogHelperDeps = {},
) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  await ensurePetOwnership(input.petProfileId, user, deps.getClient);
  const payload = prepareCareEntryForUpdate(input);

  const { data, error } = await supabase
    .from("pet_care_entries")
    .update(payload)
    .eq("id", entryId)
    .eq("user_id", user.id)
    .select()
    .single<CareEntryRow>();

  if (error) throw normalizeCareDatabaseError(error, "care entry");
  return data;
}

export async function deleteCareEntry(entryId: string, deps: CareLogHelperDeps = {}) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  const { data: existing, error: existingError } = await supabase
    .from("pet_care_entries")
    .select("id")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (existingError) throw normalizeCareDatabaseError(existingError, "care entry");
  if (!existing) {
    throw new Error("Furvise could not find that care entry for your account.");
  }

  const { error } = await supabase
    .from("pet_care_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw normalizeCareDatabaseError(error, "care entry");
}

export async function loadDogProfileWithMemoriesForUser(profileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("dog_profiles")
    .select("*, dog_memories(*)")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "dog_memories", ascending: false })
    .single<DogProfileWithMemories>();

  if (error) throw friendlyDatabaseError(error, "pet profile memories");
  return data;
}

export async function deleteDogProfileForUser(profileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase
    .from("dog_profiles")
    .delete()
    .eq("id", profileId)
    .eq("user_id", user.id);

  if (error) throw friendlyDatabaseError(error, "pet profile");
}

export async function deleteDogMemoryForUser(memoryId: string, dogProfileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase
    .from("dog_memories")
    .delete()
    .eq("id", memoryId)
    .eq("dog_profile_id", dogProfileId)
    .eq("user_id", user.id);

  if (error) throw friendlyDatabaseError(error, "dog memory");
}

export async function deleteDogMemoriesForUser(
  memoryIds: string[],
  dogProfileId: string,
  user: User,
) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  if (memoryIds.length === 0) return;

  const { error } = await supabase
    .from("dog_memories")
    .delete()
    .in("id", memoryIds)
    .eq("dog_profile_id", dogProfileId)
    .eq("user_id", user.id);

  if (error) throw friendlyDatabaseError(error, "dog memories");
}

export async function loadDogProductFeedbackForUser(dogProfileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("dog_product_feedback")
    .select()
    .eq("dog_profile_id", dogProfileId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DogProductFeedbackRow[]>();

  if (error) throw friendlyDatabaseError(error, "product feedback");
  return data;
}

export async function toggleProductFeedbackForUser(
  input: ProductFeedbackInput,
  user: User,
): Promise<ToggleProductFeedbackResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: existing, error: existingError } = await supabase
    .from("dog_product_feedback")
    .select()
    .eq("dog_profile_id", input.dogProfileId)
    .eq("user_id", user.id)
    .eq("product_id", input.productId)
    .eq("feedback_type", input.feedbackType)
    .maybeSingle<DogProductFeedbackRow>();

  if (existingError) throw friendlyDatabaseError(existingError, "product feedback");
  if (existing) {
    await deleteProductFeedbackForUser(existing.id, input.dogProfileId, user);
    return { action: "removed", feedback: existing };
  }

  const { data, error } = await supabase
    .from("dog_product_feedback")
    .insert({
      user_id: user.id,
      dog_profile_id: input.dogProfileId,
      product_id: input.productId,
      product_name: input.productName,
      feedback_type: input.feedbackType,
      note: input.note?.trim() || null,
    })
    .select()
    .single<DogProductFeedbackRow>();

  if (error) {
    if (error.code === "23505") {
      const latest = await loadDogProductFeedbackForUser(input.dogProfileId, user);
      const duplicate = latest.find(
        (item) => item.product_id === input.productId && item.feedback_type === input.feedbackType,
      );
      if (duplicate) {
        await deleteProductFeedbackForUser(duplicate.id, input.dogProfileId, user);
        return { action: "removed", feedback: duplicate };
      }
    }
    throw friendlyDatabaseError(error, "product feedback");
  }

  return { action: "added", feedback: data };
}

export async function deleteProductFeedbackForUser(
  feedbackId: string,
  dogProfileId: string,
  user: User,
) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase
    .from("dog_product_feedback")
    .delete()
    .eq("id", feedbackId)
    .eq("dog_profile_id", dogProfileId)
    .eq("user_id", user.id);

  if (error) throw friendlyDatabaseError(error, "product feedback");
}

export async function saveDogMemories(
  dogProfileId: string,
  user: User,
  memories: MemoryInput[],
): Promise<SaveDogMemoriesResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  if (memories.length === 0) return { saved: [], skippedDuplicates: 0 };

  const { data: existingMemories, error: existingError } = await supabase
    .from("dog_memories")
    .select("text")
    .eq("dog_profile_id", dogProfileId)
    .eq("user_id", user.id)
    .returns<{ text: string }[]>();

  if (existingError) throw friendlyDatabaseError(existingError, "saved memories");

  const seen = new Set((existingMemories || []).map((memory) => normalizeMemoryText(memory.text)));
  let skippedDuplicates = 0;
  const rows = memories.flatMap((memory) => {
    const normalized = normalizeMemoryText(memory.text);
    if (!normalized || seen.has(normalized)) {
      skippedDuplicates += 1;
      return [];
    }

    seen.add(normalized);
    return [
      {
        user_id: user.id,
        dog_profile_id: dogProfileId,
        type: memory.type,
        text: memory.text.trim(),
        confidence: memory.confidence,
        source: memory.source || "ai_suggestion",
      },
    ];
  });

  if (rows.length === 0) return { saved: [], skippedDuplicates };

  const { data, error } = await supabase
    .from("dog_memories")
    .insert(rows)
    .select()
    .returns<DogMemoryRow[]>();

  if (error) throw friendlyDatabaseError(error, "saved memories");
  return { saved: data, skippedDuplicates };
}

export function dogProfileRowToDraft(row: DogProfileRow): DogProfile {
  const mainConcern = mainConcernFromText(row.main_concern);
  const otherConcern =
    mainConcern === "Other" && row.main_concern !== "Other" ? row.main_concern || "" : "";

  return normalizeProfile({
    ...initialProfile,
    name: row.name,
    species: row.species,
    breed: row.breed || "",
    age: row.age_value === null ? "" : String(row.age_value),
    ageUnit: row.age_unit === "months" ? "months" : "years",
    ageUnknown: row.age_value === null,
    weight: row.weight_value === null ? "" : String(row.weight_value),
    weightUnit: row.weight_unit === "kg" ? "kg" : "lb",
    weightUnknown: row.weight_value === null,
    currentFood: row.current_food || "",
    currentFoodUnknown: !row.current_food,
    mainConcern,
    otherConcern,
    wellnessGoal: normalizeWellnessGoal(row.wellness_goal),
    avoidIngredients: row.avoid_ingredients || [],
    monthlyBudget: row.monthly_budget === null ? "" : String(row.monthly_budget),
  });
}

function toDogProfilePayload(profile: DogProfile, userId: string) {
  return buildDogProfilePayload(profile, userId);
}

export function buildDogProfilePayload(profile: DogProfile, userId: string) {
  const age = profile.ageUnknown || !profile.age.trim() ? Number.NaN : parsePositiveNumber(profile.age);
  const weight = profile.weightUnknown || !profile.weight.trim() ? Number.NaN : parsePositiveNumber(profile.weight);
  const budget = profile.monthlyBudget.trim() ? parsePositiveNumber(profile.monthlyBudget) : Number.NaN;
  const wellnessGoal = normalizeWellnessGoal(
    (profile as DogProfile & { wellnessGoal?: string | null }).wellnessGoal,
  );

  return {
    user_id: userId,
    name: profile.name.trim(),
    species: normalizeSpecies(profile.species) || null,
    breed: profile.breed.trim() || null,
    age_value: Number.isFinite(age) ? age : null,
    age_unit: Number.isFinite(age) ? profile.ageUnit : null,
    weight_value: Number.isFinite(weight) ? weight : null,
    weight_unit: Number.isFinite(weight) ? profile.weightUnit : null,
    current_food: profile.currentFoodUnknown ? null : profile.currentFood.trim() || null,
    main_concern:
      profile.mainConcern === "Other" ? profile.otherConcern.trim() : profile.mainConcern || null,
    wellness_goal: wellnessGoal || null,
    avoid_ingredients: normalizeAvoidIngredientValues(profile.avoidIngredients),
    monthly_budget: Number.isFinite(budget) ? budget : null,
    updated_at: new Date().toISOString(),
  };
}

function mainConcernFromText(value: string | null): MainConcern | "" {
  return MAIN_CONCERN_OPTIONS.includes(value as (typeof MAIN_CONCERN_OPTIONS)[number])
    ? (value as MainConcern)
    : value
      ? "Other"
      : "";
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

function normalizeUserProfileRow(row: unknown): UserProfileRow | null {
  if (!row || typeof row !== "object") return null;
  const profile = row as Partial<UserProfileRow>;
  return {
    country: normalizeAccountProductCountry(profile.country) || null,
    country_detected_at:
      typeof profile.country_detected_at === "string" ? profile.country_detected_at : null,
    country_source: normalizeAccountCountrySource(profile.country_source) || null,
    country_updated_at:
      typeof profile.country_updated_at === "string" ? profile.country_updated_at : null,
    created_at: typeof profile.created_at === "string" ? profile.created_at : null,
    updated_at: typeof profile.updated_at === "string" ? profile.updated_at : null,
    user_id: typeof profile.user_id === "string" ? profile.user_id : "",
  };
}

function normalizeMemoryText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isDuplicateFurviseCareEntry(entry: CareEntryRow, input: CareEntryInput) {
  if (!isFurviseGeneratedCareEntry(entry)) return false;
  if (normalizeCareDedupText(entry.title || "") !== normalizeCareDedupText(input.title || "")) return false;

  const existingNote = normalizeCareDedupText(entry.note || "");
  const nextNote = normalizeCareDedupText(input.note || "");
  return existingNote === nextNote || existingNote.slice(0, 200) === nextNote.slice(0, 200);
}

function isFurviseGeneratedCareEntry(entry: Pick<CareEntryRow, "note" | "title">) {
  return /^furvise\b/i.test(entry.title || "") || /^furvise-generated (guidance|note)/i.test(entry.note || "");
}

function normalizeCareDedupText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function loadOptionalDogMemories(profileIds: string[], user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase || profileIds.length === 0) return [];

  const { data, error } = await supabase
    .from("dog_memories")
    .select()
    .in("dog_profile_id", profileIds)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DogMemoryRow[]>();

  if (error) {
    console.warn("Furvise could not load saved memories", { code: error.code });
    return [];
  }

  return data || [];
}

async function loadOptionalDogProductFeedback(profileIds: string[], user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase || profileIds.length === 0) return [];

  const { data, error } = await supabase
    .from("dog_product_feedback")
    .select()
    .in("dog_profile_id", profileIds)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DogProductFeedbackRow[]>();

  if (error) {
    console.warn("Furvise could not load product feedback", { code: error.code });
    return [];
  }

  return data || [];
}

function groupRowsByProfileId<T extends { dog_profile_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const current = grouped.get(row.dog_profile_id) || [];
    current.push(row);
    grouped.set(row.dog_profile_id, current);
  });
  return grouped;
}

async function requireCurrentUser(getter: (() => Promise<User | null>) | undefined) {
  const user = await (getter ? getter() : getCurrentUser());
  if (!user) {
    throw new Error("Please sign in again before continuing.");
  }
  return user;
}

async function ensurePetOwnership(
  profileId: string,
  user: User,
  getClient?: (() => SupabaseClient | null) | undefined,
) {
  const supabase = getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("dog_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (error) throw friendlyDatabaseError(error, "pet profile");
  if (!data) {
    throw new Error("Furvise could not find that pet for your account.");
  }

  return data;
}

function friendlyDatabaseError(error: { code?: string; message?: string }, label: string) {
  const missingTableCodes = new Set(["42P01", "PGRST205"]);
  if (error.code && missingTableCodes.has(error.code)) {
    return Object.assign(new Error(
      `Furvise could not find the ${label} table yet. Apply the Supabase schema, then try again.`,
    ), error);
  }

  if (error.code === "PGRST116") {
    return Object.assign(new Error(`Furvise could not find that ${label} for your account.`), error);
  }

  return Object.assign(new Error(`Furvise could not load ${label}. Please try again.`), error);
}

function friendlyDatabaseSaveError(error: { code?: string; message?: string }, label: string) {
  const missingTableCodes = new Set(["42P01", "PGRST205"]);
  if (error.code && missingTableCodes.has(error.code)) {
    return Object.assign(new Error(
      `Furvise could not find the ${label} table yet. Apply the Supabase schema, then try again.`,
    ), error);
  }

  return Object.assign(new Error(`Furvise could not save this ${label}. Please try again.`), error);
}
