"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import { AppPage } from "../../../components/app-page";
import { SimplePetProfileForm } from "../../../components/simple-pet-profile-form";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import { buildSimplePetProfileUpdate, validateSimplePetProfile } from "../../../lib/edit-pet-profile";
import { DogProfile, formatPetDisplayName, initialProfile } from "../../../lib/petwise";
import {
  dogProfileRowToDraft,
  getCurrentUser,
  getSupabaseConfigError,
  loadDogProfileForUser,
  saveDogProfileForUser,
} from "../../../lib/supabase";
import { petProfileDraftsEqual, reducePetProfileDraft } from "../../../lib/pet-profile-draft";

export default function EditDogProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const petId = params.id;
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, dispatchProfile] = useReducer(reducePetProfileDraft, initialProfile);
  const [savedProfile, setSavedProfile] = useState<DogProfile>(initialProfile);
  const loadedIdentityRef = useRef("");
  const [loading, setLoading] = useState(!configError);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = !petProfileDraftsEqual(profile, savedProfile);
  const profileHref = `/pets/${encodeURIComponent(petId)}`;
  const petName = formatPetDisplayName(profile.name || "Pet");

  useEffect(() => {
    let active = true;
    if (configError || authStatus !== "signedIn" || !authUser) return;

    const identity = `${authUser.id}:${petId}`;
    if (loadedIdentityRef.current === identity) return;
    loadedIdentityRef.current = identity;

    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const user = authUser;
        if (!user) return;
        const row = await loadDogProfileForUser(petId, user);
        if (!active) return;
        const nextProfile = dogProfileRowToDraft(row);
        setSavedProfile(nextProfile);
        dispatchProfile({ type: "load", profile: nextProfile });
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Furvise could not load that pet profile. Please try again.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, configError, petId]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);

  function updateProfile(update: Partial<DogProfile>) {
    dispatchProfile({ type: "patch", values: update });
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validationError = validateSimplePetProfile(profile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before saving.");
      const nextProfile = buildSimplePetProfileUpdate(savedProfile, profile);
      await saveDogProfileForUser(nextProfile, user, petId);
      setSavedProfile(nextProfile);
      router.push(profileHref);
      router.refresh();
    } catch {
      setError("Furvise could not save this pet profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage>
      <div className="mx-auto w-full max-w-[1180px] min-w-0 pb-10 sm:pb-16 lg:pb-20">
        <header>
          <Link className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[0.09em] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]" href={profileHref}>
            <span aria-hidden="true">←</span>&nbsp;{petName}
          </Link>
          <h1 className="mt-5 text-[2.25rem] font-bold leading-[1.04] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.75rem] lg:text-[3rem]">Edit {petName}</h1>
          <p className="mt-3 max-w-[42rem] text-base leading-7 text-[var(--text-secondary)] sm:text-lg">
            Change the details Furvise should use for {petName}.
          </p>
        </header>

        {configError ? (
          <StatusMessage tone="error">{configError}</StatusMessage>
        ) : loading ? (
          <StatusMessage>Loading pet profile...</StatusMessage>
        ) : error && !profile.name ? (
          <StatusMessage tone="error">{error}</StatusMessage>
        ) : (
          <SimplePetProfileForm
            cancelHref={profileHref}
            error={error}
            onChange={updateProfile}
            onSubmit={saveProfile}
            profile={profile}
            saving={saving}
          />
        )}
      </div>
    </AppPage>
  );
}

function StatusMessage({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "error" }) {
  return (
    <p className={`mt-6 border-y py-3 text-sm leading-6 ${tone === "error" ? "border-[var(--danger-text)] text-[var(--danger-text)]" : "border-[var(--line)] text-[var(--text-secondary)]"}`} role={tone === "error" ? "alert" : "status"}>{children}</p>
  );
}
