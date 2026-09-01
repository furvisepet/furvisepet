"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppPage } from "../../../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../../../lib/auth-session";
import {
  DogProfile,
  avoidIngredientChips,
  initialProfile,
  isNoneKnown,
  MAIN_CONCERN_OPTIONS,
  normalizeAvoidIngredientValues,
  parsePositiveNumber,
  formatPetDisplayName,
} from "../../../lib/petwise";
import {
  dogProfileRowToDraft,
  getCurrentUser,
  getSupabaseConfigError,
  loadDogProfileForUser,
  saveDogProfileForUser,
} from "../../../lib/supabase";
import { petProfileDraftsEqual, reducePetProfileDraft } from "../../../lib/pet-profile-draft";

const knownAvoidIngredients = avoidIngredientChips.filter((item) => item !== "None known");

export default function EditDogProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dogId = params.id;
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profile, dispatchProfile] = useReducer(reducePetProfileDraft, initialProfile);
  const [savedProfile, setSavedProfile] = useState<DogProfile>(initialProfile);
  const loadedIdentityRef = useRef("");
  const [loading, setLoading] = useState(!configError);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const mainConcernError = getMainConcernError(profile);
  const dirty = !petProfileDraftsEqual(profile, savedProfile);

  useEffect(() => {
    let active = true;

    if (configError) return;
    if (authStatus !== "signedIn" || !authUser) return;

    const identity = `${authUser.id}:${dogId}`;
    if (loadedIdentityRef.current === identity) return;
    loadedIdentityRef.current = identity;

    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const user = authUser;
        if (!user) return;

        const row = await loadDogProfileForUser(dogId, user);
        if (!active) return;
        const nextProfile = dogProfileRowToDraft(row);
        setSavedProfile(nextProfile);
        dispatchProfile({ type: "load", profile: nextProfile });
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Furvise could not load that pet profile. Please try again.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, configError, dogId]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const guardLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLink, true); };
  }, [dirty]);

  const customAvoidIngredient = useMemo(
    () =>
      profile.avoidIngredients
        .filter(
          (item) =>
            !knownAvoidIngredients.some(
              (known) => known.toLowerCase() === item.toLowerCase(),
            ),
        )
        .join(", "),
    [profile.avoidIngredients],
  );

  function updateProfile(update: Partial<DogProfile>) {
    dispatchProfile({ type: "patch", values: update });
  }

  function toggleAvoidIngredient(ingredient: string) {
    if (ingredient === "None known") {
      if (profile.avoidIngredients.length && !window.confirm("Clear the selected ingredient exclusions?")) return;
      updateProfile({ avoidIngredients: [], avoidIngredientsNoneKnown: true, customAvoidIngredient: "" });
      return;
    }

    const exists = profile.avoidIngredients.includes(ingredient);
    dispatchProfile({ type: "patch", values: {
        avoidIngredientsNoneKnown: false,
        avoidIngredients: exists
          ? profile.avoidIngredients.filter((item) => item !== ingredient)
          : [...profile.avoidIngredients, ingredient],
      } });
  }

  function updateCustomAvoidIngredient(value: string) {
    if (isNoneKnown(value)) {
      updateProfile({ avoidIngredients: [], avoidIngredientsNoneKnown: true, customAvoidIngredient: value });
      return;
    }

    const customIngredients = normalizeAvoidIngredientValues(value.split(","));
    dispatchProfile({ type: "patch", values: {
      avoidIngredientsNoneKnown: false,
      customAvoidIngredient: value,
      avoidIngredients: [
        ...profile.avoidIngredients.filter((item) =>
          knownAvoidIngredients.some((known) => known.toLowerCase() === item.toLowerCase()),
        ),
        ...customIngredients.filter(
          (item) => !knownAvoidIngredients.some((known) => known.toLowerCase() === item.toLowerCase()),
        ),
      ],
    } });
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");

    const validationError = validateProfile(profile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before saving.");

      await saveDogProfileForUser(profile, user, dogId);
      setSavedProfile(profile);
      setStatus("Profile saved.");
      router.push(`/pets/${encodeURIComponent(dogId)}`);
      router.refresh();
    } catch {
      setError("Furvise could not save this pet profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage>
        <div className="w-full max-w-3xl min-w-0">
          <section className="py-6 sm:py-8 lg:py-10">
            <p className="mb-3 inline-flex max-w-full rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-sm font-medium text-[var(--pw-primary)]">
              Edit profile
            </p>
            <h1 className="break-words text-3xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-4xl lg:text-[2.75rem]">
              Update {formatPetDisplayName(profile.name)}&apos;s details
            </h1>
          </section>

          {configError ? (
            <StatusPanel tone="warn" text={configError} />
          ) : loading ? (
            <StatusPanel text="Loading pet profile..." />
          ) : error && !profile.name ? (
            <StatusPanel tone="warn" text={error} />
          ) : (
            <form
              className="mb-20 w-full max-w-full min-w-0 rounded-[1.5rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 shadow-[0_18px_45px_var(--pw-shadow)] sm:mb-16 sm:p-6 lg:p-7"
              onSubmit={saveProfile}
            >
              <div className="grid gap-4 sm:gap-5">
                <Field id="name" label="Name">
                  <input
                    className={inputClass}
                    onChange={(event) => updateProfile({ name: event.target.value })}
                    required
                    value={profile.name}
                  />
                </Field>

                <Field id="species" label="Species">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["dog", "cat"] as const).map((species) => (
                      <button
                        className={`min-w-0 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold transition sm:text-base ${
                          profile.species === species
                            ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)] text-[var(--pw-text)]"
                            : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-secondary)]"
                        }`}
                        key={species}
                        onClick={() => updateProfile({ species })}
                        type="button"
                      >
                        {species === "dog" ? "Dog" : "Cat"}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field id="breed" label="Breed">
                  <input
                    className={inputClass}
                    onChange={(event) => updateProfile({ breed: event.target.value })}
                    placeholder="Mixed / unknown"
                    value={profile.breed}
                  />
                </Field>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field id="age" label="Age">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,auto)]">
                      <input
                        className={inputClass}
                        disabled={profile.ageUnknown}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateProfile({ age: event.target.value, ageUnknown: false })
                        }
                        placeholder="4"
                        value={profile.age}
                      />
                      <Segmented
                        options={["months", "years"]}
                        selected={profile.ageUnit}
                        setSelected={(unit) => updateProfile({ ageUnit: unit })}
                      />
                    </div>
                    <CheckRow
                      checked={profile.ageUnknown}
                      label="I'm not sure"
                      onChange={(checked) => updateProfile({ ageUnknown: checked })}
                    />
                  </Field>

                  <Field id="weight" label="Weight">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,auto)]">
                      <input
                        className={inputClass}
                        disabled={profile.weightUnknown}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateProfile({ weight: event.target.value, weightUnknown: false })
                        }
                        placeholder="42"
                        value={profile.weight}
                      />
                      <Segmented
                        options={["lb", "kg"]}
                        selected={profile.weightUnit}
                        setSelected={(unit) => updateProfile({ weightUnit: unit })}
                      />
                    </div>
                    <CheckRow
                      checked={profile.weightUnknown}
                      label="I'm not sure"
                      onChange={(checked) =>
                        updateProfile({ weightUnknown: checked })
                      }
                    />
                  </Field>
                </div>

                <Field id="current-food" label="Current food">
                  <input
                    className={inputClass}
                    disabled={profile.currentFoodUnknown}
                    onChange={(event) =>
                      updateProfile({ currentFood: event.target.value, currentFoodUnknown: false })
                    }
                    placeholder="Chicken and rice kibble"
                    value={profile.currentFood}
                  />
                  <CheckRow
                    checked={profile.currentFoodUnknown}
                    label="I'm not sure"
                    onChange={(checked) =>
                      updateProfile({
                        currentFoodUnknown: checked,
                      })
                    }
                  />
                </Field>

                <Field id="main-concern" label="Main concern">
                  <div className="grid gap-2">
                    {MAIN_CONCERN_OPTIONS.map((option) => (
                      <button
                        className={`min-w-0 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold transition sm:text-base ${
                          profile.mainConcern === option
                            ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)] text-[var(--pw-text)]"
                            : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-secondary)]"
                        }`}
                        key={option}
                        onClick={() => updateProfile({ mainConcern: option })}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                    {profile.mainConcern === "Other" ? (
                      <input
                        className={inputClass}
                        onChange={(event) => updateProfile({ otherConcern: event.target.value })}
                        placeholder="Describe the concern"
                        value={profile.otherConcern}
                      />
                    ) : null}
                  </div>
                  {mainConcernError && error === mainConcernError ? (
                    <p className="mt-3 text-sm font-semibold text-[var(--pw-danger-text)]">
                      {mainConcernError}
                    </p>
                  ) : null}
                </Field>

                <Field id="avoid-ingredients" label="Avoid ingredients">
                  <div className="flex flex-wrap gap-2">
                    {avoidIngredientChips.map((ingredient) => {
                      const selected =
                        ingredient === "None known"
                          ? Boolean(profile.avoidIngredientsNoneKnown)
                          : profile.avoidIngredients.includes(ingredient);
                      return (
                        <button
                          className={`inline-flex min-h-10 max-w-full items-center justify-center break-words rounded-full border px-3.5 py-2 text-center text-sm font-semibold leading-5 transition sm:min-h-11 sm:text-base ${
                            selected
                              ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)] text-[var(--pw-text)]"
                              : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-secondary)]"
                          }`}
                          key={ingredient}
                          onClick={() => toggleAvoidIngredient(ingredient)}
                          type="button"
                        >
                          {ingredient}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    className={`${inputClass} mt-3`}
                    onChange={(event) => updateCustomAvoidIngredient(event.target.value)}
                    placeholder="Add another ingredient, or type none"
                    value={profile.customAvoidIngredient || customAvoidIngredient}
                  />
                </Field>

                <Field id="budget" label="Monthly care budget">
                  <div className="flex min-w-0 overflow-hidden rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] focus-within:border-[var(--pw-focus-ring)] focus-within:bg-[var(--pw-surface)]">
                    <span className="flex shrink-0 items-center px-3.5 text-base font-semibold text-[var(--pw-muted)]">
                      $
                    </span>
                    <input
                      className="min-h-11 w-full min-w-0 bg-transparent py-2.5 pr-3.5 text-base font-semibold text-[var(--pw-text)] outline-none placeholder:text-[var(--pw-placeholder)]"
                      inputMode="decimal"
                      onChange={(event) => updateProfile({ monthlyBudget: event.target.value })}
                      placeholder="80"
                      value={profile.monthlyBudget}
                    />
                  </div>
                </Field>
              </div>

              {error && error !== mainConcernError ? (
                <div className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]">
                  {error}
                </div>
              ) : null}
              {status ? (
                <div className="mt-5 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
                  {status}
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 border-t border-[var(--pw-border)] pt-5 sm:grid-cols-2">
                <Link
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-5 py-3 text-center text-base font-semibold text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)]"
                  href={`/pets/${encodeURIComponent(dogId)}`}
                >
                  Cancel
                </Link>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 py-3 text-base font-semibold text-[var(--pw-primary-foreground)] transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)]"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          )}
        </div>
    </AppPage>
  );
}

const inputClass =
  "min-h-11 w-full min-w-0 rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-3.5 py-2.5 text-base font-semibold text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-focus-ring)] focus:bg-[var(--pw-surface)] disabled:border-[var(--pw-border)] disabled:bg-[var(--pw-card-muted)] disabled:text-[var(--pw-subtle)] disabled:opacity-100";

function Field({
  children,
  id,
  label,
}: {
  children: React.ReactNode;
  id?: string;
  label: string;
}) {
  return (
    <div className="block scroll-mt-24" id={id}>
      <span className="mb-2 block text-sm font-semibold text-[var(--pw-muted)]">{label}</span>
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mt-2 flex min-w-0 items-start gap-2.5 rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2.5 text-sm text-[var(--pw-muted)]">
      <input
        checked={checked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold text-[var(--pw-muted)]">{label}</span>
        <span className="mt-1 block leading-5 text-[var(--pw-subtle)]">
          Use this if you do not know the exact value yet.
        </span>
      </span>
    </label>
  );
}

function Segmented<T extends string>({
  options,
  selected,
  setSelected,
}: {
  options: readonly T[];
  selected: T;
  setSelected: (value: T) => void;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] sm:w-auto sm:min-w-[7.5rem]">
      {options.map((option) => (
        <button
          className={`min-h-11 px-3 py-2 text-sm font-semibold transition ${
            selected === option ? "bg-[var(--pw-primary)] text-[var(--pw-primary-foreground)]" : "text-[var(--pw-muted)]"
          }`}
          key={option}
          onClick={() => setSelected(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
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

function validateProfile(profile: DogProfile) {
  if (!profile.name.trim()) return "Please add your pet's name.";
  if (!profile.species) return "Choose dog or cat before saving.";
  if (!profile.ageUnknown) {
    const age = parsePositiveNumber(profile.age);
    if (!profile.age.trim() || !Number.isFinite(age) || age < 0) {
      return "Enter a valid age, or choose I'm not sure.";
    }
  }
  if (!profile.weightUnknown) {
    const weight = parsePositiveNumber(profile.weight);
    if (!profile.weight.trim() || !Number.isFinite(weight) || weight <= 0) {
      return "Enter a valid weight, or choose I'm not sure.";
    }
  }
  const mainConcernError = getMainConcernError(profile);
  if (mainConcernError) return mainConcernError;
  if (profile.mainConcern === "Other" && !profile.otherConcern.trim()) {
    return "Add the custom concern you want Furvise to help with.";
  }
  const budget = parsePositiveNumber(profile.monthlyBudget);
  if (!profile.monthlyBudget.trim() || !Number.isFinite(budget) || budget <= 0) {
    return "Enter a positive monthly care budget.";
  }
  return "";
}

function getMainConcernError(profile: DogProfile) {
  if (!profile.mainConcern) return "Choose the main thing you want Furvise to help with.";
  return "";
}
