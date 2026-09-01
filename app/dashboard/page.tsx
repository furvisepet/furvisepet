"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppPage } from "../components/app-page";
import { EmptyState, LoadingState, Notice } from "../components/product-primitives";
import { getActivePetId, setActivePetId } from "../lib/active-pet";
import { persistAskDraft } from "../lib/ask-draft";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  CARE_ENTRY_CATEGORIES,
  formatCareEntryCategory,
  toLocalDateTimeInputValue,
} from "../lib/care-log.mjs";
import { readPhotoFile, saveLocalPhoto } from "../lib/local-pet-media";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import { activePetsOnly } from "../lib/pet-lifecycle";
import {
  buildTodayEntryDraft,
  buildTodayRecentEntries,
  formatTodayPetContext,
  formatTodayTimelineDate,
} from "../lib/today";
import {
  createCareEntry,
  getSupabaseConfigError,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  type CareEntryInput,
  type CareEntryWithPetName,
  type DogProfileWithMemories,
} from "../lib/supabase";
import styles from "./today-v2.module.css";

export default function TodayPage() {
  const appDataVersion = useAppDataVersion();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [hasRetainedProfiles, setHasRetainedProfiles] = useState(false);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(!configError);
  const [historyLoading, setHistoryLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [rememberNote, setRememberNote] = useState("");
  const [rememberCategory, setRememberCategory] = useState<CareEntryInput["category"]>("general");
  const [rememberOccurredAt, setRememberOccurredAt] = useState("");
  const [rememberPhoto, setRememberPhoto] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rememberSaving, setRememberSaving] = useState(false);
  const [rememberStatus, setRememberStatus] = useState("");
  const [askDraft, setAskDraft] = useState("");
  const rememberSavingRef = useRef(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (configError || authStatus !== "signedIn" || !user) return;
    let active = true;

    loadDogProfilesWithMemories(user)
      .then((profileRows) => {
        if (!active) return;
        const activeProfiles = activePetsOnly(profileRows);
        setProfiles(activeProfiles);
        setHasRetainedProfiles(activeProfiles.length < profileRows.length);
        const requestedPetId = new URLSearchParams(window.location.search).get("pet") || getActivePetId(window.localStorage);
        const nextPetId = activeProfiles.some((profile) => profile.id === requestedPetId)
          ? requestedPetId
          : activeProfiles[0]?.id || "";
        setSelectedPetId(nextPetId);
        if (nextPetId) setActivePetId(window.localStorage, nextPetId);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load Today.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    listRecentCareEntries(50)
      .then((entryRows) => {
        if (active) setEntries(entryRows);
      })
      .catch((loadError) => {
        if (active) setHistoryError(loadError instanceof Error ? loadError.message : "Recent notes could not be loaded.");
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => { active = false; };
  }, [appDataVersion, authStatus, configError, user]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedPetId) ?? profiles[0] ?? null;
  const recentEntries = useMemo(
    () => selectedProfile ? buildTodayRecentEntries(entries, selectedProfile.id) : [],
    [entries, selectedProfile],
  );
  const rememberDraft = buildTodayEntryDraft(null, rememberNote);

  function switchProfile(petId: string) {
    if (petId === selectedPetId) return;
    setSelectedPetId(petId);
    setActivePetId(window.localStorage, petId);
    setAskDraft("");
    setRememberStatus("");
  }

  async function saveRememberedNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !rememberDraft || rememberSavingRef.current) return;
    rememberSavingRef.current = true;
    setRememberSaving(true);
    setRememberStatus("");
    try {
      const entry = await createCareEntry({
        ...rememberDraft,
        category: rememberCategory,
        occurredAt: rememberOccurredAt || toLocalDateTimeInputValue(),
        petProfileId: selectedProfile.id,
      });
      if (rememberPhoto) saveLocalPhoto("care", entry.id, rememberPhoto);
      setEntries((current) => [{ ...entry, pet_name: selectedProfile.name }, ...current]);
      setRememberNote("");
      setRememberCategory("general");
      setRememberOccurredAt("");
      setRememberPhoto("");
      setDetailsOpen(false);
      setRememberStatus("Remembered.");
    } catch (saveError) {
      setRememberStatus(saveError instanceof Error ? saveError.message : "Furvise could not remember this yet.");
    } finally {
      rememberSavingRef.current = false;
      setRememberSaving(false);
    }
  }

  function openDetails() {
    setDetailsOpen((current) => !current);
    setRememberOccurredAt((current) => current || toLocalDateTimeInputValue());
  }

  function routeQuestionToAsk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !askDraft.trim()) return;
    persistAskDraft(window.localStorage, null, selectedProfile.id, askDraft.trim());
    window.location.assign(`/ask?pet=${encodeURIComponent(selectedProfile.id)}`);
  }

  return (
    <AppPage layout="workspace" shell="today">
      <div className={styles.page} data-ui="today-v2-file">
        {configError || error ? <Notice tone="warning">{configError || error}</Notice> : null}
        {loading ? <LoadingState label="Loading Today" /> : null}

        {!loading && !configError && !error && profiles.length === 0 ? (
          <EmptyState
            action={(
              <Link className={styles.primaryAction} href={hasRetainedProfiles ? "/pets" : NEW_PET_ONBOARDING_PATH}>
                {hasRetainedProfiles ? "VIEW PETS" : "ADD YOUR PET"}
              </Link>
            )}
            description={hasRetainedProfiles ? "Archived and passed-away profiles remain available from Pets and History." : "Add a pet before starting their file."}
            title={hasRetainedProfiles ? "No active pets" : "Start with your pet"}
          />
        ) : null}

        {!loading && selectedProfile ? (
          <>
            <header className={styles.fileHeader}>
              <div className={styles.petContextRow}>
                <p className={styles.petContext}>{formatTodayPetContext(selectedProfile)}</p>
                {profiles.length > 1 ? (
                  <label className={styles.petSwitcher}>
                    <span className="sr-only">Pet shown on Today</span>
                    <select onChange={(event) => switchProfile(event.target.value)} value={selectedProfile.id}>
                      {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              <h1 className={styles.todayTitle}>TODAY</h1>
            </header>

            <section aria-label={`${selectedProfile.name}'s recent timeline`} className={styles.timeline} data-ui="today-v2-timeline">
              {historyLoading ? <LoadingState label="Loading recent notes" /> : null}
              {!historyLoading && historyError ? <Notice tone="warning">Recent notes are temporarily unavailable. You can still remember something new.</Notice> : null}
              {!historyLoading && !historyError && recentEntries.length ? (
                <ol className={styles.timelineList}>
                  {recentEntries.map((entry) => (
                    <li className={styles.timelineEntry} key={entry.id}>
                      <Link href={`/care-log?pet=${encodeURIComponent(entry.pet_profile_id)}&entry=${encodeURIComponent(entry.id)}`}>
                        <time className={styles.timelineDate} dateTime={entry.occurred_at}>{formatTodayTimelineDate(entry.occurred_at)}</time>
                        <span className={styles.timelineText}>{entry.note}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : null}
              {!historyLoading && !historyError && recentEntries.length === 0 ? (
                <div className={styles.timelineEmpty} data-ui="today-v2-empty">
                  <p>Nothing on the file yet.</p>
                  <p>When something matters, put it here.</p>
                </div>
              ) : null}
            </section>

            <div className={styles.liveEdge} data-ui="today-v2-live-edge">
              <section aria-labelledby="remember-heading" className={styles.composerSection}>
                <h2 className={styles.sectionLabel} id="remember-heading">WHAT HAPPENED?</h2>
                <form onSubmit={saveRememberedNote}>
                  <label className="sr-only" htmlFor="today-remember-note">What happened?</label>
                  <textarea
                    className={styles.rememberInput}
                    id="today-remember-note"
                    onChange={(event) => setRememberNote(event.target.value)}
                    placeholder="What happened?"
                    value={rememberNote}
                  />
                  <div className={styles.composerUtilities}>
                    <button aria-expanded={detailsOpen} className={styles.quietAction} onClick={openDetails} type="button">Add details</button>
                    <button className={styles.quietAction} onClick={() => photoInputRef.current?.click()} type="button">{rememberPhoto ? "Photo added" : "Add photo"}</button>
                    <input
                      accept="image/*"
                      aria-label="Choose a photo for this memory"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return setRememberPhoto("");
                        void readPhotoFile(file)
                          .then(setRememberPhoto)
                          .catch((photoError) => setRememberStatus(photoError instanceof Error ? photoError.message : "Furvise could not read that photo."));
                      }}
                      ref={photoInputRef}
                      type="file"
                    />
                  </div>
                  {detailsOpen ? (
                    <div className={styles.details} data-ui="today-v2-details">
                      <label>
                        <span>Category</span>
                        <select onChange={(event) => setRememberCategory(event.target.value as CareEntryInput["category"])} value={rememberCategory}>
                          {CARE_ENTRY_CATEGORIES.map((category) => <option key={category} value={category}>{formatCareEntryCategory(category)}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Date and time</span>
                        <input onChange={(event) => setRememberOccurredAt(event.target.value)} type="datetime-local" value={rememberOccurredAt} />
                      </label>
                    </div>
                  ) : null}
                  <button className={styles.primaryAction} disabled={!rememberDraft || rememberSaving} type="submit">
                    {rememberSaving ? "REMEMBERING" : "REMEMBER"}
                  </button>
                  {rememberStatus ? <p className={styles.status} role="status">{rememberStatus}</p> : null}
                </form>
              </section>

              <section aria-labelledby="ask-heading" className={styles.composerSection}>
                <h2 className={styles.sectionLabel} id="ask-heading">ASK ABOUT {selectedProfile.name.toLocaleUpperCase()}</h2>
                <form onSubmit={routeQuestionToAsk}>
                  <label className="sr-only" htmlFor="today-ask-question">Ask anything about {selectedProfile.name}</label>
                  <input
                    className={styles.askInput}
                    id="today-ask-question"
                    onChange={(event) => setAskDraft(event.target.value)}
                    placeholder={`Ask anything about ${selectedProfile.name}...`}
                    value={askDraft}
                  />
                  <button className={styles.primaryAction} disabled={!askDraft.trim()} type="submit">ASK</button>
                </form>
              </section>
            </div>

            <Link className={styles.historyLink} href={`/care-log?pet=${encodeURIComponent(selectedProfile.id)}`}>Full story <span aria-hidden="true">→</span> History</Link>
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
