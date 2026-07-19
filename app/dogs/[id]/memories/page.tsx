"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignedInHeader } from "../../../components/signed-in-header";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import {
  DogMemoryRow,
  DogProfileWithMemories,
  deleteDogMemoriesForUser,
  deleteDogMemoryForUser,
  getCurrentUser,
  getSupabaseConfigError,
  loadDogProfileWithMemoriesForUser,
} from "../../../lib/supabase";
import { formatPetDisplayName } from "../../../lib/petwise";

export default function DogMemoriesPage() {
  const params = useParams<{ id: string }>();
  const dogId = params.id;
  const resultsHref = dogId ? `/results?profileId=${encodeURIComponent(dogId)}` : "/results";
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, setProfile] = useState<DogProfileWithMemories | null>(null);
  const [loading, setLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deletingMemoryId, setDeletingMemoryId] = useState("");
  const [cleaningAction, setCleaningAction] = useState<"duplicates" | "weak" | "">("");

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const user = authUser;
      if (!user) return null;

      const row = await loadDogProfileWithMemoriesForUser(dogId, user);
      setProfile(row);
      return row;
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Furvise could not load saved details. Please try again.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [authUser, dogId]);

  useEffect(() => {
    if (configError) {
      return;
    }
    if (authStatus !== "signedIn" || !authUser) return;

    const loadTimer = window.setTimeout(() => {
      loadMemories();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [authStatus, authUser, configError, loadMemories]);

  async function deleteMemory(memory: DogMemoryRow) {
    if (!window.confirm("Delete this saved memory?")) return;

    setDeletingMemoryId(memory.id);
    setError("");
    setStatus("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before deleting this memory.");

      await deleteDogMemoryForUser(memory.id, dogId, user);
      setProfile((current) =>
        current
          ? {
              ...current,
              dog_memories: current.dog_memories.filter((item) => item.id !== memory.id),
            }
          : current,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Furvise could not delete that memory. Please try again.",
      );
    } finally {
      setDeletingMemoryId("");
    }
  }

  async function cleanUpDuplicates() {
    if (!profile) return;

    const duplicateIds = findDuplicateMemoryIds(profile.dog_memories);
    setCleaningAction("duplicates");
    setError("");
    setStatus("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before cleaning up memories.");

      await deleteDogMemoriesForUser(duplicateIds, dogId, user);
      await loadMemories();
      setStatus(`Removed ${duplicateIds.length} duplicate memories.`);
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Furvise could not clean up memories. Please try again.",
      );
    } finally {
      setCleaningAction("");
    }
  }

  async function removeWeakMemories() {
    if (!profile) return;
    if (
      !window.confirm(
        "Remove low-value memories like unknown age, unknown weight, and unknown current food?",
      )
    ) {
      return;
    }

    const weakIds = profile.dog_memories
      .filter((memory) => isWeakMemory(memory.text))
      .map((memory) => memory.id);

    setCleaningAction("weak");
    setError("");
    setStatus("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before removing weak memories.");

      await deleteDogMemoriesForUser(weakIds, dogId, user);
      await loadMemories();
      setStatus(`Removed ${weakIds.length} weak memories.`);
    } catch (cleanupError) {
      setError(
        cleanupError instanceof Error
          ? cleanupError.message
          : "Furvise could not remove those memories. Please try again.",
      );
    } finally {
      setCleaningAction("");
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto w-full max-w-4xl px-5 py-5 sm:px-8">
        <SignedInHeader />

        <section className="py-10 sm:py-14">
          <p className="mb-4 inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-sm font-medium text-[var(--pw-primary)]">
            Saved details
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
            {profile ? `${formatPetDisplayName(profile.name)}'s saved details` : "Saved details"}
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-[var(--pw-muted)]">
            Saved details are facts and preferences Furvise can reuse when you continue recommendations.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--pw-subtle)]">
            Care history stores timeline updates. Saved details store reusable facts Furvise should remember.
          </p>
        </section>

        {configError ? (
          <StatusPanel tone="warn" text={configError} />
        ) : loading ? (
          <StatusPanel text="Loading saved details..." />
        ) : error && !profile ? (
          <StatusPanel tone="warn" text={error} />
        ) : (
          <section className="pb-16">
            {error ? (
              <div className="mb-4 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]">
                {error}
              </div>
            ) : null}
            {status ? (
              <div className="mb-4 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
                {status}
              </div>
            ) : null}

            {profile && profile.dog_memories.length > 0 ? (
              <>
                <div className="mb-5 flex flex-col gap-3 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-6 text-[var(--pw-muted)]">
                    Clean up saved details without changing this pet&apos;s profile.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      className="rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--pw-primary)] transition hover:border-[var(--pw-secondary)] disabled:cursor-wait disabled:text-[var(--pw-subtle)]"
                      disabled={Boolean(cleaningAction)}
                      onClick={cleanUpDuplicates}
                      type="button"
                    >
                      {cleaningAction === "duplicates" ? "Cleaning..." : "Clean up duplicates"}
                    </button>
                    <button
                      className="rounded-full border border-[var(--pw-danger-border)] bg-[var(--pw-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--pw-danger-text)] transition hover:border-[var(--pw-danger-text)] disabled:cursor-wait disabled:text-[var(--pw-subtle)]"
                      disabled={Boolean(cleaningAction)}
                      onClick={removeWeakMemories}
                      type="button"
                    >
                      {cleaningAction === "weak" ? "Removing..." : "Remove weak memories"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4">
                  {groupDuplicateMemories(profile.dog_memories).map((group) => (
                    <article
                      className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm"
                      key={group.key}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <Badge label={formatMemoryType(group.primary.type)} />
                            <Badge label={group.primary.confidence || "Confidence not set"} />
                            <Badge label={formatSource(group.primary.source)} muted />
                            {group.memories.length > 1 ? (
                              <Badge
                                label={`${group.memories.length} duplicates grouped`}
                                muted
                              />
                            ) : null}
                          </div>
                          <p className="mt-4 text-lg font-semibold leading-7 text-[var(--pw-text)]">
                            {group.primary.text}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          {group.memories.map((memory, index) => (
                            <button
                              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--pw-danger-text)] transition hover:bg-[var(--pw-danger-surface)] disabled:cursor-wait disabled:text-[var(--pw-subtle)]"
                              disabled={deletingMemoryId === memory.id || Boolean(cleaningAction)}
                              key={memory.id}
                              onClick={() => deleteMemory(memory)}
                              type="button"
                            >
                              {deletingMemoryId === memory.id
                                ? "Deleting..."
                                : group.memories.length > 1
                                  ? `Delete ${index + 1}`
                                  : "Delete"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
                <h2 className="text-2xl font-semibold text-[var(--pw-text)]">
                  No saved details yet.
                </h2>
                <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                  Saved details are reusable facts and preferences Furvise can remember for future guidance, like avoid ingredients, food notes, routines, or preferences.
                </p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="inline-flex rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
                    href="/dashboard"
                  >
                    Back to dashboard
                  </Link>
                  <Link
                    className="inline-flex rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-5 py-3 text-sm font-semibold text-[var(--pw-primary)] transition hover:border-[var(--pw-secondary)]"
                    href={resultsHref}
                  >
                    {dogId ? "Go to Results" : "Continue recommendations"}
                  </Link>
                </div>
              </div>
            )}

            {profile && profile.dog_memories.length > 0 ? (
              <Link
                className="mt-6 inline-flex rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
                href="/dashboard"
              >
                Back to dashboard
              </Link>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}

function Badge({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
        muted ? "border border-[var(--pw-border)] text-[var(--pw-muted)]" : "bg-[var(--pw-primary-soft)] text-[var(--pw-primary)]"
      }`}
    >
      {label}
    </span>
  );
}

function StatusPanel({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  const classes =
    tone === "warn"
      ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]"
      : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]";

  return (
    <div className={`rounded-[2rem] border p-6 font-semibold shadow-sm ${classes}`}>{text}</div>
  );
}

function formatMemoryType(type: string | null) {
  if (type === "profile_fact") return "Profile fact";
  if (type === "owner_observation") return "Owner observation";
  if (type === "preference") return "Preference";
  return "Type not set";
}

function formatSource(source: string | null) {
  if (source === "ai_suggestion") return "Suggested";
  return source || "Source not set";
}

function groupDuplicateMemories(memories: DogMemoryRow[]) {
  const groups: {
    key: string;
    primary: DogMemoryRow;
    memories: DogMemoryRow[];
  }[] = [];
  const groupByText = new Map<string, (typeof groups)[number]>();

  memories.forEach((memory) => {
    const key = normalizeMemoryText(memory.text);
    if (!key) return;

    const existing = groupByText.get(key);
    if (existing) {
      existing.memories.push(memory);
      return;
    }

    const group = { key, primary: memory, memories: [memory] };
    groups.push(group);
    groupByText.set(key, group);
  });

  groups.forEach((group) => {
    group.memories.sort(compareOldestFirst);
    group.primary = group.memories[0];
  });

  return groups;
}

function normalizeMemoryText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function findDuplicateMemoryIds(memories: DogMemoryRow[]) {
  return groupDuplicateMemories(memories).flatMap((group) =>
    group.memories.length > 1 ? group.memories.slice(1).map((memory) => memory.id) : [],
  );
}

function compareOldestFirst(left: DogMemoryRow, right: DogMemoryRow) {
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
}

function isWeakMemory(text: string) {
  const normalized = normalizeMemoryText(text);
  if (!normalized) return false;

  const weakPatterns = [
    /\bage\s+(is\s+)?(unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bweight\s+(is\s+)?(unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bcurrent food\s+(is\s+)?(unknown|not known|not sure|i'?m not sure|missing|not provided|unspecified)\b/,
    /\bfood\s+(is\s+)?(unknown|not known|not sure|i'?m not sure|missing|not provided|unspecified)\b/,
    /\bbreed\s+(is\s+)?(mixed\s*\/?\s*unknown|unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bmixed\s*\/\s*unknown\b/,
  ];

  return weakPatterns.some((pattern) => pattern.test(normalized));
}
