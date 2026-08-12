"use client";

import { createBrowserClient } from "@supabase/ssr";
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
import type { PetConcern } from "./ai/concern-engine";
import type { FurviseMemoryRow } from "./intelligence/types";
import { idempotentClientFetch } from "./security/idempotency/client.ts";

export const PROFILE_ID_STORAGE_KEY = "petwise:dog-profile-id";
export const PROFILE_MEMORIES_STORAGE_KEY = "petwise:dog-profile-memories";
const AUTH_PERSISTENCE_STORAGE_KEY = "petwise:auth-persistence";
const SESSION_AUTH_COOKIE = "furvise-auth-session";

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
  sex?: "female" | "male" | "not_sure" | null;
  routine_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type PetProfileRow = DogProfileRow;

export type DogMemoryRow = {
  id: string;
  user_id: string;
  dog_profile_id: string;
  type: string | null;
  text: string;
  confidence: string | null;
  source: string | null;
  created_at: string;
  status?: "active" | "superseded" | "rejected";
  superseded_by?: string | null;
};

export type PetMemoryRow = DogMemoryRow;

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

export type PetProductFeedbackRow = DogProductFeedbackRow;

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
  concern_id?: string | null;
  intelligence_source_message_id?: string | null;
  intelligence_source_type?: string | null;
  intelligence_confidence?: number | null;
  state_action_type?: string | null;
  care_event_metadata?: Record<string, unknown> | null;
  episode_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
};

export type CareEntryWithPetName = CareEntryRow & {
  pet_name: string;
};

export type CreateCareEntryUnlessDuplicateResult =
  | { action: "created"; entry: CareEntryRow }
  | { action: "duplicate"; entry: CareEntryRow };

export type CareEntryRemovalResult = {
  removedFromHistory: true;
};

export type DogProfileWithMemories = DogProfileRow & {
  dog_memories: DogMemoryRow[];
  dog_product_feedback?: DogProductFeedbackRow[];
};

export type PetProfileWithMemories = DogProfileWithMemories;

export type CanonicalRememberedDetailsRows = {
  canonical: FurviseMemoryRow[];
  legacy: DogMemoryRow[];
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

function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof window === "undefined") {
    return null;
  }

  return createBrowserClient(normalizeSupabaseUrl(url), key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll: readDocumentCookies,
      setAll(cookiesToSet) {
        const sessionOnly = getBrowserAuthPersistence() === "session";
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeBrowserCookie(name, value, sessionOnly && options.maxAge !== 0
            ? { ...options, expires: undefined, maxAge: undefined }
            : options);
        });
      },
    },
    isSingleton: false,
  });
}

export function setBrowserSupabasePersistence(mode: BrowserAuthPersistence | null) {
  setBrowserAuthPersistence(mode);
  if (typeof document !== "undefined") {
    document.cookie = mode === "session"
      ? `${SESSION_AUTH_COOKIE}=1; Path=/; SameSite=Lax`
      : `${SESSION_AUTH_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  }
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
  void user;
  const response = await authenticatedApiFetch("/api/account/product-country", {
    body: JSON.stringify({ country }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null) as { error?: string; profile?: unknown } | null;
  if (!response.ok) throw new Error(payload?.error || "The account profile could not be saved.");
  const profile = normalizeUserProfileRow(payload?.profile);
  if (!profile) throw new Error("The account profile could not be saved.");
  return profile;
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

  const response = await idempotentClientFetch("/api/account/detect-country", {
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  }, "account-country-detect");
  const payload = await response.json().catch(() => null) as { profile?: unknown } | null;
  if (!response.ok) return null;
  return normalizeUserProfileRow(payload?.profile);
}

export async function saveDogProfileForUser(
  profile: DogProfile,
  _user: User,
  existingProfileId?: string | null,
) {
  const response = await authenticatedApiFetch(existingProfileId ? `/api/pets/${existingProfileId}` : "/api/pets", {
    body: JSON.stringify({ profile }),
    headers: { "content-type": "application/json" },
    method: existingProfileId ? "PATCH" : "POST",
  });
  const payload = await response.json().catch(() => null) as { error?: string; profile?: DogProfileRow } | null;
  if (!response.ok || !payload?.profile) throw new Error(payload?.error || "The pet profile could not be saved.");
  return payload.profile;
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
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .returns<CareEntryRow[]>();

  if (error) throw normalizeCareDatabaseError(error, "care entries");
  return data || [];
}

export async function listActiveConcernsForPet(petProfileId: string, deps: CareLogHelperDeps = {}) {
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const user = await requireCurrentUser(deps.getCurrentUser);
  await ensurePetOwnership(petProfileId, user, deps.getClient);
  const { data, error } = await supabase
    .from("pet_concerns")
    .select("*")
    .eq("pet_profile_id", petProfileId)
    .eq("user_id", user.id)
    .in("status", ["active", "monitoring", "reopened"])
    .order("updated_at", { ascending: false })
    .returns<PetConcern[]>();
  if (error) throw friendlyDatabaseError(error, "active concerns");
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
    .is("deleted_at", null)
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
  if (!deps.getClient && !deps.getCurrentUser) {
    const response = await authenticatedApiFetch("/api/care-entries", {
      body: JSON.stringify({ input }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => null) as { entry?: CareEntryRow; error?: string } | null;
    if (!response.ok || !payload?.entry) throw new Error(payload?.error || "The care entry could not be saved.");
    return payload.entry;
  }
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
  if (!deps.getClient && !deps.getCurrentUser) {
    const response = await authenticatedApiFetch("/api/care-entries", {
      body: JSON.stringify({ dedupe: true, input }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => null) as (CreateCareEntryUnlessDuplicateResult & { error?: string }) | null;
    if (!response.ok || !payload?.entry) throw new Error(payload?.error || "The care entry could not be saved.");
    return payload;
  }
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
    .is("deleted_at", null)
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
  if (!deps.getClient && !deps.getCurrentUser) {
    const response = await authenticatedApiFetch(`/api/care-entries/${entryId}`, {
      body: JSON.stringify({ input }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });
    const payload = await response.json().catch(() => null) as { entry?: CareEntryRow; error?: string } | null;
    if (!response.ok || !payload?.entry) throw new Error(payload?.error || "The care entry could not be saved.");
    return payload.entry;
  }
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
    .is("deleted_at", null)
    .select()
    .single<CareEntryRow>();

  if (error) throw normalizeCareDatabaseError(error, "care entry");
  return data;
}

export async function removeCareEntryFromHistory(entryId: string): Promise<CareEntryRemovalResult> {
  const response = await authenticatedApiFetch(`/api/care-entries/${entryId}`, {
    method: "DELETE",
  });
  const payload = await response.json().catch(() => null) as (CareEntryRemovalResult & { error?: string }) | null;
  if (!response.ok || !payload?.removedFromHistory) throw new Error(payload?.error || "The care entry could not be removed.");
  return payload;
}

export async function deleteCareEntry(entryId: string, deps: CareLogHelperDeps = {}) {
  if (!deps.getClient && !deps.getCurrentUser) {
    await removeCareEntryFromHistory(entryId);
    return;
  }
  const supabase = deps.getClient?.() ?? getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const user = await requireCurrentUser(deps.getCurrentUser);
  const { data: existing, error: existingError } = await supabase
    .from("pet_care_entries")
    .select("id,deleted_at")
    .eq("id", entryId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; deleted_at: string | null }>();

  if (existingError) throw normalizeCareDatabaseError(existingError, "care entry");
  if (!existing) {
    throw new Error("Furvise could not find that care entry for your account.");
  }

  const { error } = await supabase.rpc("remove_my_care_entry", {
    p_entry_id: entryId,
    p_stop_tracking: true,
  });

  if (error) throw normalizeCareDatabaseError(error, "care entry");
}

export async function loadDogProfileWithMemoriesForUser(profileId: string, user: User) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [profile, memories] = await Promise.all([
    supabase.from("dog_profiles").select("*").eq("id", profileId).eq("user_id", user.id).single<DogProfileRow>(),
    supabase.from("dog_memories").select("*").eq("dog_profile_id", profileId).eq("user_id", user.id)
      .eq("status", "active").order("created_at", { ascending: false }).returns<DogMemoryRow[]>(),
  ]);
  if (profile.error) throw friendlyDatabaseError(profile.error, "pet profile memories");
  if (memories.error) throw friendlyDatabaseError(memories.error, "pet profile memories");
  return { ...profile.data, dog_memories: memories.data || [], dog_product_feedback: [] } as DogProfileWithMemories;
}

export async function loadCanonicalRememberedDetailsForUser(profileId: string, user: User): Promise<CanonicalRememberedDetailsRows> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [canonical, legacy] = await Promise.all([
    supabase.from("furvise_memories").select("*").eq("user_id", user.id).eq("status", "active")
      .or(`pet_id.eq.${profileId},pet_id.is.null`).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("last_confirmed_at", { ascending: false }).returns<FurviseMemoryRow[]>(),
    supabase.from("dog_memories").select("*").eq("dog_profile_id", profileId).eq("user_id", user.id)
      .eq("status", "active").order("created_at", { ascending: false }).returns<DogMemoryRow[]>(),
  ]);
  if (canonical.error) throw friendlyDatabaseError(canonical.error, "remembered details");
  if (legacy.error) throw friendlyDatabaseError(legacy.error, "remembered details");
  return {
    canonical: (canonical.data || []).filter((memory) => memory.subject_type === "owner" || memory.pet_id === profileId),
    legacy: legacy.data || [],
  };
}

export async function deleteDogProfileForUser(profileId: string, _user: User) {
  void _user;
  const response = await authenticatedApiFetch(`/api/pets/${profileId}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "The pet profile could not be deleted.");
  }
}

export async function deleteDogMemoryForUser(memoryId: string, dogProfileId: string, user: User) {
  await deleteDogMemoriesForUser([memoryId], dogProfileId, user);
}

export async function deleteDogMemoriesForUser(
  memoryIds: string[],
  dogProfileId: string,
  _user: User,
) {
  void _user;
  if (memoryIds.length === 0) return;
  const response = await authenticatedApiFetch("/api/legacy-memories", {
    body: JSON.stringify({ memoryIds, petId: dogProfileId }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Remembered details could not be removed.");
  }
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

  const response = await authenticatedApiFetch("/api/product-feedback", {
    body: JSON.stringify(input), headers: { "content-type": "application/json" }, method: "POST",
  });
  const payload = await response.json().catch(() => null) as { error?: string; feedback?: DogProductFeedbackRow } | null;
  if (!response.ok || !payload?.feedback) throw new Error(payload?.error || "Product feedback could not be saved.");
  return { action: "added", feedback: payload.feedback };
}

export async function deleteProductFeedbackForUser(
  feedbackId: string,
  dogProfileId: string,
  user: User,
) {
  void user;
  const response = await authenticatedApiFetch("/api/product-feedback", {
    body: JSON.stringify({ dogProfileId, feedbackId }), headers: { "content-type": "application/json" }, method: "DELETE",
  });
  if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; throw new Error(payload?.error || "Product feedback could not be removed."); }
}

export async function saveDogMemories(
  dogProfileId: string,
  _user: User,
  memories: MemoryInput[],
): Promise<SaveDogMemoriesResult> {
  if (memories.length === 0) return { saved: [], skippedDuplicates: 0 };
  const response = await authenticatedApiFetch("/api/legacy-memories", {
    body: JSON.stringify({ memories, petId: dogProfileId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null) as (SaveDogMemoriesResult & { error?: string }) | null;
  if (!response.ok || !payload?.saved) throw new Error(payload?.error || "Remembered details could not be saved.");
  return payload;
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
    avoidIngredientsNoneKnown: Array.isArray(row.avoid_ingredients) && row.avoid_ingredients.length === 0,
    monthlyBudget: row.monthly_budget === null ? "" : String(row.monthly_budget),
    sex: row.sex || "",
    routineNote: row.routine_note || "",
  });
}

// Generic application aliases keep the current tables compatible while callers migrate away from dog-only names.
export const countPetProfilesForUser = countDogProfilesForUser;
export const deletePetProfileForUser = deleteDogProfileForUser;
export const loadPetProductFeedbackForUser = loadDogProductFeedbackForUser;
export const loadPetProfileForUser = loadDogProfileForUser;
export const loadPetProfilesWithMemories = loadDogProfilesWithMemories;
export const loadPetProfileWithMemoriesForUser = loadDogProfileWithMemoriesForUser;
export const petProfileRowToDraft = dogProfileRowToDraft;
export const savePetMemories = saveDogMemories;
export const savePetProfileForUser = saveDogProfileForUser;

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
    avoid_ingredients: profile.avoidIngredientsNoneKnown
      ? []
      : profile.avoidIngredients.length
        ? normalizeAvoidIngredientValues(profile.avoidIngredients)
        : null,
    monthly_budget: Number.isFinite(budget) ? budget : null,
    sex: profile.sex || null,
    routine_note: profile.routineNote?.trim() || null,
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

function readDocumentCookies() {
  if (typeof document === "undefined" || !document.cookie) return [];
  return document.cookie.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    try {
      return [{
        name: decodeURIComponent(part.slice(0, separator).trim()),
        value: decodeURIComponent(part.slice(separator + 1).trim()),
      }];
    } catch {
      return [];
    }
  });
}

function serializeBrowserCookie(
  name: string,
  value: string,
  options: {
    domain?: string;
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    secure?: boolean;
  },
) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) {
    const sameSite = options.sameSite === true ? "Strict" : `${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`;
    parts.push(`SameSite=${sameSite}`);
  }
  return parts.join("; ");
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
    .eq("status", "active")
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

async function authenticatedApiFetch(path: string, init: RequestInit) {
  const token = await getCurrentAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  const authenticatedInit = { ...init, credentials: "same-origin" as const, headers };
  const method = (init.method || "GET").toUpperCase();
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE"
    ? idempotentClientFetch(path, authenticatedInit, `${method}:${path}`)
    : fetch(path, authenticatedInit);
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
  if (error.message?.includes("PET_LIMIT_REACHED")) {
    return Object.assign(new Error("Your plan's pet limit was reached before this pet could be added."), error, { code: "PET_LIMIT_REACHED" });
  }
  const missingTableCodes = new Set(["42P01", "PGRST205"]);
  if (error.code && missingTableCodes.has(error.code)) {
    return Object.assign(new Error(
      `Furvise could not find the ${label} table yet. Apply the Supabase schema, then try again.`,
    ), error);
  }

  return Object.assign(new Error(`Furvise could not save this ${label}. Please try again.`), error);
}

export function isPetLimitReachedError(error: unknown) {
  return error instanceof Error && ("code" in error && error.code === "PET_LIMIT_REACHED" || error.message.includes("PET_LIMIT_REACHED") || error.message.includes("pet limit was reached"));
}
