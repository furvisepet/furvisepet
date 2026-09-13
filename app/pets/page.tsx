"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { LoadingState, Notice, PageHeader } from "../components/product-primitives";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import { formatPetDirectoryMetadata } from "../lib/pets-directory";
import { formatPetDisplayName } from "../lib/petwise";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "../lib/supabase";

const addPetActionClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--deep-forest)] bg-[var(--deep-forest)] px-5 text-sm font-semibold text-[var(--warm-cream)] transition-colors hover:bg-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export default function PetsPage() {
  const appDataVersion = useAppDataVersion();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authStatus !== "signedIn" || !user) return;
    let active = true;
    loadDogProfilesWithMemories(user)
      .then((profileRows) => {
        if (!active) return;
        setProfiles(profileRows);
        setError("");
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load your pets.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [appDataVersion, authStatus, user]);

  return <PetsDirectory error={error} loading={loading} profiles={profiles} />;
}

function PetsDirectory({
  error,
  loading,
  profiles,
}: {
  error: string;
  loading: boolean;
  profiles: DogProfileWithMemories[];
}) {
  return (
    <AppPage layout="workspace" shell="standard">
      <div data-ui="pets-directory">
        <PageHeader
          actions={profiles.length ? <Link className={addPetActionClasses} href={NEW_PET_ONBOARDING_PATH}><span className="text-[color:var(--warm-cream)]">ADD PET</span></Link> : undefined}
          eyebrow="PETS"
          supportingText="The pets Furvise remembers with you."
          title="Your pets"
        />

        {error ? <div className="mt-8"><Notice tone="warning">{error}</Notice></div> : null}
        {loading ? <LoadingState label="Loading pets" /> : null}

        {!loading && !error && profiles.length === 0 ? <NoPets /> : null}

        {!loading && profiles.length ? (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]" data-ui="pet-directory-list">
            {profiles.map((profile) => <PetDirectoryRow key={profile.id} profile={profile} />)}
          </ul>
        ) : null}
      </div>
    </AppPage>
  );
}

function NoPets() {
  return (
    <section className="max-w-[560px]" data-ui="pets-empty-state">
      <h2 className="app-section-title">No pets here yet.</h2>
      <p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">Start with the pet you want Furvise to remember.</p>
      <Link className={`${addPetActionClasses} mt-6`} href={NEW_PET_ONBOARDING_PATH}><span className="text-[color:var(--warm-cream)]">ADD YOUR PET</span></Link>
    </section>
  );
}

function PetDirectoryRow({ profile }: { profile: DogProfileWithMemories }) {
  const name = formatPetDisplayName(profile.name);
  const metadata = formatPetDirectoryMetadata(profile);

  return (
    <li>
      <Link
        aria-label={`Open ${name}`}
        className="group grid min-h-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 py-5 text-[var(--text-primary)] transition-colors hover:text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] sm:min-h-28 sm:px-1 sm:py-6"
        href={`/pets/${profile.id}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-xl font-semibold tracking-[-0.015em] sm:text-2xl">{name}</span>
          {metadata ? <span className="mt-1 block text-sm leading-6 text-[var(--text-secondary)] sm:text-base">{metadata}</span> : null}
        </span>
        <span aria-hidden="true" className="text-sm font-semibold tracking-[0.04em] text-[var(--forest)] transition-transform group-hover:translate-x-0.5">OPEN</span>
      </Link>
    </li>
  );
}
