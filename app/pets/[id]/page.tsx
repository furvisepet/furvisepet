"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "../../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { useAppDataVersion } from "../../lib/navigation/app-data-freshness";
import { formatPetDirectoryMetadata } from "../../lib/pets-directory";
import { buildPetProfileFactRows } from "../../lib/pet-profile-file";
import { formatPetDisplayName } from "../../lib/petwise";
import {
  getSupabaseConfigError,
  loadDogProfileForUser,
  type DogProfileRow,
} from "../../lib/supabase";

type LoadState = "loading" | "ready" | "error";

const strongActionClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--deep-forest)] bg-[var(--deep-forest)] px-5 text-sm font-semibold text-[color:var(--warm-cream)] transition-colors hover:bg-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";
const textActionClasses =
  "inline-flex min-h-11 items-center text-sm font-semibold text-[var(--forest)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export default function PetProfilePage() {
  const appDataVersion = useAppDataVersion();
  const params = useParams<{ id: string }>();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileRow | null>(null);
  const [state, setState] = useState<LoadState>(configError ? "error" : "loading");
  const [error, setError] = useState(configError);

  useEffect(() => {
    if (configError || authStatus !== "signedIn" || !authUser) return;
    let active = true;
    const user = authUser;

    async function load() {
      setState("loading");
      setError("");
      try {
        const profileRow = await loadDogProfileForUser(params.id, user);
        if (!active) return;
        setProfile(profileRow);
        setState("ready");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Furvise could not load this pet profile.");
        setState("error");
      }
    }

    load();
    return () => { active = false; };
  }, [appDataVersion, authStatus, authUser, configError, params.id]);

  return (
    <AppPage>
      <div className="mx-auto min-w-0 max-w-[860px] overflow-x-hidden" data-ui="pet-profile-facts">
        {state === "loading" ? <ProfileSkeleton /> : null}
        {state === "error" ? <ProfileError error={error} /> : null}
        {state === "ready" && profile ? <PetFacts profile={profile} /> : null}
      </div>
    </AppPage>
  );
}

function PetFacts({ profile }: { profile: DogProfileRow }) {
  const name = formatPetDisplayName(profile.name);
  const metadata = formatPetDirectoryMetadata(profile);
  const facts = buildPetProfileFactRows(profile);

  return (
    <>
      <header>
        <Link className={textActionClasses} href="/pets">← Pets</Link>
        <h1 className="mt-6 break-words text-4xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-5xl">{name}</h1>
        {metadata ? <p className="mt-2 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{metadata}</p> : null}
        <Link className={`${strongActionClasses} mt-7`} href={`/pets/${encodeURIComponent(profile.id)}/edit`}><span className="text-[color:var(--warm-cream)]">EDIT PET</span></Link>
      </header>

      <section className="mt-14 min-w-0 sm:mt-16" aria-labelledby="pet-details-heading">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]" id="pet-details-heading">Details</h2>
        <dl className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {facts.map(({ label, value }) => (
            <div className="grid min-w-0 gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline sm:gap-8 sm:py-5" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{label}</dt>
              <dd className="min-w-0 break-words text-base font-medium leading-7 text-[var(--text-primary)] sm:text-lg">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading pet profile" className="animate-pulse" role="status">
      <div className="h-5 w-20 rounded bg-[var(--surface-raised)]" />
      <div className="mt-6 h-11 w-52 rounded bg-[var(--surface-raised)]" />
      <div className="mt-3 h-6 w-44 rounded bg-[var(--surface-raised)]" />
      <div className="mt-14 h-4 w-16 rounded bg-[var(--surface-raised)]" />
      <div className="mt-5 space-y-px">
        {Array.from({ length: 5 }, (_, index) => <div className="h-16 border-y border-[var(--line)] bg-[var(--surface-raised)]" key={index} />)}
      </div>
    </div>
  );
}

function ProfileError({ error }: { error: string }) {
  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Pet profile unavailable</h1>
      <p className="mt-3 leading-7 text-[var(--text-secondary)]">{error || "Furvise could not open this pet profile. It may not exist or may belong to another account."}</p>
      <Link className={`${strongActionClasses} mt-6`} href="/pets"><span className="text-[color:var(--warm-cream)]">RETURN TO PETS</span></Link>
    </section>
  );
}
