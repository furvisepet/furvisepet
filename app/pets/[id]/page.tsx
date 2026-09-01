"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { clearActivePetId } from "../../lib/active-pet";
import { buildPetDeletionReauthenticationHref } from "../../lib/auth-routing";
import { useAppDataVersion } from "../../lib/navigation/app-data-freshness";
import { clearEditPetOnboardingDraft } from "../../lib/onboarding-drafts";
import { formatPetDirectoryMetadata } from "../../lib/pets-directory";
import { buildPetProfileAboutDetails } from "../../lib/pet-profile-file";
import { formatPetDisplayName } from "../../lib/petwise";
import { buildRememberedDetails } from "../../lib/remembered-details";
import {
  deleteDogProfileForUser,
  getCurrentUser,
  getSupabaseConfigError,
  isRecentAuthenticationRequiredError,
  loadCanonicalRememberedDetailsForUser,
  loadDogProfileForUser,
  type CanonicalRememberedDetailsRows,
  type DogProfileRow,
} from "../../lib/supabase";

type LoadState = "loading" | "ready" | "error";

const strongActionClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--deep-forest)] bg-[var(--deep-forest)] px-5 text-sm font-semibold transition-colors hover:bg-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";
const quietActionClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-5 text-sm font-semibold text-[var(--deep-forest)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";
const textActionClasses =
  "inline-flex min-h-11 items-center text-sm font-semibold text-[var(--forest)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]";

export default function PetProfilePage() {
  const appDataVersion = useAppDataVersion();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileRow | null>(null);
  const [rememberedRows, setRememberedRows] = useState<CanonicalRememberedDetailsRows>({ canonical: [], legacy: [] });
  const [state, setState] = useState<LoadState>(configError ? "error" : "loading");
  const [error, setError] = useState(configError);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (configError || authStatus !== "signedIn" || !authUser) return;
    let active = true;
    const user = authUser;

    async function load() {
      setState("loading");
      setError("");
      try {
        const [profileRow, memoryRows] = await Promise.all([
          loadDogProfileForUser(params.id, user),
          loadCanonicalRememberedDetailsForUser(params.id, user),
        ]);
        if (!active) return;
        setProfile(profileRow);
        setRememberedRows(memoryRows);
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

  const rememberedDetails = useMemo(() => buildRememberedDetails({
    canonical: rememberedRows.canonical,
    legacy: rememberedRows.legacy,
    petName: profile ? formatPetDisplayName(profile.name) : "Your pet",
  }), [profile, rememberedRows]);

  async function deleteProfile() {
    if (!profile || deleting) return;
    const name = formatPetDisplayName(profile.name);
    if (!window.confirm(`Delete ${name}'s profile? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before deleting this profile.");
      await deleteDogProfileForUser(profile.id, user);
      clearEditPetOnboardingDraft(window.localStorage, profile.id);
      clearActivePetId(window.localStorage, profile.id);
      router.replace("/pets");
    } catch (deleteError) {
      if (isRecentAuthenticationRequiredError(deleteError)) {
        setDeleting(false);
        router.push(buildPetDeletionReauthenticationHref(profile.id));
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : "Furvise could not delete that profile.");
      setDeleting(false);
    }
  }

  return (
    <AppPage>
      <div className="mx-auto min-w-0 max-w-[860px] overflow-x-hidden" data-ui="pet-profile-file">
        {state === "loading" ? <ProfileSkeleton /> : null}
        {state === "error" ? <ProfileError error={error} /> : null}
        {state === "ready" && profile ? (
          <PetFile
            deleting={deleting}
            onDelete={deleteProfile}
            onDismissSuccess={() => router.replace(`/pets/${encodeURIComponent(profile.id)}`, { scroll: false })}
            profile={profile}
            rememberedFacts={rememberedDetails.pet.map((detail) => ({ fact: detail.fact, id: `${detail.source}:${detail.id}` }))}
            successMessage={searchParams.get("added") === "1" ? `${formatPetDisplayName(profile.name)} was added.` : ""}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function PetFile({
  deleting,
  onDelete,
  onDismissSuccess,
  profile,
  rememberedFacts,
  successMessage,
}: {
  deleting: boolean;
  onDelete: () => void;
  onDismissSuccess: () => void;
  profile: DogProfileRow;
  rememberedFacts: Array<{ fact: string; id: string }>;
  successMessage: string;
}) {
  const name = formatPetDisplayName(profile.name);
  const metadata = formatPetDirectoryMetadata(profile);
  const about = buildPetProfileAboutDetails(profile);
  const lifecycleStatus = profile.lifecycle_status || "active";
  const editHref = `/pets/${profile.id}/edit`;
  const memoriesHref = `/pets/${profile.id}/memories`;

  return (
    <>
      {successMessage ? (
        <div className="mb-6 flex min-h-11 items-center justify-between gap-3 border-b border-[var(--line)] pb-4 text-sm font-semibold text-[var(--success-text)]" role="status">
          <span>{successMessage}</span>
          <button className={textActionClasses} onClick={onDismissSuccess} type="button">Dismiss</button>
        </div>
      ) : null}

      <header>
        <Link className={textActionClasses} href="/pets">← Pets</Link>
        <h1 className="mt-5 break-words text-4xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] sm:text-5xl">{name}</h1>
        {metadata ? <p className="mt-2 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{metadata}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className={strongActionClasses} href={editHref}><span className="text-[color:var(--warm-cream)]">EDIT PET</span></Link>
          {lifecycleStatus === "active" ? <Link className={quietActionClasses} href={`/vet-brief?pet=${encodeURIComponent(profile.id)}`}>VET BRIEF</Link> : null}
        </div>
      </header>

      <FileSection title="ABOUT">
        {about.length ? (
          <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {about.map(({ label, value }) => (
              <div className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6" key={label}>
                <dt className="text-sm font-medium text-[var(--text-secondary)]">{label}</dt>
                <dd className="break-words text-base leading-7 text-[var(--text-primary)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div>
            <p className="text-lg font-medium text-[var(--text-primary)]">There isn&apos;t much here yet.</p>
            <p className="mt-2 leading-7 text-[var(--text-secondary)]">Add details when you know them.</p>
            <Link className={`${textActionClasses} mt-4`} href={editHref}>EDIT PET</Link>
          </div>
        )}
      </FileSection>

      <FileSection title="WHAT FURVISE REMEMBERS">
        {rememberedFacts.length ? (
          <>
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {rememberedFacts.slice(0, 5).map((memory) => <li className="py-4 text-base leading-7 text-[var(--text-primary)]" key={memory.id}>{memory.fact}</li>)}
            </ul>
            <Link className={`${textActionClasses} mt-4`} href={memoriesHref}>{rememberedFacts.length > 5 ? "VIEW ALL" : "MANAGE REMEMBERED DETAILS"}</Link>
          </>
        ) : (
          <div>
            <p className="text-lg font-medium text-[var(--text-primary)]">Nothing remembered yet.</p>
            <p className="mt-2 leading-7 text-[var(--text-secondary)]">Things you tell Furvise over time can appear here.</p>
          </div>
        )}
      </FileSection>

      <FileSection title="MANAGE PET">
        <div className="flex flex-col items-start gap-2">
          <Link className={textActionClasses} href={editHref}>Edit pet</Link>
          <button
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--danger-text)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-wait disabled:text-[var(--disabled-text)]"
            disabled={deleting}
            onClick={onDelete}
            type="button"
          >
            {deleting ? "Deleting..." : "Delete pet"}
          </button>
        </div>
      </FileSection>
    </>
  );
}

function FileSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mt-10 min-w-0 border-t border-[var(--line)] pt-8 sm:mt-12 sm:pt-10">
      <h2 className="mb-5 text-sm font-bold tracking-[0.08em] text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading pet profile" className="animate-pulse" role="status">
      <div className="h-5 w-20 rounded bg-[var(--surface-raised)]" />
      <div className="mt-6 h-12 w-64 rounded bg-[var(--surface-raised)]" />
      <div className="mt-3 h-6 w-52 rounded bg-[var(--surface-raised)]" />
      <div className="mt-12 h-px bg-[var(--line)]" />
      <div className="mt-8 h-28 rounded bg-[var(--surface-raised)]" />
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
