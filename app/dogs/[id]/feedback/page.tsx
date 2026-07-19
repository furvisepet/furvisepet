"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SignedInHeader } from "../../../components/signed-in-header";
import {
  DogProductFeedbackRow,
  DogProfileRow,
  deleteProductFeedbackForUser,
  getCurrentUser,
  getSupabaseConfigError,
  loadDogProductFeedbackForUser,
  loadDogProfileForUser,
} from "../../../lib/supabase";
import { formatPetDisplayName } from "../../../lib/petwise";

export default function DogFeedbackPage() {
  const params = useParams<{ id: string }>();
  const dogId = params.id;
  const configError = getSupabaseConfigError();
  const [profile, setProfile] = useState<DogProfileRow | null>(null);
  const [feedback, setFeedback] = useState<DogProductFeedbackRow[]>([]);
  const [loading, setLoading] = useState(!configError);
  const [error, setError] = useState("");
  const [deletingFeedbackId, setDeletingFeedbackId] = useState("");

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in to manage this pet's product feedback.");

      const [profileRow, feedbackRows] = await Promise.all([
        loadDogProfileForUser(dogId, user),
        loadDogProductFeedbackForUser(dogId, user),
      ]);
      setProfile(profileRow);
      setFeedback(feedbackRows);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Furvise could not load product feedback. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useEffect(() => {
    if (configError) return;

    const loadTimer = window.setTimeout(() => {
      loadFeedback();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [configError, loadFeedback]);

  async function deleteFeedback(item: DogProductFeedbackRow) {
    if (!window.confirm("Delete this product feedback?")) return;

    setDeletingFeedbackId(item.id);
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before deleting feedback.");

      await deleteProductFeedbackForUser(item.id, dogId, user);
      setFeedback((current) => current.filter((feedbackItem) => feedbackItem.id !== item.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Furvise could not delete that feedback. Please try again.",
      );
    } finally {
      setDeletingFeedbackId("");
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto w-full max-w-4xl px-5 py-5 sm:px-8">
        <SignedInHeader />

        <section className="py-10 sm:py-14">
          <p className="mb-4 inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-sm font-medium text-[var(--pw-primary)]">
            Product feedback
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
            {profile ? `${formatPetDisplayName(profile.name)}'s product feedback` : "Product feedback"}
          </h1>
        </section>

        {configError ? (
          <StatusPanel tone="warn" text={configError} />
        ) : loading ? (
          <StatusPanel text="Loading product feedback..." />
        ) : error && !profile ? (
          <StatusPanel tone="warn" text={error} />
        ) : (
          <section className="pb-16">
            {error ? (
              <div className="mb-4 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]">
                {error}
              </div>
            ) : null}

            {feedback.length > 0 ? (
              <div className="grid gap-4">
                {feedback.map((item) => (
                  <article
                    className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm"
                    key={item.id}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Badge label={formatFeedbackType(item.feedback_type)} />
                          <Badge label={formatDate(item.created_at)} muted />
                        </div>
                        <h2 className="mt-4 text-xl font-semibold text-[var(--pw-text)]">
                          {item.product_name}
                        </h2>
                        {item.note ? (
                          <p className="mt-2 leading-7 text-[var(--pw-muted)]">{item.note}</p>
                        ) : null}
                      </div>
                      <button
                        className="rounded-full border border-[var(--pw-danger-border)] bg-[var(--pw-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--pw-danger-text)] transition hover:border-[var(--pw-danger-text)] disabled:cursor-wait disabled:text-[var(--pw-subtle)]"
                        disabled={deletingFeedbackId === item.id}
                        onClick={() => deleteFeedback(item)}
                        type="button"
                      >
                        {deletingFeedbackId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
                <h2 className="text-2xl font-semibold text-[var(--pw-text)]">
                  No product feedback yet.
                </h2>
                <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                  Continue recommendations and mark what worked, failed, or cost too much.
                </p>
              </div>
            )}

            <Link
              className="mt-6 inline-flex rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
              href="/dashboard"
            >
              Back to dashboard
            </Link>
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

function formatFeedbackType(type: string) {
  if (type === "saved") return "Saved";
  if (type === "tried") return "Tried";
  if (type === "worked") return "Worked";
  if (type === "did_not_work") return "Didn't work";
  if (type === "too_expensive") return "Too expensive";
  if (type === "avoid_product") return "Avoid";
  return type.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
