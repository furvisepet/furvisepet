"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignedInHeader } from "../components/signed-in-header";
import {
  ANALYSIS_STORAGE_KEY,
  StoredAnalysisResult,
  parseAnalysis,
  parseAnalysisMemoryContext,
} from "../lib/ai-analysis";
import {
  PetProfile,
  ONBOARDING_MODE_STORAGE_KEY,
  MAIN_CONCERN_OPTIONS,
  OnboardingMode,
  STORAGE_KEY,
  avoidIngredientChips,
  initialProfile,
  isNoneKnown,
  normalizeAvoidIngredientValues,
  normalizeProfile,
  parsePositiveNumber,
} from "../lib/petwise";
import {
  PROFILE_ID_STORAGE_KEY,
  PROFILE_MEMORIES_STORAGE_KEY,
  countPetProfilesForUser,
  getCurrentUser,
  petProfileRowToDraft,
  loadPetProfileForUser,
  savePetProfileForUser,
} from "../lib/supabase";
import { useConfirmedSupabaseAuth } from "../lib/auth-session";
import { NEW_PET_ONBOARDING_PATH, buildLoginHref } from "../lib/auth-routing";
import { evaluatePetLimit, getUserPlan } from "../lib/billing/plan-limits";
import { writeStoredGuidanceResult } from "../lib/stored-guidance";
import { getOnboardingSaveProfileId, resolveOnboardingModeDecision } from "./mode-state";
import { buildSummaryItems, buildSummaryProfileStatus, type StepKey } from "./summary";
import {
  beginNumericFieldEntry,
  markNumericFieldUnknown,
  updateNumericFieldUnit,
  updateNumericFieldValue,
} from "./numeric-field";
import {
  beginTextFieldEntry,
  markTextFieldUnknown,
  updateTextFieldValue,
} from "./text-field";

type Step = {
  key: StepKey;
  eyebrow: string;
  question: string;
  helper: string;
};

const steps: Step[] = [
  {
    key: "name",
    eyebrow: "Pet profile",
    question: "What is your pet's name?",
    helper: "Use the name you want Furvise to remember.",
  },
  {
    key: "species",
    eyebrow: "Species",
    question: "Is your pet a dog or a cat?",
    helper: "Care and product suitability differ by species.",
  },
  {
    key: "breed",
    eyebrow: "Breed",
    question: "What breed is your pet?",
    helper: "Optional. Mixed breeds and unknown breeds are welcome.",
  },
  {
    key: "age",
    eyebrow: "Age",
    question: "How old is your pet?",
    helper: "A non-negative estimate is fine, or choose I'm not sure.",
  },
  {
    key: "weight",
    eyebrow: "Weight",
    question: "How much does your pet weigh?",
    helper: "Use lb or kg. An estimate is fine, or choose I'm not sure.",
  },
  {
    key: "currentFood",
    eyebrow: "Current food",
    question: "What food does your pet eat now?",
    helper: "Optional. Brand, recipe, or protein is enough.",
  },
  {
    key: "mainConcern",
    eyebrow: "Main concern",
    question: "What should Furvise focus on first?",
    helper: "Choose one primary concern for now.",
  },
  {
    key: "avoidIngredients",
    eyebrow: "Ingredients",
    question: "Any ingredients to avoid?",
    helper: "Choose known ingredients, add your own, or select None known.",
  },
  {
    key: "monthlyBudget",
    eyebrow: "Budget",
    question: "What is your monthly pet care budget?",
    helper: "Include food, grooming, care products, and other regular pet essentials.",
  },
];

const newPetStepKeys = new Set<StepKey>(["name", "species", "age", "mainConcern"]);

function getActiveOnboardingSteps(mode: OnboardingMode) {
  return mode === "new" ? steps.filter((step) => newPetStepKeys.has(step.key)) : steps;
}

function getStepError(profile: PetProfile, key: StepKey) {
  if (key === "name" && !profile.name.trim()) return "Please add your pet's name.";
  if (key === "species" && !profile.species) return "Choose dog or cat before continuing.";
  if (key === "age") {
    if (profile.ageUnknown) return "";
    const age = parsePositiveNumber(profile.age);
    if (!profile.age.trim() || !Number.isFinite(age) || age < 0) {
      return "Enter a number, or choose I'm not sure.";
    }
  }
  if (key === "weight") {
    if (profile.weightUnknown) return "";
    const weight = parsePositiveNumber(profile.weight);
    if (!profile.weight.trim() || !Number.isFinite(weight) || weight <= 0) {
      return "Enter a valid weight, or choose I'm not sure.";
    }
  }
  if (key === "mainConcern") {
    if (!profile.mainConcern) return "Choose the main thing you want Furvise to help with.";
    if (profile.mainConcern === "Other" && !profile.otherConcern.trim()) {
      return "Add the custom concern you want Furvise to help with.";
    }
  }
  if (key === "monthlyBudget") {
    const budget = parsePositiveNumber(profile.monthlyBudget);
    if (!profile.monthlyBudget.trim() || !Number.isFinite(budget) || budget <= 0) {
      return "Enter a positive monthly care budget.";
    }
  }
  return "";
}

function normalizeCustomIngredients(value: string) {
  return normalizeAvoidIngredientValues(value.split(","));
}

const saveProfileErrorMessage = "Furvise could not save this pet profile. Please try again.";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingPageContent />
    </Suspense>
  );
}

function OnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedModeParam = searchParams.get("mode") || "";
  const requestedStepParam = searchParams.get("step") || "";
  const resumeSaveRequested = searchParams.get("resumeSave") === "1";
  const [profile, setProfile] = useState<PetProfile>(initialProfile);
  const [stepIndex, setStepIndex] = useState(0);
  const [isRestored, setIsRestored] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [loadExistingProfileError, setLoadExistingProfileError] = useState("");
  const [saveProfileError, setSaveProfileError] = useState("");
  const [petLimitNotice, setPetLimitNotice] = useState("");
  const [analysisRecommendationError, setAnalysisRecommendationError] = useState("");
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>("new");
  const [editingProfileId, setEditingProfileId] = useState("");
  const [attemptedSteps, setAttemptedSteps] = useState<Set<StepKey>>(() => new Set());
  const [resumeSaveHandled, setResumeSaveHandled] = useState(false);
  const { status: authStatus } = useConfirmedSupabaseAuth();
  const didRedirectRef = useRef(false);
  const lastModeDecisionLogRef = useRef("");
  const activeSteps = useMemo(() => getActiveOnboardingSteps(onboardingMode), [onboardingMode]);
  const activeStepIndex = Math.min(stepIndex, activeSteps.length);
  const isSummary = activeStepIndex === activeSteps.length;
  const currentStep = activeSteps[activeStepIndex];
  const progress = isSummary ? 100 : Math.round(((activeStepIndex + 1) / activeSteps.length) * 100);
  const stepError = currentStep ? getStepError(profile, currentStep.key) : "";
  const visibleStepError =
    currentStep && attemptedSteps.has(currentStep.key) ? stepError : "";

  useEffect(() => {
    if (didRedirectRef.current) return;
    if (authStatus !== "signedOut") return;
    didRedirectRef.current = true;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextPath = currentPath === "/onboarding" ? NEW_PET_ONBOARDING_PATH : currentPath;
    router.replace(buildLoginHref(nextPath));
  }, [authStatus, router, requestedModeParam, requestedStepParam]);

  useEffect(() => {
    if (authStatus !== "signedIn") {
      return;
    }

    let active = true;
    const restoreTimer = window.setTimeout(() => {
      void (async () => {
        if (!active) return;
        setIsRestored(false);
        setLoadExistingProfileError("");
        setSaveProfileError("");
        setPetLimitNotice("");
        setAnalysisRecommendationError("");
        setAnalysisLoading(false);
        setAttemptedSteps(new Set());
        setResumeSaveHandled(false);

        const params = new URLSearchParams(window.location.search);
        const requestedMode = params.get("mode");
        const storedMode = window.localStorage.getItem(ONBOARDING_MODE_STORAGE_KEY);
        const storedProfileId = window.localStorage.getItem(PROFILE_ID_STORAGE_KEY);
        const decision = resolveOnboardingModeDecision({
          requestedMode,
          storedMode,
          storedProfileId,
        });

        logModeDecisionOnce(lastModeDecisionLogRef, {
          editingProfileId: decision.editingProfileId,
          finalMode: decision.finalMode,
          requestedMode,
          savedProfileId: decision.savedProfileId,
          storedMode,
          storedProfileId,
        });

        if (decision.shouldClearDraftStorage) {
          window.localStorage.removeItem(STORAGE_KEY);
          window.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
          window.localStorage.removeItem(PROFILE_MEMORIES_STORAGE_KEY);
          window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
        }

        window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, decision.finalMode);
        setOnboardingMode(decision.finalMode);
        setEditingProfileId(decision.editingProfileId);

        if (decision.shouldLoadExistingProfile) {
          try {
            const user = await getCurrentUser();
            if (!user) {
              throw new Error("Please sign in to edit this pet profile.");
            }

            const row = await loadPetProfileForUser(decision.loadExistingProfileId, user);
            if (!active) return;

            const draft = petProfileRowToDraft(row);
            setProfile(draft);
            setEditingProfileId(row.id);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
            window.localStorage.setItem(PROFILE_ID_STORAGE_KEY, row.id);
            window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "edit");
          } catch (loadError) {
            if (!active) return;
            setLoadExistingProfileError(
              loadError instanceof Error
                ? loadError.message
                : "Furvise could not load that pet profile.",
            );
            window.localStorage.removeItem(STORAGE_KEY);
            window.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
            window.localStorage.removeItem(PROFILE_MEMORIES_STORAGE_KEY);
            window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
            window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "new");
            setOnboardingMode("new");
            setEditingProfileId("");
            setProfile(initialProfile);
            if (requestedMode === "edit" || decision.shouldRedirectToNewMode) {
              router.replace("/onboarding?mode=new");
            }
          }
        } else if (decision.shouldKeepStoredDraft) {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          try {
            setProfile(stored ? normalizeProfile(JSON.parse(stored)) : initialProfile);
          } catch {
            setProfile(initialProfile);
          }
        } else {
          setProfile(initialProfile);
        }

        const requestedStep = Number(params.get("step"));
        const decisionSteps = getActiveOnboardingSteps(decision.finalMode);
        if (Number.isInteger(requestedStep) && requestedStep >= 1 && requestedStep <= decisionSteps.length) {
          setStepIndex(requestedStep - 1);
        } else {
          setStepIndex(0);
        }
        if (active) {
          setIsRestored(true);
        }
      })();
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(restoreTimer);
    };
  }, [authStatus, requestedModeParam, requestedStepParam, router]);

  useEffect(() => {
    if (!isRestored) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [isRestored, profile]);

  const summaryItems = useMemo(() => buildSummaryItems(profile, activeSteps), [activeSteps, profile]);
  const summaryStatus = useMemo(() => buildSummaryProfileStatus(profile), [profile]);

  function updateProfile(update: Partial<PetProfile>) {
    setProfile((current) => ({ ...current, ...update }));
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, Math.min(current, activeSteps.length) - 1));
  }

  function continueForward() {
    if (currentStep && stepError) {
      setAttemptedSteps((current) => new Set(current).add(currentStep.key));
      return;
    }
    setStepIndex((current) => Math.min(activeSteps.length, current + 1));
  }

  function handleEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") continueForward();
  }

  function toggleAvoidIngredient(ingredient: string) {
    if (ingredient === "None known") {
      updateProfile({ avoidIngredients: [], customAvoidIngredient: "" });
      return;
    }

    setProfile((current) => {
      const exists = current.avoidIngredients.includes(ingredient);
      return {
        ...current,
        avoidIngredients: exists
          ? current.avoidIngredients.filter((item) => item !== ingredient)
          : [...current.avoidIngredients, ingredient],
      };
    });
  }

  function updateCustomAvoidIngredient(value: string) {
    if (isNoneKnown(value)) {
      updateProfile({ avoidIngredients: [], customAvoidIngredient: value });
      return;
    }

    const chipValues = avoidIngredientChips.filter((item) => item !== "None known");
    const customIngredients = normalizeCustomIngredients(value);
    setProfile((current) => ({
      ...current,
      customAvoidIngredient: value,
      avoidIngredients: [
        ...current.avoidIngredients.filter((item) => chipValues.includes(item)),
        ...customIngredients.filter(
          (item) =>
            !chipValues.some((chip) => chip.toLowerCase() === item.toLowerCase()),
        ),
      ],
    }));
  }

  function startOver() {
    if (!window.confirm("Clear this onboarding draft and start over?")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
    window.localStorage.removeItem(PROFILE_MEMORIES_STORAGE_KEY);
    window.localStorage.removeItem(ANALYSIS_STORAGE_KEY);
    window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "new");
    setOnboardingMode("new");
    setEditingProfileId("");
    setProfile(initialProfile);
    setStepIndex(0);
    setAttemptedSteps(new Set());
    setResumeSaveHandled(false);
    setLoadExistingProfileError("");
    setSaveProfileError("");
    setPetLimitNotice("");
    setAnalysisRecommendationError("");
  }

  const getRecommendations = useCallback(async () => {
    if (analysisLoading) return;
    const invalidStep = activeSteps.find((step) => getStepError(profile, step.key));
    if (invalidStep) {
      setAttemptedSteps((current) => new Set(current).add(invalidStep.key));
      setStepIndex(activeSteps.findIndex((step) => step.key === invalidStep.key));
      return;
    }

    setLoadExistingProfileError("");
    setSaveProfileError("");
    setPetLimitNotice("");
    setAnalysisRecommendationError("");

    const user = await getCurrentUser();
    if (!user) {
      setSaveProfileError("Sign in to save this pet before getting recommendations.");
      router.push(buildLoginHref(NEW_PET_ONBOARDING_PATH));
      return;
    }

    setAnalysisLoading(true);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

    let savedProfileId = "";
    let savedDraft = profile;

    try {
      const profileIdForUpdate = getOnboardingSaveProfileId(onboardingMode, editingProfileId);
      if (!profileIdForUpdate) {
        const planId = await getUserPlan(user.id);
        const petCount = await countPetProfilesForUser(user);
        const petGate = evaluatePetLimit({
          isEditingExistingPet: false,
          petCount,
          planId,
        });
        if (petGate.hardBlocked) {
          setAnalysisLoading(false);
          setSaveProfileError(`${petGate.message} Upgrade coming soon.`);
          return;
        }
        setPetLimitNotice(petGate.softNotice || "");
      }
      const savedProfile = await savePetProfileForUser(profile, user, profileIdForUpdate);
      savedDraft = petProfileRowToDraft(savedProfile);
      savedProfileId = savedProfile.id;
      window.localStorage.setItem(PROFILE_ID_STORAGE_KEY, savedProfile.id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedDraft));
      window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "recommend_existing");
    } catch (saveError) {
      logProfileSaveFailure(onboardingMode, saveError);
      setAnalysisLoading(false);
      setSaveProfileError(saveProfileErrorMessage);
      return;
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: savedDraft,
          memories: loadStoredMemoriesForAnalysis(),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const analysis =
        payload && typeof payload === "object" && "analysis" in payload
          ? parseAnalysis((payload as { analysis: unknown }).analysis)
          : null;

      if (!response.ok || !analysis) {
        throw new Error("Furvise used a basic matching path from your saved answers.");
      }

      saveAnalysisResult({ status: "available", analysis });
    } catch (error) {
      console.warn("Furvise analysis fallback", {
        reason: error instanceof Error ? error.message : "Unknown analysis error",
      });
      const message =
        "Furvise used a basic matching path from your saved answers.";
      saveAnalysisResult({ status: "unavailable", message });
      setAnalysisRecommendationError(message);
    }

    setAnalysisLoading(false);

    if (!savedProfileId) {
      setSaveProfileError(saveProfileErrorMessage);
      return;
    }

    router.push(`/results?profileId=${encodeURIComponent(savedProfileId)}`);
  }, [activeSteps, analysisLoading, editingProfileId, onboardingMode, profile, router]);

  useEffect(() => {
    if (!isRestored || !resumeSaveRequested || resumeSaveHandled) return;
    let active = true;
    getCurrentUser().then((user) => {
      if (!active || !user) return;
      setResumeSaveHandled(true);
      void getRecommendations();
    });
    return () => {
      active = false;
    };
  }, [getRecommendations, isRestored, resumeSaveHandled, resumeSaveRequested]);

  if (!isRestored) {
    return (
      <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
        <div className="mx-auto w-full max-w-7xl px-5 pt-5 sm:px-8 lg:px-10">
          <SignedInHeader />
        </div>

        <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-3xl flex-col px-5 sm:px-8">
          <section className="flex flex-1 flex-col justify-center py-8">
            <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)] sm:p-8">
              <div className="space-y-6 animate-pulse">
                <div className="space-y-3">
                  <div className="h-3 w-24 rounded-full bg-[var(--pw-card-muted)]" />
                  <div className="h-12 w-3/4 rounded-2xl bg-[var(--pw-card-muted)]" />
                  <div className="h-5 w-full rounded-full bg-[var(--pw-card-muted)]" />
                  <div className="h-44 rounded-[1.5rem] bg-[var(--pw-card-muted)]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-14 rounded-full bg-[var(--pw-card-muted)]" />
                  <div className="h-14 rounded-full bg-[var(--pw-card-muted)]" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent text-[var(--pw-text)]">
      <div className="mx-auto w-full max-w-7xl px-5 pt-5 sm:px-8 lg:px-10">
        <SignedInHeader />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-3xl flex-col px-5 sm:px-8">
        <section className="flex flex-1 flex-col justify-center py-8">
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold text-[var(--pw-muted)]">
              <span>{isSummary ? "Profile ready" : `Step ${activeStepIndex + 1} of ${activeSteps.length}`}</span>
              <span className="flex items-center gap-3">
                {stepIndex > 0 || profile.name.trim() ? (
                  <button
                    className="min-h-11 rounded-full px-3 text-[var(--pw-primary)] hover:bg-[var(--pw-primary-soft)]"
                    onClick={startOver}
                    type="button"
                  >
                    Start over
                  </button>
                ) : null}
                <span>{progress}%</span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--pw-primary-soft)]">
              <div
                className="h-full rounded-full bg-[var(--pw-primary)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)] sm:p-8">
            {isSummary ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
                  Pet profile
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
                  Review {profile.name.trim() || "your pet"}&apos;s profile
                </h1>
                <div className="mt-8 grid gap-3">
                  <div className="rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-4 py-3">
                    <span className="text-sm font-medium text-[var(--pw-subtle)]">
                      Profile status
                    </span>
                    <p className="font-semibold text-[var(--pw-text)]">{summaryStatus}</p>
                  </div>
                  {summaryItems.map((item) => (
                    <div
                      className="flex flex-col gap-3 rounded-2xl bg-[var(--pw-card-muted)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      key={item.label}
                    >
                      <div>
                        <span className="text-sm font-medium text-[var(--pw-subtle)]">
                          {item.label}
                        </span>
                        <p className="font-semibold text-[var(--pw-text)]">{item.valueText}</p>
                      </div>
                      <button
                        className="self-start rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)] transition hover:border-[var(--pw-secondary)] sm:self-auto"
                        onClick={() => {
                          if (item.stepIndex >= 0) {
                            setStepIndex(item.stepIndex);
                          }
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
                {analysisLoading ? (
                  <div className="mt-6 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
                    Analyzing profile...
                  </div>
                ) : null}
                {onboardingMode === "edit" && loadExistingProfileError ? (
                  <div className="mt-6 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm font-semibold text-[var(--pw-warning-text)]">
                    {loadExistingProfileError}
                  </div>
                ) : null}
                {saveProfileError || analysisRecommendationError ? (
                  <div className="mt-6 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm font-semibold text-[var(--pw-warning-text)]">
                    {saveProfileError || analysisRecommendationError}
                    {saveProfileError.includes("Upgrade") ? (
                      <span className="mt-3 block w-fit rounded-full border border-[var(--pw-warning-border)] px-3 py-2">
                        Upgrade coming soon
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {petLimitNotice ? (
                  <div className="mt-6 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
                    {petLimitNotice}
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pw-primary)]">
                  {currentStep.eyebrow}
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">
                  {currentStep.question}
                </h1>
                <p className="mt-4 text-base leading-7 text-[var(--pw-muted)]">
                  {currentStep.helper}
                </p>

                <StepInput
                  handleEnter={handleEnter}
                  profile={profile}
                  stepKey={currentStep.key}
                  toggleAvoidIngredient={toggleAvoidIngredient}
                  updateCustomAvoidIngredient={updateCustomAvoidIngredient}
                  updateProfile={updateProfile}
                />

                {visibleStepError ? (
                  <p className="mt-4 text-sm font-semibold text-[var(--pw-danger-text)]">
                    {visibleStepError}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <footer className="grid grid-cols-2 gap-3 pb-3">
          <button
            className="rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-5 py-4 text-base font-semibold text-[var(--pw-text)] shadow-sm transition hover:border-[var(--pw-secondary)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={activeStepIndex === 0}
            onClick={goBack}
            type="button"
          >
            Previous
          </button>
          {isSummary ? (
            <button
              className="rounded-full bg-[var(--pw-primary)] px-5 py-4 text-center text-base font-semibold text-white shadow-lg shadow-green-900/10 transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-wait disabled:bg-[var(--pw-secondary)]"
              disabled={analysisLoading}
              onClick={getRecommendations}
              type="button"
            >
              {analysisLoading ? "Analyzing..." : "Get recommendations"}
            </button>
          ) : (
            <button
              className="rounded-full bg-[var(--pw-primary)] px-5 py-4 text-base font-semibold text-white shadow-lg shadow-green-900/10 transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--pw-secondary)]"
              onClick={continueForward}
              type="button"
            >
              Continue
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}

function saveAnalysisResult(result: StoredAnalysisResult) {
  writeStoredGuidanceResult(result);
}

function logModeDecisionOnce(
  ref: React.MutableRefObject<string>,
  decision: {
    requestedMode: string | null;
    storedMode: string | null;
    storedProfileId: string | null;
    finalMode: OnboardingMode;
    editingProfileId: string;
    savedProfileId: string;
  },
) {
  if (process.env.NODE_ENV === "production") return;

  const signature = JSON.stringify(decision);
  if (ref.current === signature) return;
  ref.current = signature;
  console.log("[Furvise onboarding] mode decision", decision);
}

function logProfileSaveFailure(mode: OnboardingMode, error: unknown) {
  if (process.env.NODE_ENV === "production") return;

  const databaseError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };

  console.warn("[Furvise onboarding] profile save failed", {
    mode,
    table: "dog_profiles",
    errorCode: databaseError?.code || "",
    errorMessage: databaseError?.message || "",
    errorDetails: databaseError?.details || "",
    errorHint: databaseError?.hint || "",
  });
}

function loadStoredMemoriesForAnalysis() {
  try {
    return parseAnalysisMemoryContext(
      JSON.parse(window.localStorage.getItem(PROFILE_MEMORIES_STORAGE_KEY) || "[]"),
    );
  } catch {
    return [];
  }
}

function StepInput({
  handleEnter,
  profile,
  stepKey,
  toggleAvoidIngredient,
  updateCustomAvoidIngredient,
  updateProfile,
}: {
  handleEnter: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  profile: PetProfile;
  stepKey: StepKey;
  toggleAvoidIngredient: (ingredient: string) => void;
  updateCustomAvoidIngredient: (value: string) => void;
  updateProfile: (update: Partial<PetProfile>) => void;
}) {
  const inputClass =
    "mt-8 w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-5 py-4 text-xl font-semibold text-[var(--pw-text)] outline-none transition placeholder:font-normal placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]";
  const chipClass =
    "rounded-2xl border px-4 py-3 text-left text-base font-semibold transition";

  if (stepKey === "name") {
    return (
      <input
        autoFocus
        className={inputClass}
        onChange={(event) => updateProfile({ name: event.target.value })}
        onKeyDown={handleEnter}
        placeholder="e.g. Luna"
        value={profile.name}
      />
    );
  }

  if (stepKey === "breed") {
    return (
      <div className="mt-8 grid gap-3">
        <input
          autoFocus
          className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-5 py-4 text-xl font-semibold text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]"
          onChange={(event) => updateProfile({ breed: event.target.value })}
          onKeyDown={handleEnter}
          placeholder="Golden retriever mix"
          value={profile.breed}
        />
        <button
          className={`${chipClass} ${
            profile.breed === "Mixed / unknown"
              ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)]"
              : "border-[var(--pw-border)] bg-[var(--pw-surface)] hover:border-[var(--pw-secondary)]"
          }`}
          onClick={() => updateProfile({ breed: "Mixed / unknown" })}
          type="button"
        >
          Mixed / unknown
        </button>
      </div>
    );
  }

  if (stepKey === "species") {
    return (
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {(["dog", "cat"] as const).map((species) => (
          <button
            className={`${chipClass} ${
              profile.species === species
                ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)]"
                : "border-[var(--pw-border)] bg-[var(--pw-surface)] hover:border-[var(--pw-secondary)]"
            }`}
            key={species}
            onClick={() => updateProfile({ species })}
            type="button"
          >
            {species === "dog" ? "Dog" : "Cat"}
          </button>
        ))}
      </div>
    );
  }

  if (stepKey === "age") {
    return (
      <div className="mt-8 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            autoFocus
            className={`w-full rounded-2xl border border-[var(--pw-border-strong)] px-5 py-4 text-xl font-semibold outline-none transition placeholder:font-normal placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)] ${
              profile.ageUnknown
                ? "bg-[var(--pw-card-muted)] text-[var(--pw-muted)] cursor-text"
                : "bg-[var(--pw-input)] text-[var(--pw-text)]"
            }`}
            inputMode="decimal"
            onChange={(event) => updateProfile(updateNumericFieldValue("age", event.target.value))}
            onFocus={() => {
              if (profile.ageUnknown) updateProfile(beginNumericFieldEntry("age"));
            }}
            onKeyDown={handleEnter}
            placeholder="4"
            readOnly={profile.ageUnknown}
            value={profile.age}
          />
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-surface)]">
            {(["months", "years"] as const).map((unit) => (
              <button
                className={`px-4 py-3 text-sm font-semibold ${
                  profile.ageUnit === unit ? "bg-[var(--pw-primary)] text-white" : "text-[var(--pw-muted)]"
                }`}
                key={unit}
                onClick={() => updateProfile(updateNumericFieldUnit("age", unit))}
                type="button"
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        <button
          className={`${chipClass} ${
            profile.ageUnknown
              ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)]"
              : "border-[var(--pw-border)] bg-[var(--pw-surface)] hover:border-[var(--pw-secondary)]"
          }`}
          onClick={() => updateProfile(markNumericFieldUnknown("age"))}
          type="button"
        >
          I&apos;m not sure
        </button>
      </div>
    );
  }

  if (stepKey === "weight") {
    return (
      <div className="mt-8 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            autoFocus
            className={`w-full rounded-2xl border border-[var(--pw-border-strong)] px-5 py-4 text-xl font-semibold outline-none transition placeholder:font-normal placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)] ${
              profile.weightUnknown
                ? "bg-[var(--pw-card-muted)] text-[var(--pw-muted)] cursor-text"
                : "bg-[var(--pw-input)] text-[var(--pw-text)]"
            }`}
            inputMode="decimal"
            onChange={(event) => updateProfile(updateNumericFieldValue("weight", event.target.value))}
            onFocus={() => {
              if (profile.weightUnknown) updateProfile(beginNumericFieldEntry("weight"));
            }}
            onKeyDown={handleEnter}
            placeholder="42"
            readOnly={profile.weightUnknown}
            value={profile.weight}
          />
          <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-surface)]">
            {(["lb", "kg"] as const).map((unit) => (
              <button
                className={`px-4 py-3 text-sm font-semibold ${
                  profile.weightUnit === unit ? "bg-[var(--pw-primary)] text-white" : "text-[var(--pw-muted)]"
                }`}
                key={unit}
                onClick={() => updateProfile(updateNumericFieldUnit("weight", unit))}
                type="button"
              >
                {unit}
              </button>
            ))}
          </div>
        </div>
        <button
          className={`${chipClass} ${
            profile.weightUnknown
              ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)]"
              : "border-[var(--pw-border)] bg-[var(--pw-surface)] hover:border-[var(--pw-secondary)]"
          }`}
          onClick={() => updateProfile(markNumericFieldUnknown("weight"))}
          type="button"
        >
          I&apos;m not sure
        </button>
      </div>
    );
  }

  if (stepKey === "currentFood") {
    return (
      <div className="mt-8 grid gap-3">
        <input
          autoFocus
          className={`w-full rounded-2xl border px-5 py-4 text-xl font-semibold outline-none transition placeholder:text-[var(--pw-placeholder)] ${
            profile.currentFoodUnknown
              ? "border-[var(--pw-border)] bg-[var(--pw-card-muted)] text-[var(--pw-subtle)]"
              : "border-[var(--pw-border-strong)] bg-[var(--pw-input)] text-[var(--pw-text)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]"
          }`}
          onChange={(event) => updateProfile(updateTextFieldValue("currentFood", event.target.value))}
          onFocus={() => {
            if (profile.currentFoodUnknown) updateProfile(beginTextFieldEntry("currentFood"));
          }}
          onKeyDown={handleEnter}
          placeholder="Chicken and rice kibble"
          readOnly={profile.currentFoodUnknown}
          value={profile.currentFood}
        />
        <button
          className={`${chipClass} ${
            profile.currentFoodUnknown
              ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)]"
              : "border-[var(--pw-border)] bg-[var(--pw-surface)] hover:border-[var(--pw-secondary)]"
          }`}
          onClick={() => updateProfile(markTextFieldUnknown("currentFood"))}
          type="button"
        >
          I&apos;m not sure
        </button>
      </div>
    );
  }

  if (stepKey === "mainConcern") {
    return (
      <div className="mt-8 grid gap-3">
        {MAIN_CONCERN_OPTIONS.map((option) => {
          const selected = profile.mainConcern === option;
          return (
            <button
              className={`${chipClass} ${
                selected
                  ? "border-[var(--pw-primary)] bg-[var(--pw-primary-soft)] text-[var(--pw-text)]"
                  : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-secondary)]"
              }`}
              key={option}
              onClick={() => updateProfile({ mainConcern: option })}
              type="button"
            >
              {option}
            </button>
          );
        })}
        {profile.mainConcern === "Other" ? (
          <input
            autoFocus
            className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-5 py-4 text-xl font-semibold text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]"
            onChange={(event) => updateProfile({ otherConcern: event.target.value })}
            onKeyDown={handleEnter}
            placeholder="Describe the concern"
            value={profile.otherConcern}
          />
        ) : null}
      </div>
    );
  }

  if (stepKey === "avoidIngredients") {
    const noneKnown = profile.avoidIngredients.length === 0;
    return (
      <div className="mt-8 grid gap-4">
        <div className="flex flex-wrap gap-2">
          {avoidIngredientChips.map((ingredient) => {
            const selected =
              ingredient === "None known" ? noneKnown : profile.avoidIngredients.includes(ingredient);
            return (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
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
          className="w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-5 py-4 text-xl font-semibold text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]"
          onChange={(event) => updateCustomAvoidIngredient(event.target.value)}
          onKeyDown={handleEnter}
          placeholder="Add another ingredient, or type none"
          value={profile.customAvoidIngredient}
        />
      </div>
    );
  }

  return (
    <label className="mt-8 block">
      <span className="mb-2 block text-sm font-semibold text-[var(--pw-muted)]">Monthly care budget</span>
      <div className="flex overflow-hidden rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] focus-within:border-[var(--pw-primary)] focus-within:bg-[var(--pw-surface)]">
        <span className="flex items-center px-5 text-xl font-semibold text-[var(--pw-muted)]">$</span>
        <input
          autoFocus
          className="w-full bg-transparent py-4 pr-5 text-xl font-semibold text-[var(--pw-text)] outline-none placeholder:text-[var(--pw-placeholder)]"
          inputMode="decimal"
          onChange={(event) => updateProfile({ monthlyBudget: event.target.value })}
          onKeyDown={handleEnter}
          placeholder="80"
          value={profile.monthlyBudget}
        />
      </div>
    </label>
  );
}
