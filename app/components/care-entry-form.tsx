"use client";

import { useId, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CareEntryInput, CareEntryRow } from "../lib/supabase";
import {
  CARE_ENTRY_CATEGORIES,
  CARE_ENTRY_SEVERITIES,
  formatCareEntryCategory,
  getSevereSymptomCautionMessage,
  isSevereSymptomCareEntry,
  toLocalDateTimeInputValue,
  validateCareEntryDraft,
} from "../lib/care-log.mjs";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import type { PetSpecies } from "../lib/petwise";

type CarePetOption = {
  id: string;
  name: string;
  species: PetSpecies | null;
};

type CareEntryFormProps = {
  cancelLabel?: string;
  initialEntry?: CareEntryRow | null;
  initialPetId?: string;
  lockedPetId?: string | null;
  pets: CarePetOption[];
  submitLabel?: string;
  onCancel: () => void;
  onSaved?: (entry: CareEntryRow) => void;
  onSubmit: (input: CareEntryInput) => Promise<CareEntryRow>;
};

type CareEntryDraft = {
  category: string;
  note: string;
  occurredAt: string;
  petProfileId: string;
  severity: CareEntryInput["severity"];
  title: string;
};

const emptyDraft = (petProfileId = ""): CareEntryDraft => ({
  category: "",
  note: "",
  occurredAt: toLocalDateTimeInputValue(),
  petProfileId,
  severity: null,
  title: "",
});

export function CareEntryForm({
  cancelLabel = "Cancel",
  initialEntry,
  initialPetId = "",
  lockedPetId = null,
  pets,
  submitLabel = "Save update",
  onCancel,
  onSaved,
  onSubmit,
}: CareEntryFormProps) {
  const noteId = useId();
  const [draft, setDraft] = useState<CareEntryDraft>(() =>
    buildInitialDraft(initialEntry, initialPetId, lockedPetId, pets),
  );
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formStatus, setFormStatus] = useState("");

  const validation = useMemo(() => validateCareEntryDraft(draft), [draft]);
  const severityVisible = draft.category === "symptom" || draft.category === "behavior";
  const showSevereCaution = isSevereSymptomCareEntry(draft as CareEntryRowLike);
  const severeCautionMessage = getSevereSymptomCautionMessage(draft as CareEntryRowLike);
  const petIsLocked = Boolean(lockedPetId);
  const selectedPetName = formatPetDisplayName(
    pets.find((pet) => pet.id === draft.petProfileId)?.name,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setAttempted(true);
    setFormError("");
    setFormStatus("");

    const result = validateCareEntryDraft(draft);
    if (!result.valid) {
      return;
    }

    setSubmitting(true);
    try {
      const saved = await onSubmit({
        category: result.draft.category as CareEntryInput["category"],
        note: result.draft.note,
        occurredAt: result.draft.occurredAt,
        petProfileId: result.draft.petProfileId,
        severity: result.draft.severity as CareEntryInput["severity"],
        title: result.draft.title,
      });
      onSaved?.(saved);
      setFormStatus(initialEntry ? "Care update saved." : "Care update added.");
      if (!initialEntry) {
        setDraft(emptyDraft(lockedPetId || draft.petProfileId));
        setAttempted(false);
      }
    } catch (saveError) {
      logCareEntrySaveFailure(saveError, initialEntry ? "update" : "insert");
      setFormError("Furvise could not save this update. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateDraft(update: Partial<CareEntryDraft>) {
    setDraft((current) => {
      const next = { ...current, ...update };
      if (update.category && update.category !== "symptom" && update.category !== "behavior") {
        next.severity = null;
      }
      return next;
    });
  }

  function handleCancel() {
    setAttempted(false);
    setFormError("");
    setFormStatus("");
    if (!initialEntry) {
      setDraft(emptyDraft(lockedPetId || draft.petProfileId));
    }
    onCancel();
  }

  const petError = attempted ? validation.errors.petProfileId : "";
  const categoryError = attempted ? validation.errors.category : "";
  const noteError = attempted ? validation.errors.note : "";
  const occurredAtError = attempted ? validation.errors.occurredAt : "";

  return (
    <form
      className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm sm:p-6"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
            Care update
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--pw-heading)]">
            {initialEntry ? "Edit care update" : "Log a care update"}
          </h2>
        </div>
        {formStatus ? (
          <p aria-live="polite" className="text-sm font-medium text-[var(--pw-primary)]">
            {formStatus}
          </p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5">
        <Field label="Pet" error={petError}>
          {petIsLocked ? (
            <>
              <input name="petProfileId" type="hidden" value={draft.petProfileId} />
              <div className="rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-card-muted)] px-4 py-3 text-base font-semibold text-[var(--pw-text)]">
                {selectedPetName}
              </div>
            </>
          ) : (
            <select
              className={inputClass}
              onChange={(event) => updateDraft({ petProfileId: event.target.value })}
              required
              value={draft.petProfileId}
            >
              <option value="">Choose a pet</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {formatPetDisplayName(pet.name)} ({formatSpecies(pet.species)})
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Category" error={categoryError}>
            <select
              className={inputClass}
              onChange={(event) => updateDraft({ category: event.target.value as CareEntryInput["category"] })}
              required
              value={draft.category}
          >
            <option value="">Choose a category</option>
            {CARE_ENTRY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {formatCareEntryCategory(category)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title">
          <input
            className={inputClass}
            onChange={(event) => updateDraft({ title: event.target.value })}
            placeholder="Short summary"
            value={draft.title}
          />
        </Field>

        <Field label="Details" error={noteError}>
          <textarea
            aria-describedby={noteId}
            className={`${inputClass} min-h-36 resize-y`}
            onChange={(event) => updateDraft({ note: event.target.value })}
            placeholder="Describe what happened"
            required
            value={draft.note}
          />
          <p className="mt-2 text-sm text-[var(--pw-subtle)]" id={noteId}>
            Keep it factual. Furvise does not make diagnoses.
          </p>
        </Field>

        <Field label="Occurred date/time" error={occurredAtError}>
          <input
            className={inputClass}
            onChange={(event) => updateDraft({ occurredAt: event.target.value })}
            required
            type="datetime-local"
            value={draft.occurredAt}
          />
        </Field>

        {severityVisible ? (
          <Field label="Severity">
            <select
              className={inputClass}
              onChange={(event) =>
                updateDraft({
                  severity:
                    event.target.value === ""
                      ? null
                      : (event.target.value as CareEntryInput["severity"]),
                })
              }
              value={draft.severity || ""}
            >
              <option value="">Optional</option>
              {CARE_ENTRY_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity.charAt(0).toUpperCase() + severity.slice(1)}
                </option>
              ))}
            </select>
            {showSevereCaution ? (
              <div
                className="mt-3 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm leading-6 text-[var(--pw-warning-text)]"
                role="note"
              >
                {severeCautionMessage}
              </div>
            ) : null}
          </Field>
        ) : (
          <div className="rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-4 py-3 text-sm leading-6 text-[var(--pw-muted)]">
            Severity is shown for symptom and behavior updates.
          </div>
        )}
      </div>

      {attempted && (petError || categoryError || noteError || occurredAtError) ? (
        <div className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]" aria-live="assertive">
          Please fix the highlighted fields.
        </div>
      ) : null}

      {formError ? (
        <div className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]" aria-live="assertive">
          {formError}
        </div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-5 py-3 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] disabled:cursor-wait disabled:opacity-70"
          disabled={submitting}
          onClick={handleCancel}
          type="button"
        >
          {cancelLabel}
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--pw-primary)_35%,transparent)] disabled:cursor-wait disabled:bg-[var(--pw-secondary)]"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function logCareEntrySaveFailure(error: unknown, action: "insert" | "update") {
  if (process.env.NODE_ENV === "production") return;

  const databaseError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };

  console.warn("[Furvise care] care entry save failed", {
    action,
    errorCode: databaseError?.code || "",
    errorDetails: databaseError?.details || "",
    errorHint: databaseError?.hint || "",
    errorMessage: databaseError?.message || "",
    table: "pet_care_entries",
  });
}

function buildInitialDraft(
  initialEntry: CareEntryRow | null | undefined,
  initialPetId: string,
  lockedPetId: string | null,
  pets: CarePetOption[],
): CareEntryDraft {
  if (initialEntry) {
    return {
      category: initialEntry.category,
      note: initialEntry.note,
      occurredAt: toLocalDateTimeInputValue(new Date(initialEntry.occurred_at)),
      petProfileId: initialEntry.pet_profile_id,
      severity: initialEntry.severity,
      title: initialEntry.title || "",
    };
  }

  return emptyDraft(lockedPetId || initialPetId || (pets.length === 1 ? pets[0]?.id || "" : ""));
}

function Field({
  children,
  error,
  label,
}: {
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-subtle)]">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-2 block text-sm font-medium text-[var(--pw-danger-text)]" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type CareEntryRowLike = {
  category: string;
  severity: string | null;
};

const inputClass =
  "w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base font-semibold text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)] disabled:opacity-50";
