"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../../lib/auth-session";
import type { PetWiseAnalysis } from "../../lib/ai-analysis";
import {
  formatCareEntryCategory,
  formatCareEntrySeverity,
  formatCareEntryTimestamp,
  formatCareNotePreview,
} from "../../lib/care-log.mjs";
import {
  buildPetProfileOverviewModel,
  formatAge,
  formatAvoidances,
  formatBudget,
  formatCurrentFood,
  formatWeight,
  type PetProfileOverviewModel,
} from "../../lib/pet-profile";
import { getFinishProfileItemsFromRow, type FinishProfileItem } from "../../lib/finish-profile";
import {
  ONBOARDING_MODE_STORAGE_KEY,
  STORAGE_KEY,
  formatSpecies,
  formatPetDisplayName,
} from "../../lib/petwise";
import {
  PROFILE_ID_STORAGE_KEY,
  deleteDogProfileForUser,
  dogProfileRowToDraft,
  getCurrentUser,
  getSupabaseConfigError,
  listCareEntriesForPet,
  loadDogProductFeedbackForUser,
  loadDogProfileWithMemoriesForUser,
  type CareEntryRow,
  type DogProductFeedbackRow,
  type DogProfileWithMemories,
} from "../../lib/supabase";
import { readStoredGuidanceSnapshot } from "../../lib/stored-guidance";
import { FURVISE_SAFETY_LINE } from "../../lib/safety-copy";

type LoadState = "loading" | "ready" | "error";

export default function PetProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileWithMemories | null>(null);
  const [entries, setEntries] = useState<CareEntryRow[]>([]);
  const [feedback, setFeedback] = useState<DogProductFeedbackRow[]>([]);
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

        const [profileRow, entryRows, feedbackRows] = await Promise.all([
          loadDogProfileWithMemoriesForUser(params.id, user),
          listCareEntriesForPet(params.id),
          loadDogProductFeedbackForUser(params.id, user),
        ]);

        if (active) {
          setProfile(profileRow);
          setEntries(entryRows);
          setFeedback(feedbackRows);
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
  }, [authStatus, authUser, configError, params.id]);

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

  function prepareRecommendations() {
    if (!profile || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dogProfileRowToDraft(profile)));
    window.localStorage.setItem(PROFILE_ID_STORAGE_KEY, profile.id);
    window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "recommend_existing");
  }

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
      router.replace("/pets");
    } catch (deleteError) {
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
            feedback={feedback}
            guidance={guidance}
            model={model}
            onDelete={deleteProfile}
            onPrepareRecommendations={prepareRecommendations}
            profile={profile}
          />
        ) : null}
      </div>
    </AppPage>
  );
}

function ProfileOverview({
  deleting,
  feedback,
  guidance,
  model,
  onDelete,
  onPrepareRecommendations,
  profile,
}: {
  deleting: boolean;
  feedback: DogProductFeedbackRow[];
  guidance: PetWiseAnalysis | null;
  model: PetProfileOverviewModel;
  onDelete: () => void;
  onPrepareRecommendations: () => void;
  profile: DogProfileWithMemories;
}) {
  const name = formatPetDisplayName(profile.name);
  const askHref = `/ask?pet=${profile.id}`;
  const editHref = `/dogs/${profile.id}/edit`;
  const shopHref = `/shop?petId=${encodeURIComponent(profile.id)}`;
  const finishProfileItems = getFinishProfileItemsFromRow(profile);

  return (
    <>
      <header className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <Link className="text-sm font-semibold text-[var(--pw-primary)]" href="/pets">
            Back to pets
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusPill label={model.completeness.status} />
            <StatusPill label={`Updated ${formatShortDate(model.latestUpdateAt)}`} muted />
          </div>
          <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
            {name}
          </h1>
          <p className="mt-3 text-base leading-7 text-[var(--pw-muted)]">
            {model.headerSummary}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:justify-end">
          <Link className={primaryButtonClass} href={askHref}>
            Ask Furvise
          </Link>
          <Link className={secondaryButtonClass} href={editHref}>
            Edit profile
          </Link>
          <details className="relative">
            <summary
              aria-label={`More actions for ${name}`}
              className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] sm:w-fit"
            >
              <span>More actions</span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-2 shadow-xl shadow-[var(--pw-shadow)]">
              <Link className={menuItemClass} href={`/dogs/${profile.id}/memories`}>
                Saved details
              </Link>
              {model.showProductLink ? (
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

      {model.recentSevereSymptom ? (
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

      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <div className="grid min-w-0 gap-5">
          <CurrentFocus model={model} />
          {finishProfileItems.length > 0 ? (
            <FinishProfileCard
              editHref={editHref}
              items={finishProfileItems}
              name={name}
            />
          ) : null}
          <NextStep model={model} onPrepareRecommendations={onPrepareRecommendations} />
          <RecentUpdates entries={model.recentEntries} petId={profile.id} />
        </div>
        <div className="grid min-w-0 content-start gap-5">
          <FurviseSays
            guidance={guidance}
            model={model}
            onPrepareRecommendations={onPrepareRecommendations}
            petName={name}
            petId={profile.id}
          />
          <PetDetails
            feedbackCount={feedback.length}
            model={model}
            profile={profile}
          />
        </div>
      </div>
    </>
  );
}

function FinishProfileCard({
  editHref,
  items,
  name,
}: {
  editHref: string;
  items: FinishProfileItem[];
  name: string;
}) {
  return (
    <Section title={`Finish ${name}'s profile for better guidance`}>
      <p className="leading-7 text-[var(--pw-muted)]">
        {name}&apos;s profile is started. Add food, weight, avoid ingredients, and budget when you&apos;re ready.
      </p>
      <ul className="mt-4 grid gap-2 text-sm font-semibold text-[var(--pw-text)] sm:grid-cols-2">
        {items.map((item) => (
          <li className="rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2" key={item.key}>
            {item.label}
          </li>
        ))}
      </ul>
      <Link className={`${primaryButtonClass} mt-4`} href={editHref}>
        Finish profile
      </Link>
    </Section>
  );
}

function CurrentFocus({ model }: { model: PetProfileOverviewModel }) {
  return (
    <Section title="Current focus">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Main concern" value={model.currentFocus.mainConcern} />
        <Detail label="Latest relevant change" value={model.currentFocus.latestRelevantChange} />
        <Detail label="Active caution" value={model.currentFocus.activeCaution} />
        <Detail label="Important note" value={model.currentFocus.importantNote} />
      </dl>
    </Section>
  );
}

function NextStep({
  model,
  onPrepareRecommendations,
}: {
  model: PetProfileOverviewModel;
  onPrepareRecommendations: () => void;
}) {
  return (
    <Section title="Next step">
      <div className="rounded-2xl bg-[var(--pw-card-muted)] p-4">
        <h3 className="text-xl font-semibold text-[var(--pw-heading)]">{model.nextStep.title}</h3>
        <p className="mt-2 leading-7 text-[var(--pw-muted)]">{model.nextStep.description}</p>
        <Link
          className={`${primaryButtonClass} mt-4`}
          href={model.nextStep.actionHref}
          onClick={model.nextStep.actionHref === "/results" ? onPrepareRecommendations : undefined}
        >
          {model.nextStep.actionLabel}
        </Link>
      </div>
    </Section>
  );
}

function RecentUpdates({ entries, petId }: { entries: CareEntryRow[]; petId: string }) {
  return (
    <Section
      actions={
        <Link className={textLinkClass} href={`/care-log?pet=${petId}`}>
          View full care history
        </Link>
      }
      title="Recent updates"
    >
      {entries.length ? (
        <div className="divide-y divide-[var(--pw-border)]">
          {entries.map((entry) => (
            <Link
              className="block min-w-0 rounded-2xl px-2 py-4 transition hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]"
              href={`/care-log?pet=${petId}&entry=${entry.id}`}
              key={entry.id}
            >
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--pw-primary)]">
                    {formatCareEntryCategory(entry.category)}
                  </p>
                  <h3 className="mt-1 break-words font-semibold text-[var(--pw-heading)]">
                    {entry.title || "Update"}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--pw-muted)]">
                    {formatCareNotePreview(entry.note, 132)}
                  </p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <time className="block text-sm text-[var(--pw-subtle)]" dateTime={entry.occurred_at}>
                    {formatCareEntryTimestamp(entry.occurred_at)}
                  </time>
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

function FurviseSays({
  guidance,
  model,
  onPrepareRecommendations,
  petName,
  petId,
}: {
  guidance: PetWiseAnalysis | null;
  model: PetProfileOverviewModel;
  onPrepareRecommendations: () => void;
  petName: string;
  petId: string;
}) {
  if (!guidance || !model.furviseSays) {
    return (
      <Section compact title="Furvise says">
        <Link className={secondaryButtonClass} href={`/ask?pet=${petId}`}>
          Ask Furvise about this pet
        </Link>
      </Section>
    );
  }

  return (
    <Section title="Furvise says">
      <p className="leading-7 text-[var(--pw-text)]">{model.furviseSays.summary}</p>
      <p className="mt-3 rounded-2xl bg-[var(--pw-card-muted)] p-3 text-sm leading-6 text-[var(--pw-muted)]">
        {FURVISE_SAFETY_LINE}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill label={model.furviseSays.confidenceLabel} />
        <StatusPill label={model.furviseSays.safetyStatus} muted />
      </div>
      {model.furviseSays.confidenceLabel === "Limited context" ? (
        <p className="mt-3 text-sm leading-6 text-[var(--pw-muted)]">
          Furvise has only a few saved details for {petName}. Logging food, symptoms, behavior, or weight helps make guidance more specific.
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link className={secondaryButtonClass} href={`/results?profileId=${encodeURIComponent(petId)}`} onClick={onPrepareRecommendations}>
          View full guidance
        </Link>
        <Link className={secondaryButtonClass} href={`/ask?pet=${petId}`}>
          Ask Furvise
        </Link>
      </div>
      {model.furviseSays.updatedAtLabel ? (
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
  const details = [
    ["Name", formatPetDisplayName(profile.name)],
    ["Species", formatSpecies(profile.species)],
    ["Breed", profile.breed?.trim() || "Not provided"],
    ["Age", formatAge(profile)],
    ["Weight", formatWeight(profile)],
    ["Current food", formatCurrentFood(profile)],
    ["Main concern", profile.main_concern?.trim() || "Not provided"],
    ["Avoid ingredients", formatAvoidances(profile)],
    ["Monthly care budget", formatBudget(profile)],
  ];
  const name = formatPetDisplayName(profile.name);

  return (
    <Section
      actions={
        <Link className={textLinkClass} href={`/dogs/${profile.id}/edit`}>
          Edit profile
        </Link>
      }
      title="Pet details"
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <Detail key={label} label={label} value={value} />
        ))}
      </dl>

      <div className="mt-6 border-t border-[var(--pw-border)] pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-[var(--pw-heading)]">Saved details</h3>
          <Link className={textLinkClass} href={`/dogs/${profile.id}/memories`}>
            View saved details
          </Link>
        </div>
        {model.savedDetails.length ? (
          <ul className="mt-3 grid gap-2">
            {model.savedDetails.map((memory) => (
              <li className="rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2 text-[var(--pw-text)]" key={memory.id}>
                {memory.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[var(--pw-muted)]">
            Nothing saved for {name} yet.
          </p>
        )}
      </div>

      {model.showProductLink ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {feedbackCount ? (
            <p className="text-sm text-[var(--pw-muted)]">
              {feedbackCount} product note{feedbackCount === 1 ? "" : "s"} saved.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <Link className={textLinkClass} href={`/shop?petId=${encodeURIComponent(profile.id)}`}>
            Products for {name}
          </Link>
        </div>
      ) : null}
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
      <Link className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white" href="/pets">
        Return to Pets
      </Link>
    </section>
  );
}

function Section({
  actions,
  children,
  compact = false,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  compact?: boolean;
  title: string;
}) {
  return (
    <section className={`min-w-0 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm ${compact ? "" : "sm:p-6"}`}>
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
  "inline-flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-[var(--pw-text)] hover:bg-[var(--pw-card-muted)] disabled:cursor-wait disabled:opacity-60";
const primaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] sm:w-fit";
const secondaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] sm:w-fit";
const textLinkClass =
  "inline-flex min-h-11 items-center text-sm font-semibold text-[var(--pw-primary)]";
