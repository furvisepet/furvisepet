"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { useAppDataVersion } from "../../lib/navigation/app-data-freshness";
import { formatPetDirectoryMetadata } from "../../lib/pets-directory";
import { buildPetProfileAboutDetails } from "../../lib/pet-profile-file";
import { formatPetDisplayName } from "../../lib/petwise";
import { buildRememberedDetails } from "../../lib/remembered-details";
import { formatTodayTimelineDate } from "../../lib/today";
import {
  getSupabaseConfigError,
  listRecentCareEntriesForPet,
  loadCanonicalRememberedDetailsForUser,
  loadDogProfileForUser,
  type CareEntryRow,
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
  const [recentEntries, setRecentEntries] = useState<CareEntryRow[]>([]);
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
        const [profileRow, memoryRows, entries] = await Promise.all([
          loadDogProfileForUser(params.id, user),
          loadCanonicalRememberedDetailsForUser(params.id, user),
          listRecentCareEntriesForPet(params.id, 3, { getCurrentUser: async () => user }),
        ]);
        if (!active) return;
        setProfile(profileRow);
        setRememberedRows(memoryRows);
        setRecentEntries(entries);
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

  return (
    <AppPage>
      <div className="mx-auto min-w-0 max-w-[860px] overflow-x-hidden" data-ui="pet-profile-file">
        {state === "loading" ? <ProfileSkeleton /> : null}
        {state === "error" ? <ProfileError error={error} /> : null}
        {state === "ready" && profile ? (
          <PetFile
            onDismissSuccess={() => router.replace(`/pets/${encodeURIComponent(profile.id)}`, { scroll: false })}
            profile={profile}
            recentEntries={recentEntries}
            rememberedFacts={rememberedDetails.pet.map((detail) => ({ fact: detail.fact, id: `${detail.source}:${detail.id}` }))}
            successMessage={searchParams.get("added") === "1" ? `${formatPetDisplayName(profile.name)} was added.` : ""}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function PetFile({
  onDismissSuccess,
  profile,
  recentEntries,
  rememberedFacts,
  successMessage,
}: {
  onDismissSuccess: () => void;
  profile: DogProfileRow;
  recentEntries: CareEntryRow[];
  rememberedFacts: Array<{ fact: string; id: string }>;
  successMessage: string;
}) {
  const name = formatPetDisplayName(profile.name);
  const metadata = formatPetDirectoryMetadata(profile);
  const about = buildPetProfileAboutDetails(profile);
  const lifecycleStatus = profile.lifecycle_status || "active";
  const editHref = `/pets/${profile.id}/edit`;

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

      <div className="mt-10 grid min-w-0 gap-5 lg:grid-cols-2 sm:mt-12" data-ui="pet-profile-cards">
        <ProfileCard title="Details">
          {about.length ? (
            <dl className="divide-y divide-[var(--line)]">
              {about.map(({ label, value }) => (
                <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5" key={label}>
                  <dt className="text-sm font-medium text-[var(--text-secondary)]">{label}</dt>
                  <dd className="break-words text-base leading-7 text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyCardCopy body="Add the basics when you know them." title="Not much saved yet." />
          )}
        </ProfileCard>

        <ProfileCard title="What Furvise remembers">
          {rememberedFacts.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {rememberedFacts.slice(0, 5).map((memory) => <li className="py-3 first:pt-0 last:pb-0 text-base leading-7 text-[var(--text-primary)]" key={memory.id}>{memory.fact}</li>)}
            </ul>
          ) : (
            <EmptyCardCopy body="When you tell Furvise something worth keeping, it can show up here." title="Nothing remembered yet." />
          )}
        </ProfileCard>

        <ProfileCard className="lg:col-span-2" title="Recent updates">
          {recentEntries.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {recentEntries.map((entry) => (
                <li className="py-3 first:pt-0 last:pb-0" key={entry.id}>
                  <p className="text-sm text-[var(--text-secondary)]">{formatTodayTimelineDate(entry.occurred_at)}</p>
                  <p className="mt-1 break-words text-base leading-7 text-[var(--text-primary)]">{entry.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyCardCopy body="Updates you save in Today will show up here." title={`Nothing on ${name}’s file yet.`} />
          )}
        </ProfileCard>
      </div>
    </>
  );
}

function ProfileCard({ children, className = "", title }: { children: React.ReactNode; className?: string; title: string }) {
  return (
    <section className={`min-w-0 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-5 shadow-[var(--shadow-surface-1)] sm:p-6 ${className}`}>
      <h2 className="mb-5 text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function EmptyCardCopy({ body, title }: { body: string; title: string }) {
  return <div><p className="text-lg font-medium text-[var(--text-primary)]">{title}</p><p className="mt-2 leading-7 text-[var(--text-secondary)]">{body}</p></div>;
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading pet profile" className="animate-pulse" role="status">
      <div className="h-5 w-20 rounded bg-[var(--surface-raised)]" />
      <div className="mt-6 h-12 w-64 rounded bg-[var(--surface-raised)]" />
      <div className="mt-3 h-6 w-52 rounded bg-[var(--surface-raised)]" />
      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <div className="h-48 rounded-[var(--radius-lg)] bg-[var(--surface-raised)]" />
        <div className="h-48 rounded-[var(--radius-lg)] bg-[var(--surface-raised)]" />
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
