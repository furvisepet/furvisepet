"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../components/app-page";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  deleteDogProfileForUser,
  getCurrentUser,
  listRecentCareEntries,
  loadDogProfilesWithMemories,
  type CareEntryWithPetName,
  type DogProfileWithMemories,
} from "../lib/supabase";
import { buildProfileStatus } from "../lib/dashboard";
import { formatCareEntryCategory, formatCareEntryTimestamp, formatCareNotePreview } from "../lib/care-log.mjs";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";

export default function PetsPage() {
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function load() {
      try {
        const user = authUser;
        if (!user) return;
        const [profileRows, entryRows] = await Promise.all([
          loadDogProfilesWithMemories(user),
          listRecentCareEntries(200),
        ]);
        if (active) {
          setProfiles(profileRows);
          setEntries(entryRows);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load your pets.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [authStatus, authUser]);

  async function deleteProfile(profile: DogProfileWithMemories) {
    if (!window.confirm(`Delete ${formatPetDisplayName(profile.name)}'s profile? This cannot be undone.`)) return;
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again.");
      await deleteDogProfileForUser(profile.id, user);
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
      setEntries((current) => current.filter((entry) => entry.pet_profile_id !== profile.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Furvise could not delete that profile.");
    }
  }

  return (
    <AppPage>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">Your pets</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--pw-muted)]">Profiles, current concerns, and the latest care context in one place.</p>
        </div>
        <Link className="inline-flex min-h-11 w-fit items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white" href={NEW_PET_ONBOARDING_PATH}>Add pet</Link>
      </header>

      {error ? <Status text={error} /> : loading ? <Status text="Loading your pets…" /> : profiles.length === 0 ? (
        <section className="mt-8 max-w-2xl rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
          <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Add your first pet</h2>
          <p className="mt-3 text-[var(--pw-muted)]">Furvise will use only the profiles you create for this account.</p>
          <Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white" href={NEW_PET_ONBOARDING_PATH}>Add your first pet</Link>
        </section>
      ) : (
        <section className={`mt-8 grid gap-5 ${profiles.length === 1 ? "max-w-[36rem]" : "md:grid-cols-2 2xl:grid-cols-3"}`}>
          {profiles.map((profile) => (
            <PetCard
              entries={entries}
              key={profile.id}
              onDelete={() => deleteProfile(profile)}
              profile={profile}
            />
          ))}
        </section>
      )}
    </AppPage>
  );
}

function PetCard({ entries, onDelete, profile }: { entries: CareEntryWithPetName[]; onDelete: () => void; profile: DogProfileWithMemories }) {
  const latest = useMemo(
    () => entries.find((entry) => entry.pet_profile_id === profile.id),
    [entries, profile.id],
  );
  const name = formatPetDisplayName(profile.name);
  return (
    <article className="flex min-h-72 flex-col rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <Link className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]" href={`/pets/${profile.id}`}>
          <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--pw-card-muted)] text-lg font-semibold">{name.slice(0, 1)}</span>
          <div>
            <h2 className="text-xl font-semibold text-[var(--pw-heading)]">{name}</h2>
            <p className="text-sm text-[var(--pw-muted)]">
              {[formatSpecies(profile.species), profile.breed || ""].filter(Boolean).join(" · ")}
            </p>
          </div>
        </Link>
        <details className="relative">
          <summary aria-label={`More actions for ${name}`} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--pw-border)] text-[var(--pw-text)]">
            <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle cx="6" cy="12" fill="currentColor" r="1.5" />
              <circle cx="12" cy="12" fill="currentColor" r="1.5" />
              <circle cx="18" cy="12" fill="currentColor" r="1.5" />
            </svg>
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-44 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-2 shadow-xl">
            <Link className={menuClass} href={`/pets/${profile.id}/edit`}>Edit profile</Link>
            <Link className={menuClass} href={`/pets/${profile.id}/memories`}>Saved details</Link>
            <button className={`${menuClass} text-[var(--pw-danger-text)]`} onClick={onDelete} type="button">Delete profile</button>
          </div>
        </details>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <div><dt className="font-semibold text-[var(--pw-subtle)]">Main concern</dt><dd className="mt-1 text-[var(--pw-text)]">{profile.main_concern || "Not provided"}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-subtle)]">Species</dt><dd className="mt-1 text-[var(--pw-text)]">{formatSpecies(profile.species)}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-subtle)]">Profile status</dt><dd className="mt-1 text-[var(--pw-text)]">{buildProfileStatus(profile, entries)}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-subtle)]">Latest update</dt><dd className="mt-1 text-[var(--pw-text)]">{latest ? `${formatCareEntryCategory(latest.category)} · ${formatCareNotePreview(latest.note, 70)}` : "No updates yet"}</dd>{latest ? <time className="mt-1 block text-[var(--pw-subtle)]" dateTime={latest.occurred_at}>{formatCareEntryTimestamp(latest.occurred_at)}</time> : null}</div>
      </dl>

      <div className="mt-auto flex items-center justify-end pt-6">
        <Link className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--pw-border-strong)] px-4 text-sm font-semibold text-[var(--pw-text)]" href={`/care-log?pet=${profile.id}&new=1`}>Log update</Link>
      </div>
    </article>
  );
}

function Status({ text }: { text: string }) {
  return <div className="mt-8 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 text-[var(--pw-muted)]" role="status">{text}</div>;
}

const menuClass = "inline-flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-[var(--pw-text)] hover:bg-[var(--pw-card-muted)]";
