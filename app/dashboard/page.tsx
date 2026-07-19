"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { type StoredAnalysisResult } from "../lib/ai-analysis";
import { NEW_PET_ONBOARDING_PATH } from "../lib/auth-routing";
import {
  buildNextSteps,
  type DashboardNextStepItem,
} from "../lib/dashboard";
import {
  buildDashboardNextStep,
  buildPetMemoryContext,
  type PetMemoryContext,
} from "../lib/pet-memory";
import { getFinishProfileItemsFromRow } from "../lib/finish-profile";
import {
  getSupabaseConfigError,
  detectAccountProductCountry,
  listRecentCareEntries,
  loadUserProfileForUser,
  loadDogProfilesWithMemories,
  type CareEntryWithPetName,
  type DogProfileWithMemories,
} from "../lib/supabase";
import { readStoredGuidanceSnapshot } from "../lib/stored-guidance";
import {
  formatCareEntryCategory,
  formatCareEntryTimestamp,
  formatCareNotePreview,
} from "../lib/care-log.mjs";
import { formatPetDisplayName } from "../lib/petwise";

export default function DashboardPage() {
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [loading, setLoading] = useState(!configError);
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("all");
  const [error, setError] = useState("");
  const [storedGuidanceSnapshot] = useState(readStoredGuidanceSnapshot);
  const analysis: StoredAnalysisResult | null = storedGuidanceSnapshot.result;
  const analysisProfileId = storedGuidanceSnapshot.profileId;

  useEffect(() => {
    if (configError) return;
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function load() {
      try {
        const user = authUser;
        if (!user) return;
        void bootstrapAccountProductCountry(user);
        const [profileRows, entryRows] = await Promise.all([
          loadDogProfilesWithMemories(user),
          listRecentCareEntries(20),
        ]);
        if (active) {
          setProfiles(profileRows);
          setEntries(entryRows);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Furvise could not load Dashboard.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, configError]);

  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => selectedPetId === "all" || entry.pet_profile_id === selectedPetId)
        .slice(0, 3),
    [entries, selectedPetId],
  );
  const visibleProfiles = useMemo(
    () => profiles.filter((profile) => selectedPetId === "all" || profile.id === selectedPetId),
    [profiles, selectedPetId],
  );
  const nextSteps = useMemo(
    () => buildNextSteps(visibleProfiles, entries, analysis, analysisProfileId),
    [analysis, analysisProfileId, entries, visibleProfiles],
  );
  const mainStep = nextSteps[0] ?? null;
  const quickProfileId =
    selectedPetId !== "all" ? selectedPetId : profiles.length === 1 ? profiles[0].id : "";
  const selectedProfile = quickProfileId
    ? profiles.find((profile) => profile.id === quickProfileId) || null
    : null;
  const selectedPetName = selectedProfile ? formatPetDisplayName(selectedProfile.name) : "";
  const guidanceProfile = profiles.find((profile) => profile.id === analysisProfileId);
  const storedGuidance =
    analysis?.status === "available" && guidanceProfile ? analysis.analysis : null;
  const dashboardMemory = useMemo(() => {
    if (!selectedProfile) return null;
    return buildPetMemoryContext({
      careEntries: entries.filter((entry) => entry.pet_profile_id === selectedProfile.id),
      productFeedback: selectedProfile.dog_product_feedback || [],
      profile: selectedProfile,
      recentGuidance:
        storedGuidance && selectedProfile.id === analysisProfileId
          ? [
              {
                createdAt: analysis?.updatedAt,
                detail: storedGuidance.summary,
                id: `stored-guidance-${selectedProfile.id}`,
                title: "Furvise summary",
              },
            ]
          : [],
      savedMemories: selectedProfile.dog_memories,
    });
  }, [analysis?.updatedAt, analysisProfileId, entries, selectedProfile, storedGuidance]);
  const dashboardAction = getDashboardAction({
    memory: dashboardMemory,
    mainStep,
    selectedPetId: selectedProfile?.id || "",
    visibleEntries,
  });
  const finishProfileItems = selectedProfile ? getFinishProfileItemsFromRow(selectedProfile) : [];

  return (
    <AppPage>
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">Good to see you.</h1>
        <p className="mt-3 text-lg leading-7 text-[var(--pw-muted)]">
          {selectedPetName
            ? `Here is what matters for ${selectedPetName} today.`
            : "Here is what matters across your pet family today."}
        </p>
      </header>

      {configError || error ? (
        <Status text={configError || error} tone="warn" />
      ) : loading ? (
        <Status text="Loading what matters today..." />
      ) : profiles.length === 0 ? (
        <section className="mt-8 max-w-2xl rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
          <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Start with your first pet</h2>
          <p className="mt-3 text-[var(--pw-muted)]">Add a profile so Furvise can organize updates and guidance around real care.</p>
          <Link className={primaryButton} href={NEW_PET_ONBOARDING_PATH}>Add your first pet</Link>
        </section>
      ) : (
        <div className="mt-6 grid gap-6">
          <PetSwitcher profiles={profiles} selected={selectedPetId} onSelect={setSelectedPetId} />

          <section className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-[var(--pw-primary)]">Next best action</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--pw-heading)]">
                  {dashboardAction.title}
                </h2>
                <p className="mt-2 line-clamp-2 leading-7 text-[var(--pw-muted)]">
                  {dashboardAction.description}
                </p>
                {dashboardAction.missingContext?.length ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--pw-subtle)]">Missing:</span>
                    {dashboardAction.missingContext.map((item) => (
                      <span className="rounded-full bg-[var(--pw-card-muted)] px-3 py-1 text-xs font-semibold text-[var(--pw-text)]" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {dashboardAction.href ? (
                <Link className={primaryButtonInline} href={dashboardAction.href}>
                  {dashboardAction.label}
                </Link>
              ) : null}
            </div>

            {nextSteps.length > 1 ? (
              <details className="mt-5 border-t border-[var(--pw-border)] pt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--pw-primary)]">View all</summary>
                <ul className="mt-3 grid gap-2">
                  {nextSteps.slice(1).map((step) => (
                    <li className="text-sm text-[var(--pw-muted)]" key={`${step.petName}-${step.title}`}>
                      {step.title}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          {selectedProfile && finishProfileItems.length > 0 ? (
            <section className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">
                    Finish {selectedPetName}&apos;s profile for better guidance
                  </h2>
                  <p className="mt-2 leading-7 text-[var(--pw-muted)]">
                    {selectedPetName}&apos;s profile is started. Add food, weight, and avoid ingredients when you&apos;re ready.
                  </p>
                  <ul className="mt-3 grid gap-2 text-sm font-semibold text-[var(--pw-text)] sm:grid-cols-2">
                    {finishProfileItems.map((item) => (
                      <li className="rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2" key={item.key}>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link className={primaryButtonInline} href={`/dogs/${selectedProfile.id}/edit`}>
                  Finish profile
                </Link>
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Recent updates</h2>
            {visibleEntries.length === 0 ? (
              <div className="mt-3 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
                <p className="font-semibold text-[var(--pw-heading)]">No care updates yet.</p>
                <Link
                  className="mt-3 inline-flex text-sm font-semibold text-[var(--pw-primary)]"
                  href={selectedProfile ? `/care-log?pet=${selectedProfile.id}&new=1` : "/care-log?new=1"}
                >
                  Log the first update
                </Link>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--pw-border)] rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-5">
                {visibleEntries.map((entry) => (
                  <li key={entry.id}>
                    <Link className="flex flex-col gap-3 rounded-2xl py-4 transition hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] sm:flex-row sm:items-center sm:justify-between sm:px-3" href={`/care-log?pet=${entry.pet_profile_id}&entry=${entry.id}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--pw-primary)]">{formatPetDisplayName(entry.pet_name)} - {formatCareEntryCategory(entry.category)}</p>
                        <p className="mt-1 font-semibold text-[var(--pw-heading)]">{entry.title || formatCareNotePreview(entry.note, 70)}</p>
                        {entry.title ? <p className="mt-1 text-sm text-[var(--pw-muted)]">{formatCareNotePreview(entry.note, 90)}</p> : null}
                      </div>
                      <time className="shrink-0 text-sm text-[var(--pw-subtle)]" dateTime={entry.occurred_at}>{formatCareEntryTimestamp(entry.occurred_at)}</time>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {storedGuidance ? (
            <section className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6">
              <p className="text-sm font-semibold text-[var(--pw-primary)]">Furvise says</p>
              <p className="mt-2 line-clamp-2 max-w-3xl leading-7 text-[var(--pw-heading)]">{storedGuidance.summary}</p>
              <Link
                className="mt-4 inline-flex text-sm font-semibold text-[var(--pw-primary)]"
                href={selectedProfile ? `/ask?pet=${selectedProfile.id}` : "/ask"}
              >
                Ask Furvise
              </Link>
            </section>
          ) : null}
        </div>
      )}
    </AppPage>
  );
}

function PetSwitcher({ profiles, selected, onSelect }: { profiles: DogProfileWithMemories[]; selected: string; onSelect: (id: string) => void }) {
  if (profiles.length === 1) {
    return (
      <Link
        className="inline-flex min-h-11 w-fit items-center gap-3 rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-4 font-semibold text-[var(--pw-heading)] transition hover:border-[var(--pw-primary)] hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]"
        href={`/pets/${profiles[0].id}`}
      >
        <Avatar name={profiles[0].name} />
        {formatPetDisplayName(profiles[0].name)}
      </Link>
    );
  }
  return (
    <div aria-label="Choose pets shown on Dashboard" className="flex gap-2 overflow-x-auto pb-1">
      <SwitcherButton active={selected === "all"} label="All pets" onClick={() => onSelect("all")} />
      {profiles.map((profile) => (
        <SwitcherButton
          active={selected === profile.id}
          href={selected === profile.id ? `/pets/${profile.id}` : undefined}
          label={formatPetDisplayName(profile.name)}
          onClick={() => onSelect(profile.id)}
          key={profile.id}
        />
      ))}
    </div>
  );
}

function SwitcherButton({ active, href, label, onClick }: { active: boolean; href?: string; label: string; onClick: () => void }) {
  const className = `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] ${
    active
      ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)] text-[var(--pw-primary)] hover:bg-[var(--pw-card-muted)]"
      : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-primary)]"
  }`;

  if (href) {
    return (
      <Link className={className} href={href}>
        <Avatar name={label} />
        {label}
      </Link>
    );
  }

  return (
    <button aria-pressed={active} className={className} onClick={onClick} type="button">
      <Avatar name={label} />
      {label}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  return <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pw-card-muted)] text-xs">{name.trim().slice(0, 1).toUpperCase()}</span>;
}

async function bootstrapAccountProductCountry(user: User) {
  try {
    const profile = await loadUserProfileForUser(user);
    if (!profile?.country) {
      await detectAccountProductCountry();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Furvise account] country bootstrap failed", {
        message: error instanceof Error ? error.message : "Unknown account profile error",
      });
    }
  }
}

function Status({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  return <div className={`mt-8 rounded-3xl border p-5 ${tone === "warn" ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]" : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]"}`} role="status">{text}</div>;
}

function getDashboardAction({
  memory,
  mainStep,
  selectedPetId,
  visibleEntries,
}: {
  memory: PetMemoryContext | null;
  mainStep: DashboardNextStepItem | null;
  selectedPetId: string;
  visibleEntries: CareEntryWithPetName[];
}) {
  if (memory) {
    const memoryStep = buildDashboardNextStep(memory);
    return {
      description: memoryStep.description,
      href:
        memory.timeline.recentEntries.length === 0
          ? selectedPetId
            ? `/care-log?pet=${selectedPetId}&new=1`
            : "/care-log?new=1"
          : selectedPetId
            ? `/care-log?pet=${selectedPetId}`
            : "/care-log",
      label: memory.timeline.recentEntries.length === 0 ? "Log update" : "Open care history",
      missingContext: memoryStep.missingContext,
      title: memoryStep.title,
    };
  }

  if (mainStep?.actionLabel === "Open care history" || mainStep?.actionLabel === "View severe update") {
    return {
      description: mainStep.description,
      href: mainStep.actionHref,
      label: normalizeActionLabel(mainStep),
      missingContext: [],
      title: mainStep.title,
    };
  }

  if (mainStep?.actionLabel === "Complete profile" || mainStep?.actionLabel === "Finish profile") {
    return {
      description: "Weight, food notes, or recent changes help Furvise give better guidance.",
      href: mainStep.actionHref,
      label: "Finish profile",
      missingContext: [],
      title: "Add one useful detail",
    };
  }

  if (visibleEntries.length === 0) {
    return {
      description: "Log appetite, activity, grooming, or anything you want Furvise to remember.",
      href: selectedPetId ? `/care-log?pet=${selectedPetId}&new=1` : "/care-log?new=1",
      label: "Log update",
      missingContext: [],
      title: "Start with one care update",
    };
  }

  if (mainStep?.actionHref) {
    return {
      description: mainStep.description,
      href: mainStep.actionHref,
      label: normalizeActionLabel(mainStep),
      missingContext: [],
      title: mainStep.title,
    };
  }

  return {
    description: "Your recent care information is up to date. Add a note when something changes.",
    href: selectedPetId ? `/care-log?pet=${selectedPetId}&new=1` : "/care-log?new=1",
    label: "Log update",
    missingContext: [],
    title: "Keep the care story current",
  };
}

function normalizeActionLabel(step: DashboardNextStepItem) {
  if (step.actionLabel === "Edit profile" || step.actionLabel === "Complete profile") return "Finish profile";
  if (step.actionLabel === "Continue care") return "Review guidance";
  if (step.actionLabel === "View memories") return "Log update";
  return step.actionLabel || "Open";
}

const primaryButton = "mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white";
const primaryButtonInline = "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white";
