"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../../components/app-page";
import { LocalPetAvatar } from "../../components/local-photo";
import { CareEntryMetadata } from "../../components/care-entry-metadata";
import { PrimaryButton, SecondaryButton, TextButton } from "../../components/product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import { clearEditPetOnboardingDraft } from "../../lib/onboarding-drafts";
import { clearActivePetId } from "../../lib/active-pet";
import {
  formatCareEntrySeverity,
  formatCareEntryTitle,
  formatCareNotePreview,
} from "../../lib/care-log.mjs";
import {
  buildPetProfileOverviewModel,
  formatAge,
  formatAvoidances,
  formatBudget,
  formatCurrentFood,
  formatWeight,
  isKnownProfileText,
  type PetProfileOverviewModel,
} from "../../lib/pet-profile";
import { formatSpecies, formatPetDisplayName } from "../../lib/petwise";
import { useAppDataVersion } from "../../lib/navigation/app-data-freshness";
import { buildPetDeletionReauthenticationHref } from "../../lib/auth-routing";
import {
  deleteDogProfileForUser,
  getCurrentUser,
  getSupabaseConfigError,
  isRecentAuthenticationRequiredError,
  listCareEntriesForPet,
  listActiveConcernsForPet,
  loadCanonicalRememberedDetailsForUser,
  loadDogProductFeedbackForUser,
  loadDogProfileWithMemoriesForUser,
  type CareEntryRow,
  type CanonicalRememberedDetailsRows,
  type DogProductFeedbackRow,
  type DogProfileWithMemories,
} from "../../lib/supabase";
import type { PetConcern } from "../../lib/ai/concern-engine";
import { readStoredGuidanceSnapshot } from "../../lib/stored-guidance";
import { FURVISE_SAFETY_LINE } from "../../lib/safety-copy";
import { buildRememberedDetails, type RememberedDetails } from "../../lib/remembered-details";

type LoadState = "loading" | "ready" | "error";

export default function PetProfilePage() {
  const appDataVersion = useAppDataVersion();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileWithMemories | null>(null);
  const [entries, setEntries] = useState<CareEntryRow[]>([]);
  const [feedback, setFeedback] = useState<DogProductFeedbackRow[]>([]);
  const [concerns, setConcerns] = useState<PetConcern[]>([]);
  const [rememberedRows, setRememberedRows] = useState<CanonicalRememberedDetailsRows>({ canonical: [], legacy: [] });
  const [state, setState] = useState<LoadState>(configError ? "error" : "loading");
  const [error, setError] = useState(configError);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (configError) return;
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;

    async function load() {
      setState("loading");
      setError("");

      try {
        const user = authUser;
        if (!user) return;

        const [profileRow, entryRows, feedbackRows, concernRows, memoryRows] = await Promise.all([
          loadDogProfileWithMemoriesForUser(params.id, user),
          listCareEntriesForPet(params.id),
          loadDogProductFeedbackForUser(params.id, user),
          listActiveConcernsForPet(params.id),
          loadCanonicalRememberedDetailsForUser(params.id, user),
        ]);

        if (active) {
          setProfile(profileRow);
          setEntries(entryRows);
          setFeedback(feedbackRows);
          setConcerns(concernRows);
          setRememberedRows(memoryRows);
          setState("ready");
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Furvise could not load this pet profile.",
          );
          setState("error");
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [appDataVersion, authStatus, authUser, configError, params.id]);

  const storedGuidance = useMemo(() => readStoredGuidanceSnapshot(), []);
  const guidanceResult =
    storedGuidance.profileId === params.id && storedGuidance.result?.status === "available"
      ? storedGuidance.result
      : null;
  const guidance = guidanceResult?.analysis || null;
  const model = useMemo(
    () =>
      profile
        ? buildPetProfileOverviewModel({
            entries,
            guidance,
            guidanceUpdatedAt: guidanceResult?.updatedAt,
            profile,
          })
        : null,
    [entries, guidance, guidanceResult?.updatedAt, profile],
  );
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
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Furvise could not delete that profile.",
      );
      setDeleting(false);
    }
  }

  return (
    <AppPage>
      <div className="min-w-0 overflow-x-hidden">
        {state === "loading" ? <ProfileSkeleton /> : null}
        {state === "error" ? <ProfileError error={error} /> : null}
        {state === "ready" && profile && model ? (
          <ProfileOverview
            deleting={deleting}
            concerns={concerns}
            feedback={feedback}
            model={model}
            onDelete={deleteProfile}
            profile={profile}
            rememberedDetails={rememberedDetails}
            successMessage={searchParams.get("added") === "1" ? `${formatPetDisplayName(profile.name)} was added.` : ""}
            onDismissSuccess={() => router.replace(`/pets/${encodeURIComponent(profile.id)}`, { scroll: false })}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function ProfileOverview({
  concerns,
  deleting,
  feedback,
  model,
  onDelete,
  onDismissSuccess,
  profile,
  rememberedDetails,
  successMessage,
}: {
  concerns: PetConcern[];
  deleting: boolean;
  feedback: DogProductFeedbackRow[];
  model: PetProfileOverviewModel;
  onDelete: () => void;
  onDismissSuccess: () => void;
  profile: DogProfileWithMemories;
  rememberedDetails: RememberedDetails;
  successMessage: string;
}) {
  const name = formatPetDisplayName(profile.name);
  const askHref = `/ask?pet=${profile.id}`;
  const editHref = `/pets/${profile.id}/edit`;
  const shopHref = `/shop?petId=${encodeURIComponent(profile.id)}`;
  const lifecycleStatus = profile.lifecycle_status || "active";

  return (
    <>
      {successMessage ? (
        <div className="mb-5 flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--selection-strong)] bg-[var(--success-surface)] px-4 py-2 text-sm font-semibold text-[var(--success-text)]" role="status">
          <span>{successMessage}</span>
          <TextButton aria-label="Dismiss confirmation" onClick={onDismissSuccess} type="button">Dismiss</TextButton>
        </div>
      ) : null}
      <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] px-1 text-sm font-semibold text-[var(--ghost-action-text)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href="/pets">
            ← All pets
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill label={`Updated ${formatShortDate(model.latestUpdateAt)}`} muted />
            {lifecycleStatus === "deceased" ? <StatusPill label="Passed away" /> : lifecycleStatus === "archived" ? <StatusPill label="Archived" muted /> : null}
          </div>
          <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
            {name}
          </h1>
          <LocalPetAvatar className="mt-4" id={profile.id} name={name} size="large" />
          {model.headerSummary ? <p className="mt-3 text-base leading-7 text-[var(--pw-muted)]">{model.headerSummary}</p> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:justify-end">
          <PrimaryButton href={askHref}>Ask Furvise</PrimaryButton>
          {lifecycleStatus === "active" ? <SecondaryButton href={`/care-log?pet=${profile.id}&new=1`}>Add update</SecondaryButton> : null}
          <SecondaryButton href={editHref}>Edit profile</SecondaryButton>
          <details className="relative">
            <summary
              aria-label={`More actions for ${name}`}
              className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] sm:w-fit"
            >
              <span>More actions</span>
            </summary>
            <div className="absolute right-0 z-[var(--z-popover)] mt-2 w-52 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-2 shadow-xl shadow-[var(--pw-shadow)]">
              {model.showProductLink && lifecycleStatus === "active" ? (
                <Link className={menuItemClass} href={shopHref}>
                  Products for {name}
                </Link>
              ) : null}
              <button
                className={`${menuItemClass} text-[var(--pw-danger-text)]`}
                disabled={deleting}
                onClick={onDelete}
                type="button"
              >
                {deleting ? "Deleting..." : "Delete profile"}
              </button>
            </div>
          </details>
        </div>
      </header>

      {lifecycleStatus === "active" && model.recentSevereSymptom ? (
        <section className="mt-6 rounded-3xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-5 text-[var(--pw-danger-text)]">
          <p className="text-sm font-semibold uppercase tracking-[0.12em]">Veterinary caution</p>
          <h2 className="mt-2 text-2xl font-semibold">Severe symptom recorded recently</h2>
          <p className="mt-3 leading-7">
            Furvise is not a veterinarian and does not diagnose. If severe symptoms continue,
            worsen, or include emergency signs, contact a veterinarian right away.
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-full border border-[var(--pw-danger-border)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-danger-text)]"
            href={`/care-log?pet=${profile.id}&entry=${model.recentSevereSymptom.id}`}
          >
            View severe update
          </Link>
        </section>
      ) : null}

      {lifecycleStatus === "active" && concerns.length ? <ActiveConcerns concerns={concerns} /> : null}

      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="grid min-w-0 gap-5">
          {lifecycleStatus === "active" ? <CurrentFocus model={model} /> : <Section title={lifecycleStatus === "deceased" ? "Preserved profile" : "Archived profile"}><p className="leading-7 text-[var(--text-secondary)]">{lifecycleStatus === "deceased" ? `${name}'s profile and care history remain available for review.` : "This profile is outside routine care workflows but its history remains available."}</p></Section>}
          <RecentUpdates entries={model.recentEntries} petId={profile.id} petName={name} />
        </div>
        <div className="grid min-w-0 content-start gap-5">
          {lifecycleStatus === "active" ? <FurviseGuidance
            model={model}
            petName={name}
            petId={profile.id}
          /> : null}
          <PetDetails
            feedbackCount={feedback.length}
            model={model}
            profile={profile}
          />
          <SavedDetails details={rememberedDetails} profile={profile} />
        </div>
      </div>
    </>
  );
}

function ActiveConcerns({ concerns }: { concerns: PetConcern[] }) {
  return <section aria-labelledby="active-concerns-heading" className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--surface-primary)] p-5 sm:p-6">
    <h2 className="text-xl font-semibold text-[var(--text-primary)]" id="active-concerns-heading">Active concerns</h2>
    <ul className="mt-4 divide-y divide-[var(--line)]">{concerns.map((concern) => <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" key={concern.id}>
      <div><p className="font-semibold text-[var(--text-primary)]">{concern.title}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{concern.status === "monitoring" ? "Monitoring" : concern.status === "reopened" ? "Returned" : "Active"}</p></div>
      <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--ghost-action-text)] underline-offset-4 hover:underline" href={`/ask?pet=${encodeURIComponent(concern.pet_profile_id)}`}>Ask Furvise</Link>
    </li>)}</ul>
  </section>;
}

function CurrentFocus({ model }: { model: PetProfileOverviewModel }) {
  const latest = model.currentFocus.latestRelevantChange.startsWith("No ") ? "Nothing relevant recorded yet" : model.currentFocus.latestRelevantChange;
  const caution = model.currentFocus.activeCaution === "None" ? "None recorded" : model.currentFocus.activeCaution;
  const important = model.currentFocus.importantNote === "No important active notes" ? "No important active notes" : model.currentFocus.importantNote;
  return (
    <Section title="Today’s snapshot">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Main focus" value={model.currentFocus.mainConcern} />
        <Detail label="Latest relevant update" value={latest} />
        <Detail label="Active care note" value={caution} />
        <Detail label="Important note" value={important} />
      </dl>
    </Section>
  );
}

function RecentUpdates({ entries, petId, petName }: { entries: CareEntryRow[]; petId: string; petName: string }) {
  return (
    <Section
      actions={
        <TextButton href={`/care-log?pet=${petId}`}>
          View full history
        </TextButton>
      }
      title="Recent updates"
    >
      {entries.length ? (
        <div className="divide-y divide-[var(--pw-border)]">
          {entries.map((entry) => (
            <Link
              className="block min-w-0 rounded-2xl px-2 py-4 transition hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]"
              href={`/care-log?pet=${petId}&entry=${entry.id}`}
              key={entry.id}
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CareEntryMetadata category={entry.category} occurredAt={entry.occurred_at} petName={petName} />
                  <h3 className="mt-1 break-words font-semibold text-[var(--pw-heading)]">
                    {formatCareEntryTitle(entry)}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--pw-muted)]">
                    {formatCareNotePreview(entry.note, 132)}
                  </p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  {entry.severity ? (
                    <span className="mt-2 inline-flex rounded-full border border-[var(--pw-border)] px-2.5 py-1 text-xs font-semibold text-[var(--pw-muted)]">
                      {formatCareEntrySeverity(entry.severity)}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-[var(--pw-card-muted)] p-4 text-[var(--pw-muted)]">
          No care updates have been logged for this pet yet.
        </p>
      )}
    </Section>
  );
}

function FurviseGuidance({
  model,
  petName,
  petId,
}: {
  model: PetProfileOverviewModel;
  petName: string;
  petId: string;
}) {
  return (
    <Section title="Furvise guidance">
      <p className="leading-7 text-[var(--pw-text)]">
        The more Furvise knows about {petName}, the more specific its guidance can be.
      </p>
      <div className="mt-4 rounded-2xl bg-[var(--pw-card-muted)] p-4">
        <h3 className="font-semibold text-[var(--pw-heading)]">Most useful next step</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--pw-muted)]">{model.nextStep.kind === "no_action_needed" ? "Nothing needs your attention right now." : `${model.nextStep.title}. ${model.nextStep.description}`}</p>
      </div>
      <p className="mt-3 rounded-2xl bg-[var(--pw-card-muted)] p-3 text-sm leading-6 text-[var(--pw-muted)]">
        {FURVISE_SAFETY_LINE}
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <SecondaryButton href={`/ask?pet=${petId}`}>Ask Furvise</SecondaryButton>
      </div>
      {model.furviseSays?.updatedAtLabel ? (
        <p className="mt-3 text-sm text-[var(--pw-subtle)]">{model.furviseSays.updatedAtLabel}</p>
      ) : null}
    </Section>
  );
}

function PetDetails({
  feedbackCount,
  model,
  profile,
}: {
  feedbackCount: number;
  model: PetProfileOverviewModel;
  profile: DogProfileWithMemories;
}) {
  const name = formatPetDisplayName(profile.name);
  const details = [
    ["Name", formatPetDisplayName(profile.name)],
    ...(profile.species ? [["Species", formatSpecies(profile.species)]] : []),
    ...(isKnownProfileText(profile.breed) ? [["Breed", profile.breed!.trim()]] : []),
    ...(profile.age_value !== null ? [["Age", formatAge(profile)]] : []),
    ...(profile.weight_value !== null ? [["Weight", formatWeight(profile)]] : []),
    ...(isKnownProfileText(profile.current_food) ? [["Current food", formatCurrentFood(profile)]] : []),
    ...(isKnownProfileText(profile.main_concern) ? [["Main concern", profile.main_concern!.trim()]] : []),
    ...(profile.avoid_ingredients !== null ? [["Avoid ingredients", formatAvoidances(profile)]] : []),
    ...(profile.monthly_budget !== null ? [["Monthly care budget", formatBudget(profile)]] : []),
  ];
  return (
    <Section
      actions={
        <TextButton href={`/pets/${profile.id}/edit`}>
          Edit profile
        </TextButton>
      }
      title="Pet details"
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <Detail key={label} label={label} value={value} />
        ))}
      </dl>

      {model.showProductLink ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {feedbackCount ? (
            <p className="text-sm text-[var(--pw-muted)]">
              {feedbackCount} product note{feedbackCount === 1 ? "" : "s"} saved.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <TextButton href={`/shop?petId=${encodeURIComponent(profile.id)}`}>
            Products for {name}
          </TextButton>
        </div>
      ) : null}
    </Section>
  );
}

function SavedDetails({ details, profile }: { details: RememberedDetails; profile: DogProfileWithMemories }) {
  return (
    <Section id="saved-details" title="Remembered details">
      {details.all.length ? (
        <>
        <p className="mb-3 text-sm text-[var(--pw-muted)]">{details.all.length} active remembered detail{details.all.length === 1 ? "" : "s"}</p>
        <ul className="grid gap-2">
          {details.all.slice(0, 2).map((memory) => (
            <li className="rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2 text-[var(--pw-text)]" key={`${memory.source}:${memory.id}`}>{memory.fact}</li>
          ))}
        </ul>
        </>
      ) : <p className="text-[var(--pw-muted)]">No remembered details yet.</p>}
      <div className="mt-3 flex flex-wrap gap-2"><TextButton href={`/pets/${profile.id}/memories`}>{details.all.length ? "View all remembered details" : "View remembered details"}</TextButton><TextButton href={`/pets/${profile.id}/edit`}>Edit pet details</TextButton></div>
    </Section>
  );
}

function ProfileSkeleton() {
  return (
    <div aria-label="Loading pet profile" className="animate-pulse" role="status">
      <div className="h-5 w-28 rounded-full bg-[var(--pw-card-muted)]" />
      <div className="mt-5 h-12 max-w-sm rounded-2xl bg-[var(--pw-card-muted)]" />
      <div className="mt-4 h-6 max-w-xl rounded-2xl bg-[var(--pw-card-muted)]" />
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="min-h-48 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5" key={index}>
            <div className="h-5 w-36 rounded-full bg-[var(--pw-card-muted)]" />
            <div className="mt-5 grid gap-3">
              <div className="h-4 rounded-full bg-[var(--pw-card-muted)]" />
              <div className="h-4 w-4/5 rounded-full bg-[var(--pw-card-muted)]" />
              <div className="h-4 w-2/3 rounded-full bg-[var(--pw-card-muted)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileError({ error }: { error: string }) {
  return (
    <section className="max-w-2xl rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-6 text-[var(--pw-warning-text)]">
      <h1 className="text-2xl font-semibold">Pet profile unavailable</h1>
      <p className="mt-3 leading-7">
        {error || "Furvise could not open this pet profile. It may not exist or may belong to another account."}
      </p>
      <PrimaryButton className="mt-5" href="/pets">Return to Pets</PrimaryButton>
    </section>
  );
}

function Section({
  actions,
  children,
  compact = false,
  id,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
  id?: string;
  title: string;
}) {
  return (
    <section className={`min-w-0 scroll-mt-24 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm ${compact ? "" : "sm:p-6"}`} id={id}>
      <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-[var(--pw-heading)]">{title}</h2>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[var(--pw-card-muted)] p-3">
      <dt className={detailLabelClass}>{label}</dt>
      <dd className="mt-1 break-words font-semibold text-[var(--pw-text)]">{value}</dd>
    </div>
  );
}

function StatusPill({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${
        muted
          ? "border border-[var(--pw-border)] text-[var(--pw-muted)]"
          : "bg-[var(--pw-primary-soft)] text-[var(--pw-primary)]"
      }`}
    >
      {label}
    </span>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

const detailLabelClass = "text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pw-subtle)]";
const menuItemClass =
  "inline-flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-[var(--pw-text)] hover:bg-[var(--pw-card-muted)] disabled:cursor-wait disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)]";
