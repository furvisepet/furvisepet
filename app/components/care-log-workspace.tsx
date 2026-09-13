"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "./app-page";
import { CareEntryForm } from "./care-entry-form";
import { CareTimeline } from "./care-timeline";
import { EmptyState, PageHeader, PrimaryButton, SecondaryButton, TextButton } from "./product-primitives";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  createCareEntry,
  getSupabaseConfigError,
  listCareEntriesForPet,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  removeCareEntryFromHistory,
  updateCareEntry,
  type CareEntryInput,
  type CareEntryRow,
  type DogProfileWithMemories,
} from "../lib/supabase";
import {
  CARE_ENTRY_CATEGORIES,
  formatCareEntryCategory,
  formatCareEntryTitle,
  normalizeCareEntryDraft,
  resolveCareLogInitialPetId,
} from "../lib/care-log.mjs";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import { activePetsOnly, getPetLifecycleStatus, isActivePet } from "../lib/pet-lifecycle";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";

type Props = { petProfileId?: string; scope: "global" | "pet" };

export function CareLogWorkspace({ petProfileId = "", scope }: Props) {
  const appDataVersion = useAppDataVersion();
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
  const [removing, setRemoving] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(25);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
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
  }, [appDataVersion, authStatus, authUser, configError, isPetScope, petProfileId]);

  const activeOverlayOpen = overlayOpen || searchParams.get("new") === "1";
  const activeViewingEntry =
    viewingEntry ||
    entries.find((entry) => entry.id === searchParams.get("entry")) ||
    null;

  useEffect(() => {
    if (!activeOverlayOpen && !pendingDelete && !activeViewingEntry) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        return;
      }
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
  const activeProfiles = useMemo(() => activePetsOnly(profiles), [profiles]);
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (isPetScope && entry.pet_profile_id !== petProfileId) return false;
        if (!isPetScope && selectedPet !== "all" && entry.pet_profile_id !== selectedPet) return false;
        return selectedCategory === "all" || entry.category === selectedCategory;
      }),
    [entries, isPetScope, petProfileId, selectedCategory, selectedPet],
  );
  const displayedEntries = visibleEntries.slice(0, visibleLimit);
  const formProfiles = editingEntry
    ? profiles.filter((profile) => isActivePet(profile) || profile.id === editingEntry.pet_profile_id)
    : activeProfiles;
  const initialPetId = resolveCareLogInitialPetId({
    editingPetId: editingEntry?.pet_profile_id || "",
    isPetScope,
    petProfileId,
    profiles: formProfiles,
    selectedPet,
  });
  const briefPetId = isPetScope
    ? petProfileId
    : selectedPet !== "all"
      ? selectedPet
      : profiles.length === 1
        ? profiles[0].id
        : "";
  const selectedProfile = profiles.find((profile) => profile.id === (isPetScope ? petProfileId : selectedPet)) || (profiles.length === 1 ? profiles[0] : null);
  const canCreateUpdate = isPetScope ? Boolean(targetPet && isActivePet(targetPet)) : activeProfiles.length > 0;
  const emptyHistoryName = selectedProfile ? formatPetDisplayName(selectedProfile.name) : "";

  function openCreate() {
    if (!canCreateUpdate) return;
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
    setVisibleLimit(25);
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
    setVisibleLimit(25);
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

  function prepareRemoval(entry: CareEntryRow) {
    setPendingDelete(entry);
    setError("");
  }

  function cancelRemoval() {
    if (removing) return;
    setPendingDelete(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setRemoving(true);
    try {
      await removeCareEntryFromHistory(pendingDelete.id);
      setEntries((current) => current.filter((item) => item.id !== pendingDelete.id));
      setStatus("Deleted. Furvise will no longer use this event.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Furvise could not remove that update.");
    } finally {
      setPendingDelete(null);
      setRemoving(false);
    }
  }

  return (
    <AppPage layout="workspace" shell="reading">
      <div className="w-full">
        <PageHeader
          actions={!configError && !error && !loading && profiles.length > 0 ? <>
            {briefPetId && entries.length ? <SecondaryButton href={`/vet-brief?pet=${encodeURIComponent(briefPetId)}&source=care-history`}>{selectedProfile && !isActivePet(selectedProfile) ? "Prepare care summary" : "Prepare vet brief"}</SecondaryButton> : null}
            {entries.length && canCreateUpdate ? <PrimaryButton className="w-full py-3 sm:w-auto sm:shrink-0" onClick={openCreate} type="button">Add update</PrimaryButton> : null}
          </> : null}
          eyebrow={isPetScope ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pw-primary)]" href={`/pets/${petProfileId}?tab=care-history`}>← Open pet profile</Link> : undefined}
          title={isPetScope && targetPet ? `${formatPetDisplayName(targetPet.name)}'s history` : "History"}
          supportingText={isPetScope ? "A chronological view of this pet's updates." : "Everything you have recorded for your pets, in one timeline."}
        />

      {configError || error ? <Status text={configError || error} tone="warn" /> : loading ? <Status text="Loading care history…" /> : profiles.length === 0 ? (
        <section className="mt-8 rounded-3xl border border-[color-mix(in_srgb,var(--pw-border)_72%,transparent)] bg-[var(--pw-section-history)] p-6">
          <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Add your first pet before logging care updates.</h2>
          <PrimaryButton className="mt-5" href={NEW_PET_ONBOARDING_PATH}>Add your first pet</PrimaryButton>
        </section>
      ) : (
        <div className="mt-8 grid gap-5">
          {status ? <Status text={status} /> : null}
          {!isPetScope && entries.length ? (
            <section aria-label="History filters" className="flex min-w-0 flex-col gap-3 border-b border-[var(--line)] pb-4 sm:max-w-[560px] sm:flex-row sm:items-end">
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
          {entries.length === 0 ? (
            <section className="max-w-[700px] rounded-2xl border border-[var(--line)] bg-[var(--surface-interactive)] px-6 py-9 shadow-[0_8px_24px_var(--shadow)] sm:px-8" aria-labelledby="empty-history-title">
              <h2 className="text-[1.4rem] font-semibold tracking-[-0.015em] text-[var(--text-primary)]" id="empty-history-title">{selectedProfile && !isActivePet(selectedProfile) ? `${emptyHistoryName}'s history is preserved` : emptyHistoryName ? `Start ${emptyHistoryName}'s history` : "Start your pets' history"}</h2>
              <p className="mt-2 max-w-[580px] text-[1.02rem] leading-7 text-[var(--text-secondary)]">{selectedProfile && !isActivePet(selectedProfile) ? `This ${getPetLifecycleStatus(selectedProfile)} profile remains available for history review.` : "Food changes, routines, symptoms, products, and small observations will appear here in order."}</p>
              <div className="mt-5 flex flex-wrap items-center gap-2">{canCreateUpdate ? <PrimaryButton onClick={openCreate}>Add first update</PrimaryButton> : null}<SecondaryButton href={selectedProfile ? `/ask?pet=${selectedProfile.id}` : "/ask"}>{emptyHistoryName ? `Ask about ${emptyHistoryName}` : "Ask about your pets"}</SecondaryButton></div>
            </section>
          ) : visibleEntries.length === 0 ? (
            <EmptyState
              action={<TextButton onClick={clearFilters}>Clear filters</TextButton>}
              description="Try a different pet or category."
              title="Nothing matches these filters"
            />
          ) : (
            <>
              <CareTimeline entries={displayedEntries} emptyMessage="No updates match these filters." onDelete={prepareRemoval} onEdit={(entry) => { setViewingEntry(null); setEditingEntry(entry); setOverlayOpen(true); }} onOpen={setViewingEntry} petNameById={petNameById} showPetName={!isPetScope} />
              {displayedEntries.length < visibleEntries.length ? (
                <div className="w-full pt-1">
                  <SecondaryButton onClick={() => setVisibleLimit((current) => current + 25)} type="button">Load older updates</SecondaryButton>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
      </div>

      {activeOverlayOpen && (Boolean(editingEntry) || canCreateUpdate) ? (
        <div className="fixed inset-0 z-[var(--z-dialog)] flex items-end justify-center bg-[var(--pw-overlay)] sm:items-center sm:p-5" role="presentation">
          <section aria-labelledby="update-dialog-title" aria-modal="true" className="max-h-[100dvh] w-full overflow-y-auto bg-[var(--pw-app-background)] p-4 shadow-2xl sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl sm:p-5" ref={dialogRef} role="dialog">
            <div className="mb-3 flex justify-end">
              <button ref={closeRef} aria-label="Close update form" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] text-xl" onClick={closeOverlay} type="button">×</button>
            </div>
            <span className="sr-only" id="update-dialog-title">{editingEntry ? "Edit update" : "Add update"}</span>
            <CareEntryForm
              key={`${editingEntry?.id || "new"}-${initialPetId}`}
              initialEntry={editingEntry}
              initialPetId={initialPetId}
              lockedPetId={isPetScope ? petProfileId : null}
              onCancel={closeOverlay}
              onSaved={handleSaved}
              onSubmit={saveEntry}
              pets={formProfiles}
            />
          </section>
        </div>
      ) : null}

      {activeViewingEntry ? (
        <div className="fixed inset-0 z-[var(--z-dialog)] flex items-end justify-center bg-[var(--pw-overlay)] sm:items-center sm:p-5" role="presentation">
          <section aria-labelledby="update-details-title" aria-modal="true" className="w-full border border-[color-mix(in_srgb,var(--pw-border)_72%,transparent)] bg-[var(--pw-surface-elevated)] p-6 shadow-2xl sm:max-w-xl sm:rounded-3xl" ref={dialogRef} role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--pw-primary)]">{formatCareEntryCategory(activeViewingEntry.category)}</p>
                <h2 className="mt-1 text-2xl font-semibold text-[var(--pw-heading)]" id="update-details-title">{formatCareEntryTitle(activeViewingEntry)}</h2>
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
        <div className="fixed inset-0 z-[var(--z-critical-overlay)] flex items-center justify-center bg-[var(--pw-overlay)] p-4">
          <section aria-labelledby="delete-title" aria-modal="true" className="w-full max-w-md rounded-3xl border border-[color-mix(in_srgb,var(--pw-border)_72%,transparent)] bg-[var(--pw-surface-elevated)] p-6" ref={dialogRef} role="alertdialog">
            <h2 className="text-xl font-semibold text-[var(--pw-heading)]" id="delete-title">Delete this History event?</h2>
            <p className="mt-3 text-[var(--pw-muted)]">Furvise will stop remembering, tracking, and using this event. Internal audit links may be retained.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button className="min-h-11 rounded-full border border-[var(--pw-border)] px-4 font-semibold" disabled={removing} onClick={cancelRemoval} type="button">Cancel</button>
              <button className="min-h-11 rounded-full bg-[var(--pw-danger-surface)] px-4 font-semibold text-[var(--pw-danger-text)]" disabled={removing} onClick={() => void confirmDelete()} type="button">{removing ? "Deleting..." : "Delete"}</button>
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
  return <div className={`mt-8 rounded-3xl border p-5 ${tone === "warn" ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]" : "border-[color-mix(in_srgb,var(--pw-border)_72%,transparent)] bg-[var(--pw-section-note)] text-[var(--pw-muted)]"}`} role="status">{text}</div>;
}
