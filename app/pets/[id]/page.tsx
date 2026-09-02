"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppPage } from "../../components/app-page";
import { LoadingState, PageHeader, PrimaryButton, SecondaryButton } from "../../components/product-primitives";
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
      <div className="w-full min-w-0 overflow-x-hidden" data-ui="pet-profile-facts">
        {state === "loading" ? <><PageHeader eyebrow="PETS" title="Pet profile" /><LoadingState label="Loading pet profile" /></> : null}
        {state === "error" ? <ProfileError error={error} /> : null}
        {state === "ready" && profile ? <PetFacts profile={profile} /> : null}
      </div>
    </AppPage>
  );
}

function PetFacts({ profile }: { profile: DogProfileRow }) {
  const name = formatPetDisplayName(profile.name);
  const metadata = formatPetDirectoryMetadata(profile);
  const petId = encodeURIComponent(profile.id);

  const facts = buildPetProfileFactRows(profile);

  return (
    <>
      <PageHeader
        actions={(
          <>
            <SecondaryButton href={`/pets/${petId}/edit`}>EDIT PET</SecondaryButton>
            <PrimaryButton href={`/vet-brief?pet=${petId}&source=pet-profile`}>VET BRIEF</PrimaryButton>
          </>
        )}
        eyebrow="PETS"
        supportingText={metadata}
        title={name}
      />

      <section className="min-w-0" aria-labelledby="pet-details-heading">
        <h2 className="app-section-title" id="pet-details-heading">Details</h2>
        <dl className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {facts.map(({ label, value }) => (
            <div className="grid min-w-0 gap-1 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-baseline sm:gap-8 sm:py-5" key={label}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">{label}</dt>
              <dd className="min-w-0 break-words text-base font-medium leading-7 text-[var(--text-primary)] sm:text-lg">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

function ProfileError({ error }: { error: string }) {
  return (
    <PageHeader
      actions={<PrimaryButton href="/pets">RETURN TO PETS</PrimaryButton>}
      eyebrow="PETS"
      supportingText={error || "Furvise could not open this pet profile. It may not exist or may belong to another account."}
      title="Pet profile unavailable"
    />
  );
}
