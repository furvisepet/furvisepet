"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  buildTodayRecentEntries,
  formatTodayPetContext,
  formatTodayTimelineDate,
  TODAY_REMEMBER_EXAMPLES,
} from "../lib/today";
import {
  createCareEntry,
  getSupabaseConfigError,
  listRecentCareEntriesForPet,
  loadDogProfilesWithMemories,
  type CareEntryInput,
  type CareEntryRow,
  type DogProfileWithMemories,
} from "../lib/supabase";
import styles from "./today.module.css";

export default function TodayPage() {
  const appDataVersion = useAppDataVersion();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryRow[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [loading, setLoading] = useState(!configError);
  const [recentLoading, setRecentLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [recentError, setRecentError] = useState("");
  const [rememberNote, setRememberNote] = useState("");
  const [rememberCategory, setRememberCategory] = useState<CareEntryInput["category"]>("general");
  const [rememberOccurredAt, setRememberOccurredAt] = useState(() => toLocalDateTimeInputValue());
  const [rememberSaving, setRememberSaving] = useState(false);
  const [rememberError, setRememberError] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const rememberSavingRef = useRef(false);

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
        setEntries([]);
        setRecentError("");
        setRecentLoading(Boolean(nextPetId));
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
    listRecentCareEntriesForPet(selectedPetId, 10)
      .then((entryRows) => {
        if (active) setEntries(entryRows);
      })
      .catch((loadError) => {
        if (active) setRecentError(loadError instanceof Error ? loadError.message : "Recent notes could not be loaded.");
      })
      .finally(() => {
        if (active) setRecentLoading(false);
      });
    return () => { active = false; };
  }, [authStatus, selectedPetId]);

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
    setEntries([]);
    setRecentError("");
    setRecentLoading(true);
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
      setEntries((current) => buildTodayRecentEntries([entry, ...current], selectedProfile.id));
      setRememberNote("");
      setRememberCategory("general");
      setRememberOccurredAt(toLocalDateTimeInputValue());
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

            {!recentLoading && !recentError && recentEntries.length === 0 ? (
              <div className={styles.fileEmpty} data-ui="today-empty-file">
                <p>Nothing on the file yet.</p>
                <p>When something matters, put it here.</p>
              </div>
            ) : null}

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
                <div className={styles.metadataFields}>
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
                <button className={styles.primaryAction} data-ui="today-remember-action" disabled={!rememberDraft || rememberSaving} type="submit">
                  {rememberSaving ? "REMEMBERING" : "REMEMBER"}
                </button>
                {rememberError ? <p className={styles.error} role="alert">{rememberError}</p> : null}
              </form>
            </section>

            {recentError ? <div className={styles.recentNotice}><Notice tone="warning">Recent notes are temporarily unavailable. You can still remember something new.</Notice></div> : null}
            {!recentLoading && !recentError && recentEntries.length ? (
              <section aria-labelledby="recent-heading" className={styles.recent} data-ui="today-recent">
                <h2 className={styles.recentHeading} id="recent-heading">RECENT</h2>
                <table className={styles.recentTable}>
                  <thead>
                    <tr><th scope="col">When</th><th scope="col">What happened</th><th scope="col">Category</th></tr>
                  </thead>
                  <tbody>
                    {recentEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td><time dateTime={entry.occurred_at}>{formatTodayTimelineDate(entry.occurred_at)}</time></td>
                        <td>{entry.note}</td>
                        <td>{formatCareEntryCategory(entry.category)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
