"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "./app-page";
import { CareEntryForm } from "./care-entry-form";
import { CareTimeline } from "./care-timeline";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  createCareEntry,
  deleteCareEntry,
  getSupabaseConfigError,
  listCareEntriesForPet,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  updateCareEntry,
  type CareEntryInput,
  type CareEntryRow,
  type DogProfileWithMemories,
} from "../lib/supabase";
import {
  CARE_ENTRY_CATEGORIES,
  formatCareEntryCategory,
  normalizeCareEntryDraft,
  resolveCareLogInitialPetId,
} from "../lib/care-log.mjs";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";

type Props = { petProfileId?: string; scope: "global" | "pet" };

export function CareLogWorkspace({ petProfileId = "", scope }: Props) {
  const searchParams = useSearchParams();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryRow[]>([]);
  const [loading, setLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [selectedPet, setSelectedPet] = useState(scope === "pet" ? petProfileId : searchParams.get("pet") || "all");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "all");
  const [overlayOpen, setOverlayOpen] = useState(searchParams.get("new") === "1");
  const [editingEntry, setEditingEntry] = useState<CareEntryRow | null>(null);
  const [viewingEntry, setViewingEntry] = useState<CareEntryRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CareEntryRow | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isPetScope = scope === "pet";

  useEffect(() => {
    if (configError) return;
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function load() {
      try {
        const user = authUser;
        if (!user) return;
        const [profileRows, entryRows] = await Promise.all([
          loadDogProfilesWithMemories(user),
          isPetScope ? listCareEntriesForPet(petProfileId) : listRecentCareEntries(200),
        ]);
        if (active) {
          setProfiles(profileRows);
          setEntries(entryRows);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load care history.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, configError, isPetScope, petProfileId]);

  const activeOverlayOpen = overlayOpen || searchParams.get("new") === "1";
  const activeViewingEntry =
    viewingEntry ||
    entries.find((entry) => entry.id === searchParams.get("entry")) ||
    null;

  useEffect(() => {
    if (!activeOverlayOpen && !pendingDelete && !activeViewingEntry) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingDelete) setPendingDelete(null);
      else if (activeViewingEntry) {
        setViewingEntry(null);
        const params = new URLSearchParams(window.location.search);
        params.delete("entry");
        const query = params.toString();
        window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
      } else {
        setOverlayOpen(false);
        setEditingEntry(null);
        const params = new URLSearchParams(window.location.search);
        params.delete("new");
        const query = params.toString();
        window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeOverlayOpen, activeViewingEntry, pendingDelete]);

  const petNameById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, formatPetDisplayName(profile.name)])),
    [profiles],
  );
  const targetPet = profiles.find((profile) => profile.id === petProfileId);
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (isPetScope && entry.pet_profile_id !== petProfileId) return false;
        if (!isPetScope && selectedPet !== "all" && entry.pet_profile_id !== selectedPet) return false;
        return selectedCategory === "all" || entry.category === selectedCategory;
      }),
    [entries, isPetScope, petProfileId, selectedCategory, selectedPet],
  );
  const initialPetId = resolveCareLogInitialPetId({
    editingPetId: editingEntry?.pet_profile_id || "",
    isPetScope,
    petProfileId,
    profiles,
    selectedPet,
  });

  function openCreate() {
    setEditingEntry(null);
    setOverlayOpen(true);
  }

  function closeOverlay() {
    setOverlayOpen(false);
    setEditingEntry(null);
    removeTransientSearchParams();
  }

  function closeDetails() {
    setViewingEntry(null);
    removeTransientSearchParams();
  }

  function removeTransientSearchParams() {
    const params = new URLSearchParams(window.location.search);
    params.delete("new");
    params.delete("entry");
    replaceSearchParams(params);
  }

  function updateFilter(name: "pet" | "category", value: string) {
    if (name === "pet") setSelectedPet(value);
    else setSelectedCategory(value);
    const params = new URLSearchParams(window.location.search);
    params.delete("new");
    params.delete("entry");
    if (value === "all") params.delete(name);
    else params.set(name, value);
    replaceSearchParams(params);
  }

  function clearFilters() {
    setSelectedPet("all");
    setSelectedCategory("all");
    replaceSearchParams(new URLSearchParams());
  }

  function replaceSearchParams(params: URLSearchParams) {
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }

  async function saveEntry(input: CareEntryInput) {
    const normalized = normalizeCareEntryDraft(input) as CareEntryInput;
    return editingEntry ? updateCareEntry(editingEntry.id, normalized) : createCareEntry(normalized);
  }

  function handleSaved(entry: CareEntryRow) {
    setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()));
    setStatus(editingEntry ? "Update saved." : "Update added.");
    closeOverlay();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteCareEntry(pendingDelete.id);
      setEntries((current) => current.filter((item) => item.id !== pendingDelete.id));
      setStatus("Update deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Furvise could not delete that update.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <AppPage>
      <div className="mx-auto w-full max-w-5xl">
        <header className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
          {isPetScope ? <Link className="text-sm font-semibold text-[var(--pw-primary)]" href={`/pets/${petProfileId}?tab=care-history`}>← Open pet profile</Link> : null}
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
            {isPetScope && targetPet ? `${formatPetDisplayName(targetPet.name)}'s care history` : "Care history"}
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--pw-muted)]">
            {isPetScope ? "A chronological view of this pet's updates." : "Review updates across pets and filter the timeline when you need context."}
          </p>
          </div>
          {!configError && !error && !loading && profiles.length > 0 ? (
            <button
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] sm:w-auto sm:shrink-0 sm:justify-self-end"
              onClick={openCreate}
              type="button"
            >
              Log update
            </button>
          ) : null}
        </header>

      {configError || error ? <Status text={configError || error} tone="warn" /> : loading ? <Status text="Loading care history…" /> : profiles.length === 0 ? (
        <section className="mt-8 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
          <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Add a pet before logging care updates.</h2>
          <Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white" href={NEW_PET_ONBOARDING_PATH}>Add your first pet</Link>
        </section>
      ) : (
        <div className="mt-8 grid gap-5">
          {status ? <Status text={status} /> : null}
          {!isPetScope ? (
            <section aria-label="Care history filters" className="grid min-w-0 gap-3 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 sm:grid-cols-2">
              <Filter label="Pet" value={selectedPet} onChange={(value) => updateFilter("pet", value)}>
                <option value="all">All pets</option>
                {profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {formatPetDisplayName(profile.name)} ({formatSpecies(profile.species)})
                  </option>
                ))}
              </Filter>
              <Filter label="Category" value={selectedCategory} onChange={(value) => updateFilter("category", value)}>
                <option value="all">All categories</option>
                {CARE_ENTRY_CATEGORIES.map((category) => <option value={category} key={category}>{formatCareEntryCategory(category)}</option>)}
              </Filter>
            </section>
          ) : null}
          {visibleEntries.length === 0 ? (
            <section className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
              <h2 className="text-xl font-semibold text-[var(--pw-heading)]">
                {entries.length ? "No updates match these filters." : "No updates yet"}
              </h2>
              {entries.length ? (
                <button className="mt-3 text-sm font-semibold text-[var(--pw-primary)]" onClick={clearFilters} type="button">Clear filters</button>
              ) : (
                <button className="mt-3 text-sm font-semibold text-[var(--pw-primary)]" onClick={openCreate} type="button">Log the first update</button>
              )}
            </section>
          ) : (
            <CareTimeline entries={visibleEntries} emptyMessage="No updates match these filters." onDelete={setPendingDelete} onEdit={(entry) => { setViewingEntry(null); setEditingEntry(entry); setOverlayOpen(true); }} onOpen={setViewingEntry} petNameById={petNameById} showPetName={!isPetScope} />
          )}
        </div>
      )}
      </div>

      {activeOverlayOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-5" role="presentation">
          <section aria-labelledby="update-dialog-title" aria-modal="true" className="max-h-[100dvh] w-full overflow-y-auto bg-[var(--pw-app-background)] p-4 shadow-2xl sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl sm:p-5" role="dialog">
            <div className="mb-3 flex justify-end">
              <button ref={closeRef} aria-label="Close update form" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] text-xl" onClick={closeOverlay} type="button">×</button>
            </div>
            <span className="sr-only" id="update-dialog-title">{editingEntry ? "Edit update" : "Log update"}</span>
            <CareEntryForm
              key={`${editingEntry?.id || "new"}-${initialPetId}`}
              initialEntry={editingEntry}
              initialPetId={initialPetId}
              lockedPetId={isPetScope ? petProfileId : null}
              onCancel={closeOverlay}
              onSaved={handleSaved}
              onSubmit={saveEntry}
              pets={profiles}
            />
          </section>
        </div>
      ) : null}

      {activeViewingEntry ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-5" role="presentation">
          <section aria-labelledby="update-details-title" aria-modal="true" className="w-full bg-[var(--pw-surface)] p-6 shadow-2xl sm:max-w-xl sm:rounded-3xl" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--pw-primary)]">{formatCareEntryCategory(activeViewingEntry.category)}</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--pw-heading)]" id="update-details-title">{activeViewingEntry.title || "Update details"}</h2>
              </div>
              <button aria-label="Close update details" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--pw-border)] text-xl" onClick={closeDetails} type="button">×</button>
            </div>
            <p className="mt-5 whitespace-pre-wrap leading-7 text-[var(--pw-text)]">{activeViewingEntry.note}</p>
            <div className="mt-6 flex justify-end">
              <button className="min-h-11 rounded-full border border-[var(--pw-border-strong)] px-5 text-sm font-semibold" onClick={closeDetails} type="button">Close</button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <section aria-labelledby="delete-title" aria-modal="true" className="w-full max-w-md rounded-3xl bg-[var(--pw-surface)] p-6" role="alertdialog">
            <h2 className="text-xl font-semibold text-[var(--pw-heading)]" id="delete-title">Delete update?</h2>
            <p className="mt-3 text-[var(--pw-muted)]">This permanently removes the update.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button className="min-h-11 rounded-full border border-[var(--pw-border)] px-4 font-semibold" onClick={() => setPendingDelete(null)} type="button">Cancel</button>
              <button className="min-h-11 rounded-full bg-[var(--pw-danger-surface)] px-4 font-semibold text-[var(--pw-danger-text)]" onClick={confirmDelete} type="button">Delete</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppPage>
  );
}

function Filter({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="flex-1"><span className="mb-1 block text-xs font-semibold text-[var(--pw-subtle)]">{label}</span><select className="min-h-11 w-full rounded-xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-3 text-sm font-semibold text-[var(--pw-text)]" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function Status({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  return <div className={`mt-8 rounded-3xl border p-5 ${tone === "warn" ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]" : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]"}`} role="status">{text}</div>;
}
