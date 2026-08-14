"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "../components/app-page";
import { CareEntryMetadata } from "../components/care-entry-metadata";
import { LocalPetIdentity } from "../components/local-photo";
import { TodayGreeting } from "../components/today-greeting";
import {
  EmptyState,
  LoadingState,
  Notice,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Section,
  Select,
  TextButton,
  ToggleButton,
  todayPrimaryLayout,
} from "../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { getActivePetId, setActivePetId } from "../lib/active-pet";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { formatCareNotePreview, toLocalDateTimeInputValue } from "../lib/care-log.mjs";
import { getFinishProfileItemsFromRow } from "../lib/finish-profile";
import { readPhotoFile, saveLocalPhoto } from "../lib/local-pet-media";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import {
  buildTodayEntryDraft,
  buildTodayRecentEntries,
  TODAY_EVENT_ACTIONS,
  TODAY_EVERYTHING_NORMAL_ACTION,
  toggleTodayQuickAction,
  type TodayQuickActionId,
} from "../lib/today";
import {
  getSupabaseConfigError,
  createCareEntry,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  type CareEntryWithPetName,
  type DogProfileWithMemories,
} from "../lib/supabase";

export default function TodayPage() {
  const appDataVersion = useAppDataVersion();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(!configError);
  const [historyLoading, setHistoryLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [selectedQuickAction, setSelectedQuickAction] = useState<TodayQuickActionId | null>(null);
  const [quickPhoto, setQuickPhoto] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickStatus, setQuickStatus] = useState("");
  const quickNoteRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const quickSavingRef = useRef(false);

  useEffect(() => {
    if (configError || authStatus !== "signedIn" || !user) return;
    let active = true;
    loadDogProfilesWithMemories(user)
      .then((profileRows) => {
        if (!active) return;
        setProfiles(profileRows);
        const requestedPetId = new URLSearchParams(window.location.search).get("pet") || getActivePetId(window.localStorage);
        const nextPetId = profileRows.some((profile) => profile.id === requestedPetId) ? requestedPetId : profileRows[0]?.id || "";
        setSelectedPetId(nextPetId);
        if (nextPetId) setActivePetId(window.localStorage, nextPetId);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load Today.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    listRecentCareEntries(20)
      .then((entryRows) => {
        if (active) setEntries(entryRows);
      })
      .catch((loadError) => {
        if (active) setHistoryError(loadError instanceof Error ? loadError.message : "Recent history could not be loaded.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [appDataVersion, authStatus, configError, user]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedPetId) ?? profiles[0] ?? null;
  const petName = selectedProfile ? formatPetDisplayName(selectedProfile.name) : "your pet";
  const recentEntries = useMemo(
    () => selectedProfile ? buildTodayRecentEntries(entries, selectedProfile.id) : [],
    [entries, selectedProfile],
  );
  const quickEntryDraft = buildTodayEntryDraft(selectedQuickAction, quickNote, Boolean(quickPhoto));
  const missingItems = selectedProfile
    ? getFinishProfileItemsFromRow(selectedProfile)
    : [];
  const profileChecklist = PROFILE_CHECKLIST_FIELDS.filter((item) => missingItems.some((missing) => missing.key === item.key));
  const profileNeedsCompletion = profileChecklist.length > 0;

  async function saveQuickUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !quickEntryDraft || quickSavingRef.current) return;
    quickSavingRef.current = true;
    setQuickSaving(true);
    setQuickStatus("");
    try {
      const entry = await createCareEntry({ ...quickEntryDraft, occurredAt: toLocalDateTimeInputValue(), petProfileId: selectedProfile.id });
      if (quickPhoto) saveLocalPhoto("care", entry.id, quickPhoto);
      setEntries((current) => [{ ...entry, pet_name: petName }, ...current]);
      setQuickNote("");
      setSelectedQuickAction(null);
      setQuickPhoto("");
      setQuickStatus("Update added.");
    } catch (saveError) {
      setQuickStatus(saveError instanceof Error ? saveError.message : "Furvise could not save this update.");
    } finally {
      quickSavingRef.current = false;
      setQuickSaving(false);
    }
  }

  function focusQuickNote() {
    requestAnimationFrame(() => quickNoteRef.current?.focus());
  }

  function handleQuickAction(id: TodayQuickActionId) {
    setSelectedQuickAction((current) => toggleTodayQuickAction(current, id));
    if (id === "add_photo") requestAnimationFrame(() => photoInputRef.current?.click());
    else focusQuickNote();
  }

  async function saveEverythingNormal() {
    if (!selectedProfile || quickSavingRef.current) return;
    quickSavingRef.current = true;
    setQuickSaving(true);
    setQuickStatus("");
    try {
      const entry = await createCareEntry({
        category: TODAY_EVERYTHING_NORMAL_ACTION.category,
        note: TODAY_EVERYTHING_NORMAL_ACTION.note,
        occurredAt: toLocalDateTimeInputValue(),
        petProfileId: selectedProfile.id,
        title: TODAY_EVERYTHING_NORMAL_ACTION.title,
      });
      setEntries((current) => [{ ...entry, pet_name: petName }, ...current]);
      setQuickStatus("Update added.");
    } catch (saveError) {
      setQuickStatus(saveError instanceof Error ? saveError.message : "Furvise could not save this update.");
    } finally {
      quickSavingRef.current = false;
      setQuickSaving(false);
    }
  }

  return (
    <AppPage layout="workspace" shell="today">
      <div className={todayPrimaryLayout} data-ui="today-primary-content">
      <PageHeader
        title={<TodayGreeting />}
        supportingText={selectedProfile ? `Here is what may be useful for ${petName} today.` : "A calm place to keep the details that matter."}
      />

      {configError || error ? <div className="mt-8"><Notice tone="warning">{configError || error}</Notice></div> : null}
      {loading ? <LoadingState label="Loading Today" /> : null}

      {!loading && !configError && !error && profiles.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            action={<PrimaryButton href={NEW_PET_ONBOARDING_PATH}>Add your first pet</PrimaryButton>}
            description="Create a profile to start keeping everyday changes, questions, and vet notes together."
            title="Start with your pet"
          />
        </div>
      ) : null}

      {!loading && selectedProfile ? (
        <div className="mt-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface-interactive)] p-5 shadow-[0_8px_24px_var(--shadow)] sm:flex-row sm:items-center sm:justify-between">
            <LocalPetIdentity detail={formatSpecies(selectedProfile.species)} id={selectedProfile.id} name={petName} />
            {profiles.length > 1 ? (
              <div className="w-full sm:w-56">
                <Select aria-label="Pet shown on Today" label="Pet" onChange={(event) => { setSelectedPetId(event.target.value); setActivePetId(window.localStorage, event.target.value); }} value={selectedProfile.id}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{formatPetDisplayName(profile.name)}</option>)}
                </Select>
              </div>
            ) : null}
          </div>

          {profileNeedsCompletion ? (
            <section aria-labelledby="today-focus-heading" className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-4 shadow-[var(--shadow-surface-1)] sm:p-5 md:flex md:items-center md:justify-between md:gap-6" data-ui="today-profile-focus">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-6 text-[var(--text-primary)]" id="today-focus-heading">Make {petName}&apos;s guidance more specific</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Add details whenever you know them.</p>
                <ul aria-label={`${petName}'s profile checklist`} className="mt-3 flex flex-wrap gap-2">
                  {profileChecklist.map((item) => (
                    <li key={item.key}>
                      <Link aria-label={`Add ${item.label.toLowerCase()} for ${petName}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-primary)] px-3 text-sm font-semibold text-[var(--deep-forest)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={`/pets/${selectedProfile.id}/edit`}>
                        <span aria-hidden="true" className="font-bold">+</span>{item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 shrink-0 md:mt-0">
                <SecondaryButton href={`/pets/${selectedProfile.id}/edit`}>Complete profile</SecondaryButton>
              </div>
            </section>
          ) : null}

          <Section className="mt-6 rounded-2xl border border-[var(--selection-strong)] bg-[var(--surface-supportive)] px-5 shadow-[0_12px_32px_var(--shadow)] sm:px-7" compact>
            <form onSubmit={saveQuickUpdate}>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">Anything worth remembering?</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Save a change, symptom, treatment, appointment, or anything you may want to remember later.</p>
                <label className="sr-only" htmlFor="today-quick-update">Details to remember</label>
                <textarea className="mt-4 min-h-24 w-full resize-y rounded-xl border border-[var(--input-border)] bg-[var(--input-background)] px-4 py-3 text-base outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[var(--focus)]" id="today-quick-update" onChange={(event) => setQuickNote(event.target.value)} placeholder="A change in appetite, behavior, food, symptoms, medication, routine, or anything else…" ref={quickNoteRef} value={quickNote} />
              </div>
              <fieldset className="mt-5">
                <legend className="text-sm font-semibold text-[var(--text-primary)]">Choose a category <span className="ml-1 font-normal text-[var(--text-secondary)]">Optional</span></legend>
                <div className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap" data-ui="today-quick-update-grid">
                  {TODAY_EVENT_ACTIONS.map((action) => {
                    const selected = selectedQuickAction === action.id;
                    return (
                      <ToggleButton
                        className="w-full sm:w-auto"
                        key={action.id}
                        onClick={() => handleQuickAction(action.id)}
                        pressed={selected}
                        type="button"
                      >
                        {action.label}
                      </ToggleButton>
                    );
                  })}
                </div>
                <input accept="image/*" aria-label="Choose a photo for this update" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return setQuickPhoto(""); void readPhotoFile(file).then(setQuickPhoto).catch((photoError) => setQuickStatus(photoError instanceof Error ? photoError.message : "Furvise could not read that photo.")); }} ref={photoInputRef} type="file" />
              </fieldset>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                <SecondaryButton disabled={quickSaving} onClick={saveEverythingNormal} type="button">Everything seems normal</SecondaryButton>
                <PrimaryButton className="w-full sm:w-auto" disabled={!quickEntryDraft || quickSaving} loading={quickSaving} type="submit">Add update</PrimaryButton>
              </div>
            </form>
            {quickStatus ? <p className="mt-3 text-sm text-[var(--text-secondary)]" role="status">{quickStatus}</p> : null}
          </Section>

          <div className="flex flex-wrap gap-2 border-b border-[var(--line)] py-5">
            <SecondaryButton href={`/ask?pet=${encodeURIComponent(selectedProfile.id)}`}>Ask about {petName}</SecondaryButton>
            {recentEntries.length ? <SecondaryButton href={`/vet-brief?pet=${encodeURIComponent(selectedProfile.id)}&source=dashboard`}>Prepare vet brief</SecondaryButton> : null}
          </div>

          <Section title="Recent history">
            {historyLoading ? <div className="mt-5"><LoadingState label="Loading recent history" /></div> : null}
            {!historyLoading && historyError ? <div className="mt-5"><Notice tone="warning">Recent history is temporarily unavailable. You can still add an update.</Notice></div> : null}
            {!historyLoading && !historyError && recentEntries.length ? (
              <><ul aria-label={`${petName}'s recent history`} className="mt-5 max-w-[760px] divide-y divide-[var(--line)] rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-primary)] px-4 sm:px-5">
                {recentEntries.map((entry) => (
                  <li className="py-4" key={entry.id}>
                    <Link className="group block min-w-0 rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={`/care-log?pet=${entry.pet_profile_id}&entry=${entry.id}`}>
                      <CareEntryMetadata category={entry.category} occurredAt={entry.occurred_at} petName={petName} />
                      <span className="mt-1 block break-words text-sm font-medium leading-6 text-[var(--text-primary)] group-hover:text-[var(--ghost-action-foreground)]">{formatCareNotePreview(entry.note, 180)}</span>
                    </Link>
                  </li>
                ))}
              </ul><TextButton className="mt-3" href={`/care-log?pet=${encodeURIComponent(selectedProfile.id)}`}>View full history</TextButton></>
            ) : (
              !historyLoading && !historyError ? <div className="mt-5">
                <EmptyState
                  description="Add anything you may want to remember later, even if it seems small today."
                  title={`${petName}'s story starts with the first note.`}
                />
              </div> : null
            )}
          </Section>
        </div>
      ) : null}
      </div>
    </AppPage>
  );
}

const PROFILE_CHECKLIST_FIELDS = [
  { key: "breed", label: "Breed" },
  { key: "current_food", label: "Current food" },
  { key: "avoid_ingredients", label: "Ingredients to avoid" },
  { key: "weight", label: "Weight" },
  { key: "main_concern", label: "Main care goal" },
  { key: "monthly_budget", label: "Monthly care budget" },
] as const;
