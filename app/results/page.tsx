"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppPage } from "../components/app-page";
import {
  ANALYSIS_STORAGE_KEY,
  AnalysisMemoryContext,
  PetWiseAnalysis,
  SafetyFollowupResult,
  StoredAnalysisResult,
  parseAnalysis,
  parseAnalysisMemoryContext,
  parseSafetyFollowupResult,
  parseStoredAnalysis,
} from "../lib/ai-analysis";
import {
  DogProfile,
  ONBOARDING_MODE_STORAGE_KEY,
  STORAGE_KEY,
  WellnessGoal,
  formatAge,
  formatAvoidIngredients,
  formatBudget,
  formatSpecies,
  formatWeight,
  initialProfile,
  normalizeProfile,
  formatPetDisplayName,
  selectedConcern,
} from "../lib/petwise";
import { NEW_PET_LOGIN_PATH, buildLoginHref } from "../lib/auth-routing";
import { getFinishProfileItemsFromDraft } from "../lib/finish-profile";
import {
  buildPetMemoryContext,
  buildResultsUnderstanding,
  type PetMemoryContext,
} from "../lib/pet-memory";
import { FURVISE_SAFETY_LINE, FURVISE_URGENT_SAFETY_MESSAGE } from "../lib/safety-copy";
import {
  CareEntryRow,
  DogProductFeedbackRow,
  DogMemoryRow,
  MemoryInput,
  PROFILE_ID_STORAGE_KEY,
  PROFILE_MEMORIES_STORAGE_KEY,
  DogProfileRow,
  dogProfileRowToDraft,
  getCurrentUser,
  listCareEntriesForPet,
  loadDogProductFeedbackForUser,
  loadDogProfileWithMemoriesForUser,
  saveDogMemories,
} from "../lib/supabase";
import { writeStoredGuidanceResult } from "../lib/stored-guidance";

export default function ResultsPage() {
  return (
    <Suspense fallback={<AppPage>{null}</AppPage>}>
      <ResultsPageContent />
    </Suspense>
  );
}

function ResultsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<DogProfile>(initialProfile);
  const [analysisResult, setAnalysisResult] = useState<StoredAnalysisResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [userLoaded, setUserLoaded] = useState(false);
  const [dogProfileId, setDogProfileId] = useState("");
  const [profileRow, setProfileRow] = useState<DogProfileRow | null>(null);
  const [careEntries, setCareEntries] = useState<CareEntryRow[]>([]);
  const [memoryRows, setMemoryRows] = useState<DogMemoryRow[]>([]);
  const [savedMemories, setSavedMemories] = useState<AnalysisMemoryContext[]>([]);
  const [productFeedback, setProductFeedback] = useState<DogProductFeedbackRow[]>([]);
  const [safetyFollowupState, setSafetyFollowupState] = useState<{
    key: string;
    result: SafetyFollowupResult;
  } | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      void (async () => {
        const profileIdFromRoute = searchParams.get("profileId") || "";
        setLoaded(false);
        setLoadError("");
        setAnalysisResult(null);
        setProductFeedback([]);
        setProfileRow(null);
        setCareEntries([]);
        setMemoryRows([]);

        if (profileIdFromRoute) {
          try {
            const user = await getCurrentUser();
            setUserId(user?.id || "");
            setUserLoaded(true);
            if (!user) {
              router.replace(buildLoginHref(`${window.location.pathname}${window.location.search}`));
              return;
            }

            const storedProfileIdBeforeLoad = window.localStorage.getItem(PROFILE_ID_STORAGE_KEY) || "";
            const [row, careRows] = await Promise.all([
              loadDogProfileWithMemoriesForUser(profileIdFromRoute, user),
              listCareEntriesForPet(profileIdFromRoute),
            ]);
            const savedProfile = dogProfileRowToDraft(row);
            setProfileRow(row);
            setCareEntries(careRows);
            setMemoryRows(row.dog_memories);
            setProfile(savedProfile);
            setSavedMemories(
              parseAnalysisMemoryContext(
                row.dog_memories.map((memory) => ({
                  confidence: memory.confidence,
                  source: memory.source,
                  text: memory.text,
                  type: memory.type,
                })),
              ),
            );

            window.localStorage.setItem(PROFILE_ID_STORAGE_KEY, profileIdFromRoute);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProfile));
            window.localStorage.setItem(
              PROFILE_MEMORIES_STORAGE_KEY,
              JSON.stringify(row.dog_memories),
            );
            setDogProfileId(row.id);

            const storedAnalysis =
              storedProfileIdBeforeLoad === row.id
                ? window.localStorage.getItem(ANALYSIS_STORAGE_KEY)
                : null;
            try {
              setAnalysisResult(storedAnalysis ? parseStoredAnalysis(JSON.parse(storedAnalysis)) : null);
            } catch {
              setAnalysisResult(null);
            }
          } catch (error) {
            logResultsLoadFailure(profileIdFromRoute, error);
            setProfile(initialProfile);
            setProfileRow(null);
            setCareEntries([]);
            setMemoryRows([]);
            setSavedMemories([]);
            setDogProfileId(profileIdFromRoute);
            setLoadError("Furvise could not load this pet profile.");
          } finally {
            setLoaded(true);
          }
          return;
        }

        const user = await getCurrentUser();
        setUserId(user?.id || "");
        setUserLoaded(true);
        if (!user) {
          setProfile(initialProfile);
          setLoadError("Sign in to save your pet's care history.");
          setLoaded(true);
          router.replace(NEW_PET_LOGIN_PATH);
          return;
        }

        const stored = window.localStorage.getItem(STORAGE_KEY);
        let restoredProfile = initialProfile;
        if (stored) {
          try {
            restoredProfile = normalizeProfile(JSON.parse(stored));
          } catch {
            restoredProfile = initialProfile;
          }
        }
        setProfile(restoredProfile);

        const storedAnalysis = window.localStorage.getItem(ANALYSIS_STORAGE_KEY);
        if (restoredProfile.name.trim() && (!restoredProfile.species || !selectedConcern(restoredProfile))) {
            setAnalysisResult({
              status: "incomplete_profile",
              message: "Furvise needs species and a main concern before it can summarize this profile.",
              missingFields: [
                ...(!restoredProfile.species ? ["species"] : []),
                ...(!selectedConcern(restoredProfile) ? ["main_concern"] : []),
            ],
          });
        } else if (storedAnalysis) {
          try {
            setAnalysisResult(parseStoredAnalysis(JSON.parse(storedAnalysis)));
          } catch {
            setAnalysisResult({
              status: "unavailable",
              message:
                "Using local care matching right now.",
            });
          }
        }
        const storedMemories = window.localStorage.getItem(PROFILE_MEMORIES_STORAGE_KEY);
        try {
          setSavedMemories(
            storedMemories ? parseAnalysisMemoryContext(JSON.parse(storedMemories)) : [],
          );
        } catch {
          setSavedMemories([]);
        }
        const storedProfileId = window.localStorage.getItem(PROFILE_ID_STORAGE_KEY) || "";
        setDogProfileId(storedProfileId);
        setLoaded(true);
      })();
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, [router, searchParams]);

  useEffect(() => {
    getCurrentUser()
      .then((user) => setUserId(user?.id || ""))
      .finally(() => setUserLoaded(true));
  }, []);

  useEffect(() => {
    if (!userLoaded) return;
    if (!userId || !dogProfileId) {
      const emptyFeedbackTimer = window.setTimeout(() => {
        setProductFeedback([]);
      }, 0);

      return () => {
        window.clearTimeout(emptyFeedbackTimer);
      };
    }

    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!user) return [];
        return loadDogProductFeedbackForUser(dogProfileId, user);
      })
      .then((rows) => {
        if (active) {
          setProductFeedback(rows);
        }
      })
      .catch(() => {
        if (active) {
          setProductFeedback([]);
        }
      });

    return () => {
      active = false;
    };
  }, [dogProfileId, userId, userLoaded]);

  useEffect(() => {
    if (!loaded || analysisResult || !profile.name.trim() || !profile.species) return;

    let active = true;
    async function analyzeProfile() {
      // Recommendation pipeline stage 1: AI analysis enriches the user-entered profile.
      setAnalysisLoading(true);
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, memories: savedMemories }),
        });
        const payload: unknown = await response.json().catch(() => null);
        const analysis =
          payload && typeof payload === "object" && "analysis" in payload
            ? parseAnalysis((payload as { analysis: unknown }).analysis)
            : null;

        if (!response.ok) {
          const incompleteProfileError = parseIncompleteProfileError(payload);
          if (incompleteProfileError) {
            const result: StoredAnalysisResult = incompleteProfileError;
            writeStoredGuidanceResult(result);
            if (active) setAnalysisResult(result);
            return;
          }
        }

        if (!response.ok || !analysis) {
          throw new Error(
            "Using local care matching right now.",
          );
        }

        const result: StoredAnalysisResult = { status: "available", analysis };
        writeStoredGuidanceResult(result);
        if (active) setAnalysisResult(result);
      } catch (error) {
        console.warn("Furvise summary fallback", {
          reason: error instanceof Error ? error.message : "Unknown analysis error",
        });
        const result: StoredAnalysisResult = {
          status: "unavailable",
          message:
            "Using local care matching right now.",
        };
        writeStoredGuidanceResult(result);
        if (active) setAnalysisResult(result);
      } finally {
        if (active) setAnalysisLoading(false);
      }
    }

    analyzeProfile();
    return () => {
      active = false;
    };
  }, [analysisResult, loaded, profile, savedMemories]);

  const analysis = analysisResult?.status === "available" ? analysisResult.analysis : null;
  const petMemory: PetMemoryContext | null = useMemo(() => {
    if (!profileRow) return null;
    return buildPetMemoryContext({
      careEntries,
      productFeedback,
      profile: profileRow,
      recentGuidance: analysis
        ? [
            {
              detail: analysis.summary,
              id: `stored-analysis-${profileRow.id}`,
              title: "Furvise summary",
            },
          ]
        : [],
      savedMemories: memoryRows,
    });
  }, [analysis, careEntries, memoryRows, productFeedback, profileRow]);
  const resultsUnderstanding = useMemo(
    () => (petMemory ? buildResultsUnderstanding(petMemory) : null),
    [petMemory],
  );
  const careSummary = useMemo(
    () => buildResultsCareSummary({ analysis, memory: petMemory, profile }),
    [analysis, petMemory, profile],
  );
  const finishProfileItems = useMemo(() => getFinishProfileItemsFromDraft(profile), [profile]);
  const wellnessGoalLabel = formatWellnessGoalLabel(profile.wellnessGoal || "");
  const urgentVetAttention =
    analysis?.vetAttention.needed === true && analysis.vetAttention.urgency === "urgent";
  const soonVetAttention =
    analysis?.vetAttention.needed === true && analysis.vetAttention.urgency === "soon";
  const safetyFollowupKey = analysis
    ? JSON.stringify({
        reason: analysis.vetAttention.reason,
        questions: uniqueNonEmptyStrings(analysis.missingInformation).slice(0, 3),
        summary: analysis.summary,
        urgency: analysis.vetAttention.urgency,
      })
    : "";
  const safetyFollowupResult =
    safetyFollowupState?.key === safetyFollowupKey ? safetyFollowupState.result : null;
  const memorySuggestions = [
    ...(analysis?.memorySuggestions || []),
    ...(safetyFollowupResult?.memorySuggestions || []),
  ];
  const incompleteProfileResult =
    analysisResult?.status === "incomplete_profile" ? analysisResult : null;
  const understoodItems = [
    ["Name", formatPetDisplayName(profile.name)],
    ["Species", formatSpecies(profile.species)],
    ["Breed", profile.breed.trim() || "Not provided"],
    ["Age", formatAge(profile)],
    ["Weight", formatWeight(profile)],
    ["Current food", profile.currentFoodUnknown ? "I'm not sure" : profile.currentFood.trim() || "Not provided"],
    ["Main concern", selectedConcern(profile) || "Not provided"],
    ...(wellnessGoalLabel ? [["Wellness goal", wellnessGoalLabel]] : []),
    ["Avoiding", formatAvoidIngredients(profile)],
    ["Budget", formatBudget(profile)],
  ];

  function prepareEditProfile() {
    if (dogProfileId) {
      window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "edit");
      return;
    }

    window.localStorage.removeItem(PROFILE_ID_STORAGE_KEY);
    window.localStorage.setItem(ONBOARDING_MODE_STORAGE_KEY, "new");
  }

  return (
    <AppPage>
      <section className="mx-auto max-w-5xl py-9 sm:py-14">
          <p className="mb-4 inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1 text-sm font-medium text-[var(--pw-primary)]">
            {urgentVetAttention
              ? "Emergency safety"
              : soonVetAttention
                ? "Safety check first"
                : "Care summary"}
          </p>
          <h1 className="max-w-3xl break-words text-4xl font-semibold leading-[1.06] tracking-tight text-[var(--pw-heading)] sm:text-6xl sm:leading-[1.02]">
            {urgentVetAttention
              ? "Urgent care context for " + formatPetDisplayName(profile.name)
              : soonVetAttention
                ? "Safety check for " + formatPetDisplayName(profile.name)
                : "First care summary for " + formatPetDisplayName(profile.name)}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--pw-muted)]">
            {dogProfileId
              ? `Based on ${formatPetDisplayName(profile.name)}'s saved profile and care history.`
              : "Based on the saved profile context available in this browser."}
          </p>
          {finishProfileItems.length > 0 && !urgentVetAttention ? (
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--pw-muted)]">
              Furvise has enough to start a care summary. Add food, avoid ingredients, weight, and budget later for better guidance.
            </p>
          ) : null}
          <p className="mt-5 max-w-3xl rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm font-semibold leading-6 text-[var(--pw-muted)]">
            {FURVISE_SAFETY_LINE}
          </p>
          {!urgentVetAttention ? (
            <div className="mt-9 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-2xl shadow-[var(--pw-shadow)] sm:p-6">
              <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">What Furvise knows</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {understoodItems.map(([label, value]) => (
                  <div className="rounded-2xl bg-[var(--pw-card-muted)] p-4" key={label}>
                    <p className="text-sm font-medium text-[var(--pw-subtle)]">{label}</p>
                    <p className="mt-2 break-words font-semibold leading-6 text-[var(--pw-text)]">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!urgentVetAttention ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <p className="rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 text-sm leading-6 text-[var(--pw-muted)]">
                Furvise summarizes saved context and turns it into care notes you can log or discuss with your vet.
              </p>
              <p className="rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 text-sm leading-6 text-[var(--pw-muted)]">
                Furvise only used saved details and care logs. It does not infer medical facts.
              </p>
            </div>
          ) : null}

          {incompleteProfileResult && !incompleteProfileResult.missingFields.includes("species") ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 text-[var(--pw-warning-text)]">
              <p className="font-semibold">
                {incompleteProfileResult.missingFields.includes("species")
                  ? "Furvise needs species before it can summarize this profile."
                  : "Furvise needs a main concern before it can summarize this profile."}
              </p>
              <Link
                className="mt-4 inline-flex rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
                href={dogProfileId ? `/pets/${dogProfileId}/edit` : "/onboarding"}
                onClick={prepareEditProfile}
              >
                Complete profile
              </Link>
            </div>
          ) : analysisResult?.status === "unavailable" ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 font-semibold text-[var(--pw-muted)]">
              Using local care matching right now.
            </div>
          ) : null}
          {analysisLoading ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 font-semibold text-[var(--pw-primary)]">
              Preparing saved profile summary...
            </div>
          ) : null}
          {loadError ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 font-semibold text-[var(--pw-warning-text)]">
              {loadError}
            </div>
          ) : null}

          {loaded && profile.name.trim() && !profile.species ? (
            <MissingSpeciesPanel dogProfileId={dogProfileId} name={formatPetDisplayName(profile.name)} />
          ) : null}

          {resultsUnderstanding ? (
            <MemoryUnderstandingPanel
              petName={formatPetDisplayName(profile.name)}
              understanding={resultsUnderstanding}
            />
          ) : null}

          {dogProfileId && finishProfileItems.length > 0 ? (
            <FinishProfilePrompt
              editHref={`/pets/${dogProfileId}/edit`}
              items={finishProfileItems.map((item) => item.label)}
              name={formatPetDisplayName(profile.name)}
              onPrepareEditProfile={prepareEditProfile}
            />
          ) : null}

          {urgentVetAttention && analysis ? (
            <UrgentCarePanel analysis={analysis} profile={profile} />
          ) : soonVetAttention && analysis ? (
            <SoonSafetyPanel
              analysis={analysis}
              key={safetyFollowupKey}
              profile={profile}
              onResult={(result) => setSafetyFollowupState({ key: safetyFollowupKey, result })}
              result={safetyFollowupResult}
            />
          ) : (
            <CareSummaryPanel plan={careSummary} />
          )}

          {userId && dogProfileId && memorySuggestions.length ? (
            <SuggestedMemories
              dogProfileId={dogProfileId}
              suggestions={memorySuggestions}
            />
          ) : null}
        </section>
    </AppPage>
  );
}

function FinishProfilePrompt({
  editHref,
  items,
  name,
  onPrepareEditProfile,
}: {
  editHref: string;
  items: string[];
  name: string;
  onPrepareEditProfile: () => void;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--pw-heading)]">
            Finish {name}&apos;s profile for better guidance
          </h2>
          <p className="mt-2 leading-7 text-[var(--pw-muted)]">
            Furvise has enough to give a first care summary. Add food, avoid ingredients,
            weight, and budget later to improve saved care context.
          </p>
          <ul className="mt-3 grid gap-2 text-sm font-semibold text-[var(--pw-text)] sm:grid-cols-2">
            {items.map((item) => (
              <li className="rounded-2xl bg-[var(--pw-card-muted)] px-3 py-2" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Link
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[var(--pw-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
          href={editHref}
          onClick={onPrepareEditProfile}
        >
          Finish profile
        </Link>
      </div>
    </section>
  );
}

function buildResultsCareSummary({
  analysis,
  memory,
  profile,
}: {
  analysis: PetWiseAnalysis | null;
  memory: PetMemoryContext | null;
  profile: DogProfile;
}): ResultsCareSummary {
  const concern = selectedConcern(profile).toLowerCase();
  const recentText =
    memory?.timeline.recentEntries
      .filter((entry) => entry.source === "owner")
      .slice(0, 4)
      .map((entry) => `${entry.category} ${entry.title} ${entry.detail || ""}`)
      .join(" ")
      .toLowerCase() || "";
  const contextText = `${concern} ${recentText}`;
  const skinOrPaw = /\b(scratch|itch|skin|paw|lick|ear|redness)\b/.test(contextText);
  const foodOrDigestive = /\b(food|diet|meal|chicken|kibble|appetite|water|stool|vomit|diarrhea|digest)\b/.test(contextText);
  const hasRecentLogs = Boolean(memory?.timeline.recentEntries.some((entry) => entry.source === "owner"));

  const whatToLogNext = uniqueNonEmptyStrings([
    hasRecentLogs
      ? "Whether the latest logged issue repeats, improves, or changes."
      : "One quick note about food, appetite, activity, symptoms, or behavior.",
    foodOrDigestive || !profile.currentFood.trim()
      ? "Food eaten before the concern appeared, plus appetite and water intake."
      : "Any routine changes before the concern appears.",
    skinOrPaw ? "Skin redness, paw licking, ear irritation, stool changes, and time of day." : "",
    "Time of day, duration, and anything that happened just before the concern.",
    "Photos or concise notes to bring to a vet visit, if relevant.",
    ...(memory?.derived.missingContext.includes("current food")
      ? ["Current food and any recent food changes."]
      : []),
  ]).slice(0, 5);

  const aiQuestions =
    analysis?.missingInformation
      .filter((item) => /\?$/.test(item.trim()))
      .map((item) => item.trim()) || [];
  const vetQuestions = uniqueNonEmptyStrings([
    "What symptoms would make this urgent?",
    skinOrPaw || foodOrDigestive ? "Are diet, fleas, or environmental triggers worth checking?" : "",
    foodOrDigestive ? "Should I track food changes for a specific period?" : "",
    "What details should I bring to the appointment?",
    "Should I track timing, photos, appetite, water intake, or stool changes?",
    ...aiQuestions,
  ]).slice(0, 5);

  return { vetQuestions, whatToLogNext };
}

function logResultsLoadFailure(profileId: string, error: unknown) {
  if (process.env.NODE_ENV === "production") return;

  const databaseError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };

  console.warn("[Furvise results] profile load failed", {
    action: "select",
    errorCode: databaseError?.code || "",
    errorDetails: databaseError?.details || "",
    errorHint: databaseError?.hint || "",
    errorMessage: databaseError?.message || "",
    profileId,
    table: "dog_profiles",
  });
}

function MissingSpeciesPanel({ dogProfileId, name }: { dogProfileId: string; name: string }) {
  return (
    <section className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-6 text-[var(--pw-warning-text)]">
      <h2 className="text-2xl font-semibold">Is {name} a cat or dog?</h2>
      <p className="mt-3 leading-7">
        Care guidance differs by species, so Furvise needs this profile detail before it can
        summarize the profile reliably.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
        href={dogProfileId ? `/pets/${dogProfileId}/edit` : "/onboarding?step=2"}
      >
        Add species
      </Link>
    </section>
  );
}

function parseIncompleteProfileError(value: unknown): StoredAnalysisResult | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as {
    error?: unknown;
    message?: unknown;
    missingFields?: unknown;
  };

  if (payload.error !== "incomplete_profile" || typeof payload.message !== "string") {
    return null;
  }

  return {
    status: "incomplete_profile",
    message: payload.message,
    missingFields: Array.isArray(payload.missingFields)
      ? payload.missingFields.filter((field): field is string => typeof field === "string")
      : [],
  };
}

function SuggestedMemories({
  dogProfileId,
  suggestions,
}: {
  dogProfileId: string;
  suggestions: MemoryInput[];
}) {
  // Recommendation pipeline stage 3: memory suggestions are saved only after user selection.
  const uniqueSuggestions = useMemo(() => uniqueMemoryInputs(suggestions), [suggestions]);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function toggle(index: number) {
    setSelected((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  async function saveSelected() {
    if (selected.length === 0) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before saving memories.");
      const selectedMemories = selected
        .map((index) => uniqueSuggestions[index])
        .filter((memory): memory is MemoryInput => Boolean(memory))
        .map((memory) => ({
          ...memory,
          source: "ai_suggestion",
        }));
      const result = await saveDogMemories(dogProfileId, user, selectedMemories);
      setSelected([]);
      setMessage(
        `Saved ${result.saved.length} ${pluralize("memory", result.saved.length)}. Skipped ${
          result.skippedDuplicates
        } ${pluralize("duplicate", result.skippedDuplicates)}.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Furvise could not save those memories. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-primary)]">
            Suggested memories
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--pw-text)]">
            Choose what Furvise should remember
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--pw-muted)]">
            Choose only what you want Furvise to remember.
          </p>
        </div>
        <button
          className="rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--pw-secondary)]"
          disabled={saving || selected.length === 0}
          onClick={saveSelected}
          type="button"
        >
          {saving ? "Saving..." : "Save selected"}
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {uniqueSuggestions.map((suggestion, index) => (
          <label
            className="flex cursor-pointer gap-3 rounded-2xl bg-[var(--pw-card-muted)] p-4"
            key={`${suggestion.type}-${suggestion.text}`}
          >
            <input
              checked={selected.includes(index)}
              className="mt-1 h-4 w-4 accent-[var(--pw-primary)]"
              onChange={() => toggle(index)}
              type="checkbox"
            />
            <span>
              <span className="block font-semibold text-[var(--pw-text)]">{suggestion.text}</span>
              <span className="mt-1 block text-sm text-[var(--pw-muted)]">
                {formatMemoryType(suggestion.type)} - {suggestion.confidence}
              </span>
            </span>
          </label>
        ))}
      </div>

      {message ? (
        <div className="mt-5 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-sm font-semibold text-[var(--pw-danger-text)]">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function MemoryUnderstandingPanel({
  petName,
  understanding,
}: {
  petName: string;
  understanding: ReturnType<typeof buildResultsUnderstanding>;
}) {
  return (
    <div className="mt-8 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-primary)]">
          Saved care context
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--pw-text)]">
          What Furvise knows about {petName}
        </h2>
      </div>
      {understanding.safetyFlags.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 text-[var(--pw-danger-text)]">
          <p className="font-semibold">Urgent safety guidance comes first because saved memory contains warning signs.</p>
          <p className="mt-2 leading-7">
            Furvise found: {understanding.safetyFlags.join(", ")}. {FURVISE_URGENT_SAFETY_MESSAGE}
          </p>
        </div>
      ) : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <AnalysisList
          emptyText="No saved profile facts found."
          items={understanding.profileFacts}
          title="Saved profile"
        />
        <AnalysisList
          emptyText={`Furvise does not have care updates for ${petName} yet.`}
          items={understanding.careHistory}
          title="Care history context"
        />
        <AnalysisList
          emptyText="No saved avoid ingredients or avoid notes."
          items={understanding.savedAvoids}
          title="Saved avoids"
        />
        <AnalysisList
          emptyText="No missing context flagged."
          items={understanding.missingContext}
          title="Missing context"
        />
        <AnalysisList
          emptyText="No urgent safety flags found in saved memory."
          items={understanding.safetyFlags}
          title="Safety flags"
        />
      </div>
    </div>
  );
}

type ResultsCareSummary = {
  vetQuestions: string[];
  whatToLogNext: string[];
};

function CareSummaryPanel({ plan }: { plan: ResultsCareSummary }) {
  return (
    <div className="mt-8 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-primary)]">
          Care planning
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-[var(--pw-text)]">Next useful steps</h2>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <AnalysisList
          emptyText="No logging suggestions available yet."
          items={plan.whatToLogNext}
          title="What to log next"
        />
        <AnalysisList
          emptyText="No vet questions available yet."
          items={plan.vetQuestions}
          title="What to ask the vet"
        />
      </div>
    </div>
  );
}

function SoonSafetyPanel({
  analysis,
  onResult,
  profile,
  result,
}: {
  analysis: PetWiseAnalysis;
  onResult: (result: SafetyFollowupResult) => void;
  profile: DogProfile;
  result: SafetyFollowupResult | null;
}) {
  const safetyQuestions = useMemo(() => buildSoonSafetyQuestions(analysis), [analysis]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [useCombinedAnswer, setUseCombinedAnswer] = useState(false);
  const [combinedAnswer, setCombinedAnswer] = useState("");
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allIndividualQuestionsAnswered =
    safetyQuestions.length > 0 &&
    safetyQuestions.every((question) => answers[question.id]?.trim());
  const combinedAnswerComplete = Boolean(combinedAnswer.trim());
  const hasRequiredAnswers = useCombinedAnswer
    ? combinedAnswerComplete
    : allIndividualQuestionsAnswered;
  const visibleQuestions = useCombinedAnswer
    ? ["Combined owner response"]
    : safetyQuestions.map((question) => question.text);
  const followupAnswers = useCombinedAnswer
    ? [
        {
          question: "Combined owner response",
          answer: combinedAnswer.trim(),
        },
      ]
    : safetyQuestions.map((question) => ({
        question: question.text,
        answer: answers[question.id]?.trim() || "",
      }));
  const validationError = useCombinedAnswer
    ? "Describe what happened before Furvise reviews the safety details."
    : "Answer each visible safety question before Furvise reviews the details.";

  function setAnswer(questionId: string, answer: string) {
    setAnswers((current) => ({ ...current, [questionId]: answer }));
    setError("");
  }

  function setCombinedResponse(answer: string) {
    setCombinedAnswer(answer);
    setError("");
  }

  function toggleAnswerMode() {
    setUseCombinedAnswer((current) => !current);
    setTriedSubmit(false);
    setError("");
  }

  async function analyzeAnswers() {
    setTriedSubmit(true);
    if (!hasRequiredAnswers || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/safety-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          analysis,
          followUpQuestions: visibleQuestions,
          followUpAnswers: followupAnswers,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = parseSafetyFollowupResult(payload);
      if (!response.ok || !parsed) {
        throw new Error("Furvise could not analyze those answers. Please try again.");
      }
      onResult(parsed);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Furvise could not analyze those answers. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const urgentCare = result?.decision === "urgent_vet";
  const paused = result?.decision === "pause_products";
  const safetyCleared = result?.decision === "show_products" && result.safeToShowProducts;
  const hasRedFlagAnswer = false;
  const hasUnsureAnswer = false;

  return (
    <section className="mt-8 rounded-[2rem] border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-6 text-[var(--pw-warning-text)] shadow-2xl shadow-amber-950/10 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8a5521]">
            Safety pause
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--pw-warning-text)] sm:text-4xl">
            Answer a few safety questions first
          </h2>
          <p className="mt-4 text-lg leading-8">
            Furvise needs these details before continuing with care guidance.
          </p>
          <p className="mt-3 leading-7">{analysis.vetAttention.reason}</p>
        </div>
        <div className="max-w-xs">
          <span className="inline-flex rounded-full bg-[var(--pw-warning-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-warning-text)]">
            Care context
          </span>
          <p className="mt-2 text-xs leading-5 text-[var(--pw-warning-text)]">
            {FURVISE_SAFETY_LINE}
          </p>
        </div>
      </div>

      {safetyQuestions.length > 0 ? (
        <div className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-[var(--pw-warning-text)]">
              {useCombinedAnswer
                ? "Share the details naturally in one message."
                : "Answer the questions below, or switch to one message."}
            </p>
            <button
              aria-pressed={useCombinedAnswer}
            className="w-full rounded-full border border-[var(--pw-warning-border)] bg-[var(--pw-surface)] px-4 py-2 text-sm font-semibold text-[var(--pw-warning-text)] transition hover:border-[var(--pw-warning-text)] hover:text-[var(--pw-warning-text)] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
              disabled={submitting}
              onClick={toggleAnswerMode}
              type="button"
            >
              {useCombinedAnswer ? "Answer questions separately" : "Answer in one message instead"}
            </button>
          </div>

          {useCombinedAnswer ? (
            <label className="mt-4 block rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_75%,transparent)] p-4">
              <span className="text-sm font-semibold text-[var(--pw-warning-text)]">Describe what happened</span>
              <textarea
                aria-invalid={triedSubmit && !combinedAnswerComplete}
                className="mt-3 min-h-32 w-full resize-y rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-surface)] px-4 py-3 text-sm leading-6 text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-subtle)] focus:border-[var(--pw-warning-text)] focus:ring-2 focus:ring-[var(--pw-warning-border)]"
                disabled={submitting}
                onChange={(event) => setCombinedResponse(event.target.value)}
                placeholder="Example: Maple vomited once this morning, no blood, drinking water, energy seems normal."
                value={combinedAnswer}
              />
            </label>
          ) : (
            <div className="mt-4 space-y-3">
              {safetyQuestions.map((question, index) => {
                const answered = Boolean(answers[question.id]?.trim());
                return (
                  <label
                    className="block rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_75%,transparent)] p-4"
                    key={question.id}
                  >
                    <span className="text-sm font-semibold text-[var(--pw-warning-text)]">
                      {index + 1}. {question.text}
                    </span>
                    <textarea
                      aria-invalid={triedSubmit && !answered}
                      className="mt-3 min-h-16 w-full resize-y rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-surface)] px-4 py-3 text-sm leading-6 text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-subtle)] focus:border-[var(--pw-warning-text)] focus:ring-2 focus:ring-[var(--pw-warning-border)]"
                      disabled={submitting}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      placeholder={getSafetyAnswerPlaceholder(question.text)}
                      value={answers[question.id] || ""}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] p-4 font-semibold leading-7">
          Furvise did not receive enough follow-up questions to continue. Care guidance remains paused.
        </p>
      )}

      {error ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 font-semibold leading-7 text-[var(--pw-danger-text)]">
          {error}
        </p>
      ) : null}

      {result && urgentCare ? (
        <SafetyFollowupResultPanel
          result={result}
          title="Seek urgent veterinary care"
          tone="urgent"
        />
      ) : result && paused ? (
        <SafetyFollowupResultPanel
          result={result}
          title="Care guidance remains paused"
          tone="paused"
        />
      ) : result && safetyCleared ? (
        <SafetyFollowupResultPanel
          result={result}
          title="Care guidance can continue"
          tone="clear"
        />
      ) : null}

      {!result && triedSubmit && !hasRequiredAnswers && safetyQuestions.length > 0 ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] p-4 font-semibold leading-7">
          {validationError}
        </p>
      ) : hasRedFlagAnswer ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 font-semibold leading-7 text-[var(--pw-danger-text)]">
          Care guidance remains paused. Please contact a veterinarian before making care changes.
        </p>
      ) : hasUnsureAnswer ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] p-4 font-semibold leading-7">
          Care guidance remains paused. Contact a veterinarian or answer with more details before making care changes.
        </p>
      ) : (
        <button
          className="mt-6 w-full rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-default disabled:bg-[var(--pw-secondary)] sm:w-auto"
          disabled={submitting}
          onClick={analyzeAnswers}
          type="button"
        >
          {submitting ? "Furvise is reviewing the details..." : "Review safety details"}
        </button>
      )}
    </section>
  );
}

function SafetyFollowupResultPanel({
  result,
  title,
  tone,
}: {
  result: SafetyFollowupResult;
  title: string;
  tone: "urgent" | "paused" | "clear";
}) {
  const className =
    tone === "clear"
      ? "border-[var(--pw-border)] bg-[color-mix(in_srgb,var(--pw-surface)_80%,transparent)] text-[var(--pw-primary)]"
      : tone === "urgent"
        ? "border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] text-[var(--pw-danger-text)]"
        : "border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] text-[var(--pw-warning-text)]";

  return (
    <div className={`mt-5 rounded-2xl border p-4 font-semibold leading-7 ${className}`}>
      <p>{title}</p>
      <p className="mt-2 font-normal">{result.summary}</p>
      {result.reasons.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 font-normal">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type SafetyQuestion = {
  id: string;
  text: string;
};

function getSafetyAnswerPlaceholder(question: string) {
  const normalized = question.toLowerCase();
  if (normalized.includes("how long")) {
    return "Example: started this morning / about 2 days";
  }
  if (normalized.includes("how often")) {
    return "Example: once today / three times since last night";
  }
  if (
    normalized.includes("keep water down") ||
    normalized.includes("keeping water down") ||
    normalized.includes("kept water down")
  ) {
    return "Example: yes, drinking normally / no, vomits after drinking";
  }
  if (
    normalized.includes("blood") ||
    normalized.includes("serious") ||
    normalized.includes("weakness") ||
    normalized.includes("bloating") ||
    normalized.includes("collapse") ||
    normalized.includes("trouble breathing")
  ) {
    return "Example: no blood, no weakness, no bloating";
  }
  return "Add any details you noticed.";
}

function buildSoonSafetyQuestions(
  analysis: PetWiseAnalysis,
): SafetyQuestion[] {
  const aiQuestions = uniqueNonEmptyStrings(analysis.missingInformation).slice(0, 3);
  return aiQuestions.map((question, index) => ({
    id: `ai-${index}-${normalizeQuestionId(question)}`,
    text: question,
  }));
}



function uniqueNonEmptyStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQuestionId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function UrgentCarePanel({
  analysis,
  profile,
}: {
  analysis: PetWiseAnalysis;
  profile: DogProfile;
}) {
  const dogName = formatPetDisplayName(profile.name);
  const reportedSigns =
    analysis.ownerReportedObservations.length > 0
      ? analysis.ownerReportedObservations.slice(0, 4)
      : [selectedConcern(profile) || "Emergency signs were reported in the profile."];
  const followUpQuestions = analysis.missingInformation.slice(0, 3);

  return (
    <section className="mt-8 rounded-[2rem] border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-6 text-[var(--pw-danger-text)] shadow-2xl shadow-red-950/10 sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-danger-text)]">
            Urgent safety
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--pw-danger-text)] sm:text-4xl">
            Seek emergency veterinary care now
          </h2>
          <p className="mt-4 text-lg leading-8">
            {FURVISE_URGENT_SAFETY_MESSAGE}
          </p>
          <p className="mt-3 leading-7">{analysis.vetAttention.reason}</p>
        </div>
        <div className="max-w-xs">
          <span className="inline-flex rounded-full bg-[var(--pw-danger-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-danger-text)]">
            Safety first
          </span>
          <p className="mt-2 text-xs leading-5 text-[var(--pw-danger-text)]">
            {FURVISE_SAFETY_LINE}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-[color-mix(in_srgb,var(--pw-danger-surface)_75%,transparent)] p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--pw-danger-text)]">
            Species
          </p>
          <p className="mt-2 text-xl font-semibold text-[var(--pw-danger-text)]">
            {dogName} · {formatSpecies(profile.species)}
          </p>
        </div>
        <AnalysisList
          emptyText="No emergency signs were captured."
          items={reportedSigns}
          title="Reported emergency signs"
        />
      </div>

      {followUpQuestions.length > 0 ? (
        <div className="mt-4">
          <AnalysisList
            emptyText="No follow-up questions listed."
            items={followUpQuestions}
            title="Follow-up questions for the vet"
          />
        </div>
      ) : null}

      <button
        className="mt-6 w-full rounded-full bg-[var(--pw-danger-border)] px-5 py-3 text-sm font-semibold text-white opacity-70 sm:w-auto"
        disabled
        type="button"
      >
        Emergency vet finder coming soon
      </button>
    </section>
  );
}

function AnalysisList({
  description,
  emptyText,
  items,
  title,
}: {
  description?: string;
  emptyText: string;
  items: string[];
  title: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--pw-card-muted)] p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--pw-subtle)]">
        {title}
      </p>
      {description ? <p className="mt-2 text-sm leading-6 text-[var(--pw-muted)]">{description}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-[var(--pw-muted)]">
          {items.map((item) => (
            <li className="leading-6" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 leading-6 text-[var(--pw-muted)]">{emptyText}</p>
      )}
    </div>
  );
}

function formatMemoryType(type: string) {
  if (type === "profile_fact") return "Profile fact";
  if (type === "owner_observation") return "Owner observation";
  return "Preference";
}

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

function uniqueMemoryInputs(memories: MemoryInput[]) {
  const seen = new Set<string>();
  return memories.filter((memory) => {
    const normalized = memory.text.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized) || isCanonicalProfileMemory(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isCanonicalProfileMemory(normalized: string) {
  return /\b(name|species|breed|age|weight|current food|budget|main concern|avoidances?)\s+(is|are|:)\b/.test(
    normalized,
  );
}

function formatWellnessGoalLabel(goal: WellnessGoal | "") {
  if (goal === "nutrition") return "Nutrition";
  if (goal === "dental_care") return "Dental care";
  if (goal === "grooming") return "Grooming";
  if (goal === "activity") return "Activity";
  if (goal === "preventive_care") return "Preventive care";
  if (goal === "reminders") return "Reminders";
  if (goal === "something_else") return "Something else";
  return "";
}
