"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import { AppPage } from "../../../components/app-page";
import { PageHeader } from "../../../components/product-primitives";
import { SimplePetProfileForm } from "../../../components/simple-pet-profile-form";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import { buildSimplePetProfileUpdate, validateSimplePetProfile } from "../../../lib/edit-pet-profile";
import { markAppDataChanged } from "../../../lib/navigation/app-data-freshness";
import { clearDeletedPetClientState } from "../../../lib/pet-delete-client-state";
import { DogProfile, formatPetDisplayName, initialProfile } from "../../../lib/petwise";
import { idempotentClientFetch } from "../../../lib/security/idempotency/client";
import {
  dogProfileRowToDraft,
  getBrowserSupabase,
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteInputRef = useRef<HTMLInputElement | null>(null);
  const deletionCompletedRef = useRef(false);
  const deletingRef = useRef(false);
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
      if (deletionCompletedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (deletionCompletedRef.current) return;
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

  useEffect(() => {
    if (!deleteOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || deletingRef.current) return;
      setDeleteOpen(false);
      setDeleteConfirmation("");
      setDeleteError("");
      window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.setTimeout(() => deleteInputRef.current?.focus(), 0);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deleteOpen]);

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

  function openDeleteConfirmation() {
    setDeleteOpen(true);
    setDeleteConfirmation("");
    setDeleteError("");
  }

  function closeDeleteConfirmation() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteConfirmation("");
    setDeleteError("");
    window.setTimeout(() => deleteTriggerRef.current?.focus(), 0);
  }

  async function deletePet() {
    if (deleting || deleteConfirmation !== "DELETE" || !authUser) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      const client = getBrowserSupabase();
      const { data } = await client?.auth.getSession() || { data: { session: null } };
      if (!data.session?.access_token) throw new Error("Sign in again to continue.");
      const response = await idempotentClientFetch(
        `/api/pets/${encodeURIComponent(petId)}`,
        {
          body: JSON.stringify({ confirmation: "DELETE" }),
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          method: "DELETE",
        },
        `pet-delete:${petId}`,
      );
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 404) {
        finishPetDeletion();
        return;
      }
      if (!response.ok) {
        const fallback = response.status === 429
          ? "Too many deletion attempts. Please wait and try again."
          : response.status === 503
            ? "Furvise could not delete this pet right now. Please try again."
            : "This pet could not be deleted.";
        throw new Error(payload?.error || fallback);
      }
      finishPetDeletion();
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "This pet could not be deleted.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  function finishPetDeletion() {
    deletionCompletedRef.current = true;
    setSavedProfile(profile);
    clearDeletedPetClientState({ localStorage: window.localStorage, sessionStorage: window.sessionStorage }, petId, authUser?.id || "");
    markAppDataChanged();
    router.replace("/pets");
    router.refresh();
  }

  return (
    <AppPage>
      <div className="mx-auto w-full max-w-[1180px] min-w-0 pb-10 sm:pb-16 lg:pb-20">
        <PageHeader
          eyebrow="PETS"
          supportingText={`Change the details Furvise uses for ${petName}.`}
          title={`EDIT ${petName.toUpperCase()}`}
        />

        {configError ? (
          <StatusMessage tone="error">{configError}</StatusMessage>
        ) : loading ? (
          <StatusMessage>Loading pet profile...</StatusMessage>
        ) : error && !profile.name ? (
          <StatusMessage tone="error">{error}</StatusMessage>
        ) : (
          <>
            <SimplePetProfileForm
              cancelHref={profileHref}
              error={error}
              onChange={updateProfile}
              onSubmit={saveProfile}
              profile={profile}
              saving={saving}
            />

            <section aria-labelledby="delete-pet-heading" className="mt-20 border-t border-[var(--line)] pt-10 sm:mt-24">
              <h2 className="app-section-title text-[var(--danger-text)]" id="delete-pet-heading">DELETE PET</h2>
              <p className="mt-3 max-w-[640px] leading-7 text-[var(--text-secondary)]">Remove {petName} from your Furvise account.</p>
              {!deleteOpen ? (
                <button ref={deleteTriggerRef} className="mt-6 inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={openDeleteConfirmation} type="button">Delete pet</button>
              ) : (
                <div aria-labelledby="delete-pet-confirmation-heading" className="mt-7 max-w-[640px] border-y border-[var(--line)] py-7" data-ui="delete-pet-confirmation" role="region">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]" id="delete-pet-confirmation-heading">Permanently delete {petName}?</h3>
                  <p className="mt-3 leading-7 text-[var(--text-secondary)]">This permanently removes {petName}&apos;s profile and Furvise data directly tied to it, including care history, memories, current tracking, Ask conversations, Vet Briefs, and suggestions. Limited provenance and security records may be retained. This cannot be undone.</p>
                  <p className="mt-3 leading-7 text-[var(--text-secondary)]">If your session is older than 15 minutes, you&apos;ll need to sign in again.</p>
                  <label className="mt-6 block text-sm font-semibold text-[var(--text-primary)]" htmlFor="delete-pet-confirmation">Type DELETE to confirm</label>
                  <input ref={deleteInputRef} aria-describedby={deleteError ? "delete-pet-error" : undefined} autoComplete="off" className="mt-2 min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--input-border)] bg-[var(--input-background)] px-3.5 text-base text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" id="delete-pet-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <button aria-busy={deleting || undefined} className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:text-[var(--disabled-text)] sm:w-auto" disabled={deleting || deleteConfirmation !== "DELETE"} onClick={() => void deletePet()} type="button">{deleting ? "Deleting pet..." : `Permanently delete ${petName}`}</button>
                    <button className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed sm:w-auto" disabled={deleting} onClick={closeDeleteConfirmation} type="button">Cancel</button>
                  </div>
                  <div aria-live="assertive">
                    {deleteError ? <p className="mt-5 border-y border-[var(--danger-text)] py-3 text-sm leading-6 text-[var(--danger-text)]" id="delete-pet-error" role="alert">{deleteError}</p> : null}
                  </div>
                </div>
              )}
            </section>
          </>
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
