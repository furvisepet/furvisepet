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
  const encodedPetId = encodeURIComponent(profile.id);
  const isEmptyFile = about.length === 0 && rememberedFacts.length === 0 && recentEntries.length === 0;

  return (
    <>
      {successMessage ? (
        <div className="mb-6 flex min-h-11 items-center justify-between gap-3 border-b border-[var(--line)] pb-4 text-sm font-semibold text-[var(--success-text)]" role="status">
          <span>{successMessage}</span>
          <button className={textActionClasses} onClick={onDismissSuccess} type="button">Dismiss</button>
        </div>
      ) : null}

      <header className="pb-10 sm:pb-14">
        <Link className={textActionClasses} href="/pets">← Pets</Link>
        <h1 className="mt-6 break-words text-5xl font-semibold tracking-[-0.045em] text-[var(--text-primary)] sm:text-6xl">{name}</h1>
        {metadata ? <p className="mt-2 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">{metadata}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link className={strongActionClasses} href={editHref}><span className="text-[color:var(--warm-cream)]">EDIT PET</span></Link>
          {lifecycleStatus === "active" ? <Link className={quietActionClasses} href={`/vet-brief?pet=${encodedPetId}`}>VET BRIEF</Link> : null}
        </div>
      </header>

      {isEmptyFile ? <FileBeginning name={name} /> : null}

      {isEmptyFile && lifecycleStatus === "active" ? (
        <EditorialSection title="Start here">
          <nav aria-label={`Start ${name}’s file`} className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            <StartLink href={editHref} label={`Add ${name}’s details`} />
            <StartLink href={`/today?pet=${encodedPetId}`} label="Save a first update" />
            <StartLink href={`/ask?pet=${encodedPetId}`} label={`Ask Furvise about ${name}`} />
          </nav>
        </EditorialSection>
      ) : null}

      {!isEmptyFile || about.length ? (
        <EditorialSection title="Details">
          {about.length ? (
            <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {about.map(({ label, value }) => (
                <div className="grid gap-1 py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-8" key={label}>
                  <dt className="text-sm font-medium text-[var(--text-secondary)]">{label}</dt>
                  <dd className="break-words text-base leading-7 text-[var(--text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <WarmEmptyState body="Add the basics when you know them." title="Not much saved yet." />
          )}
        </EditorialSection>
      ) : null}

      <EditorialSection title="What Furvise remembers">
        {rememberedFacts.length ? (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {rememberedFacts.slice(0, 5).map((memory) => <li className="py-4 text-base leading-7 text-[var(--text-primary)]" key={memory.id}>{memory.fact}</li>)}
          </ul>
        ) : (
          <WarmEmptyState
            body="When you tell Furvise something useful, like routines, food preferences, sensitivities, or other important context, it can show up here."
            title="Nothing remembered yet."
          />
        )}
      </EditorialSection>

      <EditorialSection title="Recent updates">
        {recentEntries.length ? (
          <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {recentEntries.map((entry) => (
              <li className="py-4" key={entry.id}>
                <p className="text-sm text-[var(--text-secondary)]">{formatTodayTimelineDate(entry.occurred_at)}</p>
                <p className="mt-1 break-words text-base leading-7 text-[var(--text-primary)]">{entry.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <WarmEmptyState body="What you save in Today will show up here." title={`${name} doesn’t have any updates yet.`} />
        )}
      </EditorialSection>
    </>
  );
}

function FileBeginning({ name }: { name: string }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[var(--border-subtle)] bg-[var(--surface-primary)] px-5 py-8 shadow-[var(--shadow-surface-1)] sm:px-10 sm:py-11" data-ui="pet-profile-beginning">
      <h2 className="max-w-[15ch] text-3xl font-semibold leading-[1.08] tracking-[-0.035em] text-[var(--text-primary)] sm:text-4xl">{name}’s file is just getting started.</h2>
      <p className="mt-5 max-w-[40rem] text-base leading-7 text-[var(--text-secondary)] sm:text-lg sm:leading-8">As you add updates and talk with Furvise, the important things will gather here.</p>
      <div className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        <FilePreviewRow body="Add the basics when you know them" title="Details" />
        <FilePreviewRow body="Things worth keeping in mind over time" title="What Furvise remembers" />
        <FilePreviewRow body="Notes you save in Today" title="Recent updates" />
      </div>
    </section>
  );
}

function FilePreviewRow({ body, title }: { body: string; title: string }) {
  return <div className="py-4"><p className="font-semibold text-[var(--text-primary)]">{title}</p><p className="mt-1 text-sm leading-6 text-[var(--text-secondary)] sm:text-base">{body}</p></div>;
}

function EditorialSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mt-14 min-w-0 sm:mt-16">
      <h2 className="mb-6 text-2xl font-semibold tracking-[-0.025em] text-[var(--text-primary)] sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function StartLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="group flex min-h-16 items-center justify-between gap-5 py-4 text-base font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--forest)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]" href={href}>
      <span>{label}</span>
      <span aria-hidden="true" className="text-xl font-normal text-[var(--text-secondary)] transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}

function WarmEmptyState({ body, title }: { body: string; title: string }) {
  return <div className="max-w-[42rem] border-l-2 border-[var(--sage)] pl-5 sm:pl-6"><p className="text-lg font-semibold text-[var(--text-primary)]">{title}</p><p className="mt-2 text-base leading-7 text-[var(--text-secondary)]">{body}</p></div>;
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading pet profile" className="animate-pulse" role="status">
      <div className="h-5 w-20 rounded bg-[var(--surface-raised)]" />
      <div className="mt-6 h-12 w-64 rounded bg-[var(--surface-raised)]" />
      <div className="mt-3 h-6 w-52 rounded bg-[var(--surface-raised)]" />
      <div className="mt-12 h-64 rounded-[var(--radius-lg)] bg-[var(--surface-raised)]" />
      <div className="mt-14 h-36 rounded-[var(--radius-lg)] bg-[var(--surface-raised)]" />
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
