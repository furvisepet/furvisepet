import type { SupabaseClient } from "@supabase/supabase-js";
import { clearActivePetId } from "./active-pet";
import { clearAskClientState } from "./ask-conversations";
import { clearNewPetOnboardingState } from "./onboarding-drafts";
import { setBrowserSupabasePersistence } from "./supabase";
import { enforceVetBriefDraftAccountBoundary } from "./vet-brief/client-drafts";

export async function signOutOfFurvise(client: SupabaseClient) {
  const { data: currentAuth } = await client.auth.getUser();
  const { error } = await client.auth.signOut();
  if (error) throw error;

  clearNewPetOnboardingState(
    { localStorage: window.localStorage, sessionStorage: window.sessionStorage },
    currentAuth.user?.id || "",
  );
  clearActivePetId(window.localStorage);
  clearAskClientState(window.localStorage);
  clearAskClientState(window.sessionStorage);
  enforceVetBriefDraftAccountBoundary(window.localStorage, null);
  setBrowserSupabasePersistence(null);
}
