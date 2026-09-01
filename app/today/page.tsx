"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppPage } from "../components/app-page";
import { LoadingState, Notice } from "../components/product-primitives";
import { getActivePetId, setActivePetId } from "../lib/active-pet";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  CARE_ENTRY_CATEGORIES,
  formatCareEntryCategory,
  toLocalDateTimeInputValue,
} from "../lib/care-log.mjs";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import { activePetsOnly } from "../lib/pet-lifecycle";
import {
  buildTodayEntryDraft,
  createTodayRecentState,
  failTodayRecentRequest,
  formatTodayPetContext,
  formatTodayTimelineDate,
  getTodayVisibleRecentEntries,
  prependConfirmedTodayEntry,
  resolveTodayRecentRequest,
  selectTodayRecentPet,
  startTodayRecentRequest,
  TODAY_REMEMBER_EXAMPLES,
} from "../lib/today";
import {
  createCareEntry,
  getSupabaseConfigError,
  listRecentCareEntriesForPet,
  loadDogProfilesWithMemories,
  type CareEntryInput,
  type DogProfileWithMemories,
} from "../lib/supabase";
import styles from "./today.module.css";

export default function TodayPage() {
  const appDataVersion = useAppDataVersion();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [recentState, setRecentState] = useState(createTodayRecentState);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [rememberNote, setRememberNote] = useState("");
  const [rememberCategory, setRememberCategory] = useState<CareEntryInput["category"]>("general");
  const [rememberOccurredAt, setRememberOccurredAt] = useState(() => toLocalDateTimeInputValue());
  const [rememberSaving, setRememberSaving] = useState(false);
  const [rememberError, setRememberError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const rememberSavingRef = useRef(false);
  const recentRequestIdRef = useRef(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setExampleIndex(Math.floor(Math.random() * TODAY_REMEMBER_EXAMPLES.length));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (configError || authStatus !== "signedIn" || !user) return;
    let active = true;

    loadDogProfilesWithMemories(user)
      .then((profileRows) => {
        if (!active) return;
        const activeProfiles = activePetsOnly(profileRows);
        const requestedPetId = new URLSearchParams(window.location.search).get("pet") || getActivePetId(window.localStorage);
        const nextPetId = activeProfiles.some((profile) => profile.id === requestedPetId)
          ? requestedPetId
          : activeProfiles[0]?.id || "";
        setProfiles(activeProfiles);
        setSelectedPetId(nextPetId);
        setRecentState((current) => selectTodayRecentPet(current, nextPetId));
        if (nextPetId) setActivePetId(window.localStorage, nextPetId);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load Today.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [appDataVersion, authStatus, configError, user]);

  useEffect(() => {
    if (!selectedPetId || authStatus !== "signedIn") return;
    let active = true;
    const requestId = ++recentRequestIdRef.current;
    setRecentState((current) => startTodayRecentRequest(current, selectedPetId, requestId));
    listRecentCareEntriesForPet(selectedPetId, 10)
      .then((entryRows) => {
        if (active) setRecentState((current) => resolveTodayRecentRequest(current, selectedPetId, requestId, entryRows));
      })
      .catch((loadError) => {
        if (active) {
          const message = loadError instanceof Error ? loadError.message : "Recent notes could not be loaded.";
          setRecentState((current) => failTodayRecentRequest(current, selectedPetId, requestId, message));
        }
      });
    return () => { active = false; };
  }, [appDataVersion, authStatus, selectedPetId]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedPetId) ?? profiles[0] ?? null;
  const recentEntries = selectedProfile ? getTodayVisibleRecentEntries(recentState, selectedProfile.id) : [];
  const rememberDraft = buildTodayEntryDraft(null, rememberNote);

  function switchProfile(petId: string) {
    if (petId === selectedPetId) return;
    setSelectedPetId(petId);
    setActivePetId(window.localStorage, petId);
    setRecentState((current) => selectTodayRecentPet(current, petId));
    setRememberError("");
  }

  async function saveRememberedNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile || !rememberDraft || rememberSavingRef.current) return;
    rememberSavingRef.current = true;
    setRememberSaving(true);
    setRememberError("");
    try {
      const entry = await createCareEntry({
        ...rememberDraft,
        category: rememberCategory,
        occurredAt: rememberOccurredAt,
        petProfileId: selectedProfile.id,
      });
      setRecentState((current) => prependConfirmedTodayEntry(current, selectedProfile.id, entry));
      setRememberNote("");
      setRememberCategory("general");
      setRememberOccurredAt(toLocalDateTimeInputValue());
      setDetailsOpen(false);
    } catch (saveError) {
      setRememberError(saveError instanceof Error ? saveError.message : "Furvise could not remember this yet.");
    } finally {
      rememberSavingRef.current = false;
      setRememberSaving(false);
    }
  }

  return (
    <AppPage layout="workspace" shell="today">
      <div className={styles.page} data-ui="today-present-file">
        {configError || error ? <Notice tone="warning">{configError || error}</Notice> : null}
        {loading ? <LoadingState label="Loading Today" /> : null}

        {!loading && !configError && !error && profiles.length === 0 ? (
          <section className={styles.noPet}>
            <h1>Start with your pet</h1>
            <p>Add a pet before starting their file.</p>
            <Link className={styles.primaryAction} data-ui="today-add-pet-action" href={NEW_PET_ONBOARDING_PATH}>ADD YOUR PET</Link>
          </section>
        ) : null}

        {!loading && selectedProfile ? (
          <>
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

            <section aria-labelledby="remember-heading" className={styles.composer} data-ui="today-remember-composer">
              <h1 className={styles.question} id="remember-heading">Anything you want Furvise to remember?</h1>
              <form onSubmit={saveRememberedNote}>
                <label className="sr-only" htmlFor="today-remember-note">Something worth remembering</label>
                <textarea
                  className={styles.rememberInput}
                  id="today-remember-note"
                  onChange={(event) => setRememberNote(event.target.value)}
                  placeholder={TODAY_REMEMBER_EXAMPLES[exampleIndex]}
                  value={rememberNote}
                />
                <button
                  aria-controls="today-remember-details"
                  aria-expanded={detailsOpen}
                  className={styles.detailsToggle}
                  onClick={() => setDetailsOpen((current) => !current)}
                  type="button"
                >
                  {detailsOpen ? "Hide details" : "Add details"}
                </button>
                {detailsOpen ? (
                  <div className={styles.metadataFields} id="today-remember-details">
                    <label>
                      <span>Category</span>
                      <select onChange={(event) => setRememberCategory(event.target.value as CareEntryInput["category"])} value={rememberCategory}>
                        {CARE_ENTRY_CATEGORIES.map((category) => <option key={category} value={category}>{formatCareEntryCategory(category)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>When</span>
                      <input onChange={(event) => setRememberOccurredAt(event.target.value)} type="datetime-local" value={rememberOccurredAt} />
                    </label>
                  </div>
                ) : null}
                <button className={styles.primaryAction} data-ui="today-remember-action" disabled={!rememberDraft || rememberSaving} type="submit">
                  {rememberSaving ? "REMEMBERING" : "REMEMBER"}
                </button>
                {rememberError ? <p className={styles.error} role="alert">{rememberError}</p> : null}
              </form>
            </section>

            {recentState.error ? <div className={styles.recentNotice}><Notice tone="warning">Recent notes are temporarily unavailable. You can still remember something new.</Notice></div> : null}
            {recentEntries.length ? (
              <section aria-labelledby="recent-heading" className={styles.recent} data-ui="today-recent">
                <h2 className={styles.recentHeading} id="recent-heading">RECENT</h2>
                <ol className={styles.recentList}>
                  {recentEntries.map((entry) => (
                    <li className={styles.recentEntry} key={entry.id}>
                      <p className={styles.recentMetadata}>
                        <time dateTime={entry.occurred_at}>{formatTodayTimelineDate(entry.occurred_at)}</time>
                        <span aria-hidden="true"> · </span>
                        <span>{formatCareEntryCategory(entry.category)}</span>
                      </p>
                      <p className={styles.recentNote}>{entry.note}</p>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
