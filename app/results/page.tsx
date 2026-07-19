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
  buildAnalysisMatcherProfile,
  parseAnalysis,
  parseAnalysisMemoryContext,
  parseSafetyFollowupResult,
  parseStoredAnalysis,
} from "../lib/ai-analysis";
import {
  DogProfile,
  ONBOARDING_MODE_STORAGE_KEY,
  ProductCategory,
  Recommendation,
  STORAGE_KEY,
  WellnessGoal,
  NutritionGoal,
  buildRecommendations,
  formatAge,
  formatAvoidIngredients,
  formatBudget,
  formatSpecies,
  formatWeight,
  getBudget,
  hasSpeciesCompatibleFoodProducts,
  initialProfile,
  normalizeProfile,
  formatPetDisplayName,
  selectedConcern,
} from "../lib/petwise";
import { NEW_PET_LOGIN_PATH, buildLoginHref } from "../lib/auth-routing";
import {
  getActiveProductCountry,
  getConfiguredProductProvider,
  getDisplayProductPriceLabel,
  getProductLinkInfo,
  hasStaticRealProductsExcludedByCountry,
} from "../lib/product-providers";
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
  ProductFeedbackType,
  DogProfileRow,
  dogProfileRowToDraft,
  getCurrentUser,
  listCareEntriesForPet,
  loadDogProductFeedbackForUser,
  loadDogProfileWithMemoriesForUser,
  loadUserProfileForUser,
  saveDogMemories,
  toggleProductFeedbackForUser,
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
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [feedbackLoadedForDogProfileId, setFeedbackLoadedForDogProfileId] = useState("");
  const [accountProductCountry, setAccountProductCountry] = useState<string | null>(null);
  const [accountCountryLoaded, setAccountCountryLoaded] = useState(false);
  const [selectedWellnessGoal, setSelectedWellnessGoal] = useState<WellnessGoal | "">("");
  const [customWellnessText, setCustomWellnessText] = useState("");
  const [appliedCustomWellnessText, setAppliedCustomWellnessText] = useState("");
  const [selectedNutritionGoal, setSelectedNutritionGoal] = useState<NutritionGoal | "">("");
  const [showMoreProductOptions, setShowMoreProductOptions] = useState(false);
  const [safetyFollowupState, setSafetyFollowupState] = useState<{
    key: string;
    result: SafetyFollowupResult;
  } | null>(null);
  const [stableResult, setStableResult] = useState<ReturnType<typeof buildRecommendations> | null>(
    null,
  );

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      void (async () => {
        const profileIdFromRoute = searchParams.get("profileId") || "";
        setLoaded(false);
        setLoadError("");
        setAnalysisResult(null);
        setStableResult(null);
        setShowMoreProductOptions(false);
        setFeedbackLoaded(false);
        setFeedbackLoadedForDogProfileId("");
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
            setSelectedWellnessGoal(savedProfile.wellnessGoal || "");
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
        setSelectedWellnessGoal(restoredProfile.wellnessGoal || "");

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
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!user) return null;
        return loadUserProfileForUser(user);
      })
      .then((row) => {
        if (active) setAccountProductCountry(row?.country || null);
      })
      .catch(() => {
        if (active) setAccountProductCountry(null);
      })
      .finally(() => {
        if (active) setAccountCountryLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userLoaded) return;
    if (!userId || !dogProfileId) {
      const emptyFeedbackTimer = window.setTimeout(() => {
        setProductFeedback([]);
        setFeedbackLoadedForDogProfileId(dogProfileId);
        setFeedbackLoaded(true);
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
          setFeedbackLoadedForDogProfileId(dogProfileId);
          setFeedbackLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setProductFeedback([]);
          setFeedbackLoadedForDogProfileId(dogProfileId);
          setFeedbackLoaded(true);
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
  const memoryHasUrgentSafety = Boolean(resultsUnderstanding?.safetyFlags.length);
  const matcherProfile = useMemo(
    () => {
      const analysisProfile = buildAnalysisMatcherProfile(profile, analysis);
      const memoryAvoids = petMemory?.derived.knownAvoids || [];
      return {
        ...analysisProfile,
        avoidIngredients: mergeUniqueStrings([
          ...analysisProfile.avoidIngredients,
          ...memoryAvoids,
        ]),
      };
    },
    [analysis, petMemory?.derived.knownAvoids, profile],
  );
  const productProvider = useMemo(() => getConfiguredProductProvider(), []);
  const activeProductCountry = useMemo(
    () => getActiveProductCountry({ accountCountry: accountProductCountry }),
    [accountProductCountry],
  );
  const appliedWellnessGoal =
    selectedWellnessGoal === "something_else" && !appliedCustomWellnessText.trim()
      ? ""
      : selectedWellnessGoal;
  const memorySummary = petMemory?.derived.summaryBullets.join(" ");
  const careSummary = useMemo(
    () => buildResultsCareSummary({ analysis, memory: petMemory, profile }),
    [analysis, petMemory, profile],
  );
  const recommendationAnalysis = useMemo(
    () => ({
      recommendedConcernTags: analysis?.recommendedConcernTags,
      summary: analysis?.summary || memorySummary,
      wellnessGoal: appliedWellnessGoal || undefined,
      wellnessGoalText: appliedWellnessGoal === "something_else" ? appliedCustomWellnessText : undefined,
      nutritionGoal: selectedNutritionGoal || undefined,
    }),
    [
      analysis?.recommendedConcernTags,
      analysis?.summary,
      appliedCustomWellnessText,
      appliedWellnessGoal,
      memorySummary,
      selectedNutritionGoal,
    ],
  );
  const productProviderContext = useMemo(
    () => ({
      analysis: recommendationAnalysis,
      feedback: productFeedback,
      productCountry: activeProductCountry,
      profile: matcherProfile,
    }),
    [activeProductCountry, matcherProfile, productFeedback, recommendationAnalysis],
  );
  const productProviderResult = useMemo(() => {
    try {
      const products = productProvider.searchProducts(productProviderContext);
      return {
        error: "",
        products: productProvider.rankProducts(products, productProviderContext),
      };
    } catch (error) {
      console.warn("[Furvise results] product provider failed", {
        message: error instanceof Error ? error.message : "Unknown product provider error",
        provider: productProvider.id,
      });
      return {
        error: "Furvise could not load product options.",
        products: [],
      };
    }
  }, [productProvider, productProviderContext]);
  const providerProducts = productProviderResult.products;
  const productProviderError = productProviderResult.error;
  const finishProfileItems = useMemo(() => getFinishProfileItemsFromDraft(profile), [profile]);
  const usingStaticRealProducts = productProvider.id === "static_real";
  const regionRemovedAllSpeciesProducts =
    usingStaticRealProducts &&
    Boolean(profile.species) &&
    hasStaticRealProductsExcludedByCountry(profile.species, activeProductCountry);
  const productCopy = usingStaticRealProducts
    ? {
        closestOptions: "Closest available product options",
        lowerCostNoMatches: "No lower-cost product matches yet",
        noMatches: "No suitable product suggestion yet",
        productNoun: "products",
        providerUnavailable: "Furvise could not load product options.",
        regionUnavailableBody: "Furvise does not have a safe catalog match available for your region right now.",
        regionUnavailableTitle: "No region-verified product suggestion yet",
        speciesFoodUnavailable: `No ${profile.species === "cat" ? "cat food" : "food"} products are available yet.`,
        trustNote:
          "Static product references are filtered by saved pet context and configured country. Price is not provided unless the curated catalog includes it.",
      }
    : {
        closestOptions: "Closest available product options",
        lowerCostNoMatches: "No lower-cost product matches yet",
        noMatches: "No suitable product suggestion yet",
        productNoun: "products",
        providerUnavailable: "Furvise could not load product options.",
        regionUnavailableBody: "Furvise does not have a safe catalog match available for your region right now.",
        regionUnavailableTitle: "No region-verified product suggestion yet",
        speciesFoodUnavailable: `No ${profile.species === "cat" ? "cat food" : "food"} products are available yet.`,
        trustNote:
          "Product references use local development data. Real products and live prices will be added later.",
      };
  const wellnessGoalLabel = formatWellnessGoalLabel(appliedWellnessGoal);
  const budget = getBudget(matcherProfile);
  const hasSpecies = Boolean(profile.species);
  const hasBasicProfileData = Boolean(profile.name.trim() && profile.species && selectedConcern(profile));
  useEffect(() => {
    if (
      !loaded ||
      !accountCountryLoaded ||
      !feedbackLoaded ||
      feedbackLoadedForDogProfileId !== dogProfileId ||
      !hasBasicProfileData ||
      memoryHasUrgentSafety ||
      stableResult
    ) {
      return;
    }
    const recommendationTimer = window.setTimeout(() => {
      // Recommendation pipeline stage 2: deterministic product matching uses the selected provider catalog.
      // Keep this result stable so feedback toggles do not reorder or remove visible products.
      setStableResult(
        buildRecommendations(matcherProfile, productFeedback, recommendationAnalysis, providerProducts),
      );
    }, 0);

    return () => {
      window.clearTimeout(recommendationTimer);
    };
  }, [
    accountCountryLoaded,
    dogProfileId,
    feedbackLoaded,
    feedbackLoadedForDogProfileId,
    hasBasicProfileData,
    loaded,
    memoryHasUrgentSafety,
    matcherProfile,
    providerProducts,
    productFeedback,
    recommendationAnalysis,
    stableResult,
  ]);

  const result = stableResult;
  const allRecommendations = result?.recommendations || [];
  const productRecommendations = allRecommendations.filter((item) => item.kind === "product");
  const nonProductRecommendations = allRecommendations.filter((item) => item.kind !== "product");
  const topProductRecommendations = productRecommendations.slice(0, 3);
  const moreProductRecommendations = productRecommendations.slice(3, 9);
  const visibleProductRecommendations = showMoreProductOptions
    ? [...topProductRecommendations, ...moreProductRecommendations]
    : topProductRecommendations;
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
  const showProductRecommendations =
    hasSpecies &&
    !memoryHasUrgentSafety &&
    !urgentVetAttention &&
    (!soonVetAttention ||
      (safetyFollowupResult?.decision === "show_products" &&
        safetyFollowupResult.safeToShowProducts));
  const showWellnessFollowUp =
    hasBasicProfileData &&
    showProductRecommendations &&
    !urgentVetAttention &&
    !soonVetAttention &&
    Boolean(result?.generalWellnessNeedsFocus);
  const showNutritionFollowUp =
    hasBasicProfileData &&
    showProductRecommendations &&
    !urgentVetAttention &&
    !soonVetAttention &&
    Boolean(result?.nutritionFollowUpNeeded);
  const showProductCardSection =
    hasBasicProfileData &&
    showProductRecommendations &&
    !showWellnessFollowUp &&
    !showNutritionFollowUp &&
    topProductRecommendations.length > 0;
  const showMoreOptionsButton =
    showProductCardSection && !showMoreProductOptions && moreProductRecommendations.length > 0;
  const showCareActionSection =
    hasBasicProfileData &&
    showProductRecommendations &&
    !showWellnessFollowUp &&
    !showNutritionFollowUp &&
    nonProductRecommendations.length > 0;
  const allVisibleProductsOverBudget =
    budget !== null &&
    visibleProductRecommendations.length > 0 &&
    visibleProductRecommendations.every((item) => {
      const recommendationCost = getRecommendationCost(item);
      return recommendationCost !== null && recommendationCost > budget;
    });
  const lowerCostNutritionSelected =
    selectedWellnessGoal === "nutrition" && selectedNutritionGoal === "lower_cost";
  const visibleProductRecommendationsWithinBudget = visibleProductRecommendations.filter(
    (item) => {
      const recommendationCost = getRecommendationCost(item);
      return budget !== null && recommendationCost !== null && recommendationCost <= budget;
    },
  );
  const lowerCostHasWithinBudgetProducts =
    lowerCostNutritionSelected && visibleProductRecommendationsWithinBudget.length > 0;
  const lowerCostNoCatalogMatches =
    lowerCostNutritionSelected &&
    budget !== null &&
    visibleProductRecommendations.length > 0 &&
    !lowerCostHasWithinBudgetProducts &&
    allVisibleProductsOverBudget;
  const comparisonNote =
    profile.currentFood.trim() && !profile.currentFoodUnknown &&
    (selectedNutritionGoal === "lower_cost" || selectedNutritionGoal === "compare_current_food")
      ? `These are catalog comparison options, not a recommendation to switch ${formatPetDisplayName(profile.name)}'s food.`
      : "";
  const showNoCatFoodProductMessage =
    hasBasicProfileData &&
    showProductRecommendations &&
    !showWellnessFollowUp &&
    !showNutritionFollowUp &&
    profile.species === "cat" &&
    appliedWellnessGoal === "nutrition" &&
    Boolean(selectedNutritionGoal) &&
    topProductRecommendations.length === 0 &&
    !regionRemovedAllSpeciesProducts &&
    !hasSpeciesCompatibleFoodProducts(profile.species, providerProducts);
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
    ...(selectedNutritionGoal ? [["Nutrition focus", formatNutritionGoalLabel(selectedNutritionGoal)]] : []),
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
                ? "Pause before products"
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
                {productCopy.trustNote}
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
                  ? "Furvise needs species before care or product suitability guidance."
                  : "Furvise needs a main concern before it can summarize this profile."}
              </p>
              <Link
                className="mt-4 inline-flex rounded-full bg-[var(--pw-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
                href={dogProfileId ? `/dogs/${dogProfileId}/edit` : "/onboarding"}
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
          {productProviderError ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 font-semibold text-[var(--pw-warning-text)]">
              {productCopy.providerUnavailable}
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
              editHref={`/dogs/${dogProfileId}/edit`}
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

          {showWellnessFollowUp ? (
            <WellnessGoalFollowUp
              customText={customWellnessText}
              onApplyCustomText={() => {
                setAppliedCustomWellnessText(customWellnessText.trim());
                setStableResult(null);
                setShowMoreProductOptions(false);
              }}
              onCustomTextChange={(value) => {
                setCustomWellnessText(value);
                setAppliedCustomWellnessText("");
                setStableResult(null);
                setShowMoreProductOptions(false);
              }}
              onSelectGoal={(goal) => {
                setSelectedWellnessGoal(goal);
                setSelectedNutritionGoal("");
                setStableResult(null);
                setShowMoreProductOptions(false);
                if (goal !== "something_else") {
                  setAppliedCustomWellnessText("");
                }
              }}
              selectedGoal={selectedWellnessGoal}
            />
          ) : null}

          {showNutritionFollowUp ? (
            <NutritionGoalFollowUp
              profileName={formatPetDisplayName(profile.name)}
              onSelectGoal={(goal) => {
                setSelectedNutritionGoal(goal);
                setStableResult(null);
                setShowMoreProductOptions(false);
              }}
              selectedGoal={selectedNutritionGoal}
            />
          ) : null}

          {showNoCatFoodProductMessage ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-sm">
              <h2 className="text-2xl font-semibold text-[var(--pw-text)]">
                {productCopy.speciesFoodUnavailable}
              </h2>
              <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                Furvise can still help compare {formatPetDisplayName(profile.name)}&apos;s current food once more details are
                available.
              </p>
            </div>
          ) : loaded && result && hasBasicProfileData && showProductRecommendations && !showWellnessFollowUp && !showNutritionFollowUp && allRecommendations.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-sm">
              <h2 className="text-2xl font-semibold text-[var(--pw-text)]">
                {regionRemovedAllSpeciesProducts ? productCopy.regionUnavailableTitle : productCopy.noMatches}
              </h2>
              <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                {regionRemovedAllSpeciesProducts
                  ? productCopy.regionUnavailableBody
                  : "Furvise does not have a safe catalog match for this pet's saved context right now."}
              </p>
              {!regionRemovedAllSpeciesProducts ? (
                <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                  Try adding more details about species, current food, avoid ingredients, or the main concern.
                </p>
              ) : (
                <p className="mt-3 leading-7 text-[var(--pw-muted)]">
                  You can change your product country in{" "}
                  <Link className="font-semibold text-[var(--pw-primary)] hover:text-[var(--pw-primary-hover)]" href="/account">
                    Account settings
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : null}

          {hasBasicProfileData && showProductRecommendations && !showNutritionFollowUp && result?.establishedFoodWithoutNutritionConcern ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 text-[var(--pw-muted)]">
              An established food is already recorded, and no feeding concern was reported, so
              Furvise is not suggesting a food change.
            </div>
          ) : null}

          {hasBasicProfileData && showProductRecommendations && lowerCostNoCatalogMatches ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 text-[var(--pw-warning-text)]">
              <h2 className="text-2xl font-semibold text-[var(--pw-warning-text)]">
                {productCopy.lowerCostNoMatches}
              </h2>
              <p className="mt-3 leading-7">
                {`All available ${profile.species === "cat" ? "cat-food" : "food"} options with verified prices are above ${formatPetDisplayName(profile.name)}'s $${budget}/month care budget.`}
              </p>
              {comparisonNote ? <p className="mt-3 leading-7">{comparisonNote}</p> : null}
            </div>
          ) : null}

          {hasBasicProfileData && showProductRecommendations && allVisibleProductsOverBudget && !lowerCostNoCatalogMatches ? (
            <div className="mt-6 rounded-3xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 text-[var(--pw-warning-text)]">
              All visible {productCopy.productNoun} exceed your ${budget}/month care budget, so Furvise is showing
              the closest matches.
            </div>
          ) : null}

          {hasBasicProfileData && showProductRecommendations && result?.hardExclusionLimitedResults ? (
            <div className="mt-6 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-4 py-3 text-sm font-semibold text-[var(--pw-muted)] shadow-sm">
              Some products were hidden because you marked them as avoided or did not work.
            </div>
          ) : null}

          {hasBasicProfileData && showProductRecommendations && result?.closestSkinSupportOnly ? (
            <div className="mt-6 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-4 py-3 text-sm font-semibold text-[var(--pw-muted)] shadow-sm">
              Furvise could not find an exact catalog match, so these are closest grooming or skin-care category options.
            </div>
          ) : null}
        </section>

        {showProductCardSection || showCareActionSection ? (
          <section className="mx-auto max-w-5xl pb-16 pt-1">
            {soonVetAttention ? (
              <div className="mb-4 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] px-4 py-3 text-sm font-semibold text-[var(--pw-warning-text)]">
                General {productCopy.productNoun} - not care instructions.
              </div>
            ) : null}
            {showProductCardSection ? (
              <div className="space-y-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">
                    {lowerCostNoCatalogMatches ? productCopy.closestOptions : "Top matches"}
                  </h2>
                  {showMoreOptionsButton ? (
                    <button
                      className="inline-flex min-h-11 items-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] hover:text-[var(--pw-primary)]"
                      onClick={() => setShowMoreProductOptions(true)}
                      type="button"
                    >
                      Show more options
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-5 lg:grid-cols-3">
                  {topProductRecommendations.map((item, index) => (
                    <RecommendationCard
                      dogProfileId={dogProfileId}
                      item={item}
                      key={`${item.label}-${item.product?.id ?? index}`}
                      onFeedbackToggled={(result) =>
                        setProductFeedback((current) => {
                          if (result.action === "removed") {
                            return current.filter((entry) => entry.id !== result.feedback.id);
                          }

                          return current.some((entry) => entry.id === result.feedback.id)
                            ? current
                            : [result.feedback, ...current];
                        })
                      }
                      productFeedback={productFeedback}
                      profile={matcherProfile}
                      userId={userId}
                    />
                  ))}
                </div>
                {showMoreProductOptions && moreProductRecommendations.length > 0 ? (
                  <div className="space-y-5">
                    <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">More options</h2>
                    <div className="grid gap-5 lg:grid-cols-3">
                      {moreProductRecommendations.map((item, index) => (
                        <RecommendationCard
                          dogProfileId={dogProfileId}
                          item={item}
                          key={`more-${item.label}-${item.product?.id ?? index}`}
                          onFeedbackToggled={(result) =>
                            setProductFeedback((current) => {
                              if (result.action === "removed") {
                                return current.filter((entry) => entry.id !== result.feedback.id);
                              }

                              return current.some((entry) => entry.id === result.feedback.id)
                                ? current
                                : [result.feedback, ...current];
                            })
                          }
                          productFeedback={productFeedback}
                          profile={matcherProfile}
                          userId={userId}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {showCareActionSection ? (
              <div className="mt-9 space-y-5">
                <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">Care actions</h2>
                <div className="grid gap-5 lg:grid-cols-3">
                  {nonProductRecommendations.map((item, index) => (
                    <RecommendationCard
                      dogProfileId={dogProfileId}
                      item={item}
                      key={`care-${item.kind}-${item.title ?? index}`}
                      onFeedbackToggled={() => undefined}
                      productFeedback={productFeedback}
                      profile={matcherProfile}
                      userId={userId}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
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
            weight, and budget later to improve product guidance.
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
        Care and product suitability differ by species, so Furvise needs this profile detail
        before showing food, dental, grooming, flea/tick, supplement, or other health-essential
        product recommendations.
      </p>
      <Link
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)]"
        href={dogProfileId ? `/dogs/${dogProfileId}/edit` : "/onboarding?step=2"}
      >
        Add species
      </Link>
    </section>
  );
}

function WellnessGoalFollowUp({
  customText,
  onApplyCustomText,
  onCustomTextChange,
  onSelectGoal,
  selectedGoal,
}: {
  customText: string;
  onApplyCustomText: () => void;
  onCustomTextChange: (value: string) => void;
  onSelectGoal: (goal: WellnessGoal) => void;
  selectedGoal: WellnessGoal | "";
}) {
  const customSelected = selectedGoal === "something_else";
  const customReady = customText.trim().length > 0;

  return (
    <section className="mt-8 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-full bg-[var(--pw-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
          Follow-up needed
        </span>
        <span className="inline-flex rounded-full border border-[var(--pw-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-muted)]">
          Limited context
        </span>
      </div>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--pw-heading)]">
        What would you like help with first?
      </h2>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--pw-muted)]">
        General wellness is broad, so Furvise needs a focused goal before suggesting products.
      </p>

      <div className="mt-6 flex flex-wrap gap-2.5" role="group" aria-label="Choose wellness goal">
        {wellnessGoalOptions.map((option) => (
          <button
            aria-pressed={selectedGoal === option.value}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] ${
              selectedGoal === option.value
                ? "border-[var(--pw-primary)] bg-[var(--pw-primary)] text-white"
                : "border-[var(--pw-border-strong)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-primary)]"
            }`}
            key={option.value}
            onClick={() => onSelectGoal(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      {customSelected ? (
        <div className="mt-5">
          <label className="block">
            <span className="text-sm font-semibold text-[var(--pw-muted)]">
              Tell Furvise what you want help with.
            </span>
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-base leading-7 text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-placeholder)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface)]"
              onChange={(event) => onCustomTextChange(event.target.value)}
              value={customText}
            />
          </label>
          <button
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--pw-secondary)]"
            disabled={!customReady}
            onClick={onApplyCustomText}
            type="button"
          >
            Apply focus
          </button>
        </div>
      ) : selectedGoal ? (
        <p className="mt-5 rounded-2xl bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
          Using: {formatWellnessGoalLabel(selectedGoal)}
        </p>
      ) : null}
    </section>
  );
}

function NutritionGoalFollowUp({
  profileName,
  onSelectGoal,
  selectedGoal,
}: {
  profileName: string;
  onSelectGoal: (goal: NutritionGoal) => void;
  selectedGoal: NutritionGoal | "";
}) {
  return (
    <section className="mt-8 rounded-[2rem] border border-[var(--pw-border)] bg-[var(--pw-surface)] p-6 shadow-2xl shadow-[var(--pw-shadow)]">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-full bg-[var(--pw-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
          Follow-up needed
        </span>
        <span className="inline-flex rounded-full border border-[var(--pw-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-muted)]">
          Limited context
        </span>
      </div>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--pw-heading)]">
        What would you like to improve about {profileName}&apos;s food?
      </h2>
      <p className="mt-3 max-w-3xl leading-7 text-[var(--pw-muted)]">
        An established food is already recorded, and no feeding concern was reported, so Furvise is
        not suggesting a food change yet.
      </p>
      <div className="mt-6 flex flex-wrap gap-2.5" role="group" aria-label="Choose nutrition focus">
        {nutritionGoalOptions.map((option) => (
          <button
            aria-pressed={selectedGoal === option.value}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] ${
              selectedGoal === option.value
                ? "border-[var(--pw-primary)] bg-[var(--pw-primary)] text-white"
                : "border-[var(--pw-border-strong)] bg-[var(--pw-surface)] text-[var(--pw-text)] hover:border-[var(--pw-primary)]"
            }`}
            key={option.value}
            onClick={() => onSelectGoal(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {selectedGoal ? (
        <p className="mt-5 rounded-2xl bg-[var(--pw-card-muted)] p-4 text-sm font-semibold text-[var(--pw-primary)]">
          Using: {formatNutritionGoalLabel(selectedGoal)}
        </p>
      ) : null}
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
          <p className="font-semibold">Products are paused because saved memory contains urgent warning signs.</p>
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
          emptyText="No saved avoid ingredients or avoid-product notes."
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
  const showingProducts = result?.decision === "show_products" && result.safeToShowProducts;
  const hasRedFlagAnswer = false;
  const hasUnsureAnswer = false;
  const showProducts = false;

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
            Product recommendations are paused until Furvise reviews these details.
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
          Furvise did not receive enough follow-up questions to continue. Product recommendations
          remain paused.
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
          title="Products remain paused"
          tone="paused"
        />
      ) : result && showingProducts ? (
        <SafetyFollowupResultPanel
          result={result}
          title="General product guidance can be shown"
          tone="clear"
        />
      ) : null}

      {!result && triedSubmit && !hasRequiredAnswers && safetyQuestions.length > 0 ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] p-4 font-semibold leading-7">
          {validationError}
        </p>
      ) : hasRedFlagAnswer ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-4 font-semibold leading-7 text-[var(--pw-danger-text)]">
          Product recommendations remain paused. Please contact a veterinarian before shopping for
          food, supplements, or products.
        </p>
      ) : hasUnsureAnswer ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[color-mix(in_srgb,var(--pw-warning-surface)_70%,transparent)] p-4 font-semibold leading-7">
          Product recommendations remain paused. Contact a veterinarian or answer with more details
          before shopping for food, supplements, or products.
        </p>
      ) : showProducts ? (
        <p className="mt-5 rounded-2xl border border-[var(--pw-border)] bg-white/80 p-4 font-semibold leading-7 text-[var(--pw-primary)]">
          General product guidance, not care instructions.
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
      {result.productCautionLabel ? (
        <p className="mt-3 text-sm">{result.productCautionLabel}</p>
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
            Products paused
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

function RecommendationCard({
  dogProfileId,
  item,
  onFeedbackToggled,
  productFeedback,
  profile,
  userId,
}: {
  dogProfileId: string;
  item: Recommendation;
  onFeedbackToggled: (result: {
    action: "added" | "removed";
    feedback: DogProductFeedbackRow;
  }) => void;
  productFeedback: DogProductFeedbackRow[];
  profile: DogProfile;
  userId: string;
}) {
  const budget = getBudget(profile);
  const productLinkInfo = item.product ? getProductLinkInfo(item.product) : null;
  const verifiedPrice = item.product ? getVerifiedProductPrice(item.product) : null;
  const priceLabel = item.product ? getDisplayProductPriceLabel(item.product) : "Not provided";
  const overBudget = item.product !== null && budget !== null && verifiedPrice !== null && verifiedPrice > budget;
  const safeProductMatchNote =
    profile.avoidIngredients.length > 0
      ? "Region-verified catalog match. Matches species and care category. Avoid ingredients were checked where product metadata is available."
      : "Region-verified catalog match. Matches species and care category. Add avoid ingredients to make product filtering safer.";
  const [savingType, setSavingType] = useState<ProductFeedbackType | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (item.product === null) {
    return (
      <article className="min-w-0 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex rounded-full bg-[var(--pw-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
            {formatRecommendationKind(item.kind)}
          </span>
          {item.confidenceLabel ? (
            <span className="inline-flex rounded-full border border-[var(--pw-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-muted)]">
              {item.confidenceLabel}
            </span>
          ) : null}
        </div>
        <h2 className="mt-5 break-words text-xl font-semibold leading-tight text-[var(--pw-text)] sm:text-2xl">
          {item.title || "More details needed"}
        </h2>
        {item.matchedBecause ? (
          <p className="mt-4 rounded-2xl bg-[var(--pw-card-muted)] p-3 text-sm font-semibold leading-6 text-[var(--pw-primary)]">
            {item.matchedBecause}
          </p>
        ) : null}
        {item.note ? <p className="mt-4 leading-7 text-[var(--pw-muted)]">{item.note}</p> : null}
      </article>
    );
  }

  const existingFeedbackTypes = new Set(
    productFeedback
      .filter((feedback) => feedback.product_id === item.product?.id)
      .map((feedback) => feedback.feedback_type),
  );
  const canSaveFeedback = Boolean(userId && dogProfileId);

  async function saveFeedback(feedbackType: ProductFeedbackType) {
    if (!item.product) return;

    setSavingType(feedbackType);
    setMessage("");
    setError("");

    try {
      const user = await getCurrentUser();
      if (!user) throw new Error("Please sign in again before saving feedback.");

      const result = await toggleProductFeedbackForUser(
        {
          dogProfileId,
          productId: item.product.id,
          productName: item.product.name,
          feedbackType,
        },
        user,
      );
      // Recommendation pipeline stage 4: product feedback is stored for future ranking.
      onFeedbackToggled(result);
      setMessage(result.action === "removed" ? "Removed feedback" : "Saved feedback");
    } catch (saveError) {
      logProductFeedbackSaveFailure(saveError, feedbackType);
      setError("Furvise could not save this feedback. Please try again.");
    } finally {
      setSavingType("");
    }
  }

  return (
    <article className="min-w-0 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-full bg-[var(--pw-primary-soft)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
          {item.label}
        </span>
        <span className="inline-flex rounded-full border border-[var(--pw-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-muted)]">
          {item.product.evidenceType === "curated_static" ? "Curated product" : "Unverified product"}
        </span>
        <span className="inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
          {formatProductSpeciesBadge(item.product)}
        </span>
        <span className="inline-flex rounded-full border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-3 py-1 text-sm font-semibold text-[var(--pw-primary)]">
          {formatProductCategory(item.product.category)}
        </span>
        {item.confidenceLabel ? (
          <span className="inline-flex rounded-full border border-[var(--pw-border)] px-3 py-1 text-sm font-semibold text-[var(--pw-muted)]">
            {item.confidenceLabel}
          </span>
        ) : null}
        {item.label === "Review carefully" ? (
          <span className="inline-flex rounded-full bg-[var(--pw-warning-surface)] px-3 py-1 text-sm font-semibold text-[var(--pw-warning-text)]">
            Relaxed filters
          </span>
        ) : null}
        {overBudget ? (
          <span className="inline-flex rounded-full bg-[var(--pw-warning-surface)] px-3 py-1 text-sm font-semibold text-[var(--pw-warning-text)]">
            Over care budget
          </span>
        ) : null}
      </div>
      {item.product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={item.product.name}
          className="mt-5 aspect-[16/10] w-full rounded-2xl border border-[var(--pw-border)] object-cover"
          loading="lazy"
          src={item.product.imageUrl}
        />
      ) : null}
      <h2 className="mt-5 break-words text-xl font-semibold leading-tight text-[var(--pw-text)] sm:text-2xl">{item.product.name}</h2>
      <p className="mt-2 break-words text-sm font-semibold leading-6 text-[var(--pw-muted)]">
        {item.product.brand ? `${item.product.brand} - ` : ""}
        {item.product.retailer ? `${item.product.retailer} - ` : ""}
        {formatProductSummary(item.product)}
      </p>
      {item.product.sourceNote ? (
        <p className="mt-2 text-xs font-semibold text-[var(--pw-subtle)]">{item.product.sourceNote}</p>
      ) : null}
      <p className="mt-4 rounded-2xl bg-[var(--pw-card-muted)] p-3 text-sm font-semibold leading-6 text-[var(--pw-primary)]">
        {safeProductMatchNote}
      </p>
      {item.note ? (
        <p className="mt-4 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
          {item.note}
        </p>
      ) : null}
      <div className="mt-6 space-y-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-subtle)]">
            Catalog match
          </p>
          <p className="mt-2 leading-7 text-[var(--pw-muted)]">{safeProductMatchNote}</p>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pw-subtle)]">
            Source note
          </p>
          <p className="mt-2 leading-7 text-[var(--pw-muted)]">
            Static product reference. Region-verified catalog match. Price not provided unless included by the curated catalog.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--pw-card-muted)] px-4 py-3">
          <p className="text-sm text-[var(--pw-muted)]">
            Product price
          </p>
          <p className="mt-1 break-words text-lg font-semibold text-[var(--pw-primary)] sm:text-xl">
            {priceLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--pw-muted)]">
            {verifiedPrice === null
              ? "Price not provided."
              : `Verified ${item.product.priceVerifiedAt || "by static catalog"}.`}
          </p>
        </div>
        {productLinkInfo ? (
          <div className="flex flex-wrap gap-2">
          {productLinkInfo?.variant === "link" ? (
            <a
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] sm:w-auto"
              href={productLinkInfo.href}
              rel={productLinkInfo.rel}
              target={productLinkInfo.target}
            >
              {productLinkInfo.label}
            </a>
          ) : (
            <span className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--pw-border)] px-4 text-sm font-semibold text-[var(--pw-muted)] sm:w-auto">
              {productLinkInfo?.label ?? "Product reference"}
            </span>
          )}
          </div>
        ) : null}
      </div>
      {canSaveFeedback ? (
        <div className="mt-5 border-t border-[var(--pw-border)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--pw-subtle)]">
            Feedback
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
            {productFeedbackOptions.map((option) => {
              const alreadySaved = existingFeedbackTypes.has(option.type);
              return (
                <button
                  aria-pressed={alreadySaved}
                  className={`min-h-11 rounded-full border px-3 py-2 text-center text-sm font-semibold leading-5 transition disabled:cursor-wait sm:px-4 ${
                    alreadySaved
                      ? "border-[var(--pw-primary)] bg-[var(--pw-primary)] text-white shadow-sm shadow-[var(--pw-shadow)] hover:bg-[var(--pw-primary-hover)]"
                      : "border-[var(--pw-border-strong)] bg-[var(--pw-surface)] text-[var(--pw-muted)] hover:border-[var(--pw-secondary)] hover:text-[var(--pw-primary)]"
                  }`}
                  disabled={Boolean(savingType)}
                  key={option.type}
                  onClick={() => saveFeedback(option.type)}
                  type="button"
                >
                  {savingType === option.type
                    ? alreadySaved
                      ? "Removing..."
                      : "Saving..."
                    : option.label}
                </button>
              );
            })}
          </div>
          {message ? <p className="mt-3 text-sm font-semibold text-[var(--pw-primary)]">{message}</p> : null}
          {error ? <p className="mt-3 text-sm font-semibold text-[var(--pw-danger-text)]">{error}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function formatProductCategory(category: ProductCategory) {
  if (category === "food") return "Food";
  if (category === "grooming") return "Grooming";
  return "Health essentials";
}

function formatProductSpeciesBadge(product: Recommendation["product"]) {
  if (!product) return "Unknown species";
  if (product.species === "all") return "Species-neutral care item";
  if (product.category === "food") return `${capitalizeSpecies(product.species)} food`;
  if (product.category === "grooming") return `${capitalizeSpecies(product.species)} grooming`;
  return `${capitalizeSpecies(product.species)} care item`;
}

function formatRecommendationKind(kind: Recommendation["kind"]) {
  if (kind === "care_action") return "Care action";
  if (kind === "reminder") return "Reminder";
  if (kind === "vet_preparation") return "Vet preparation";
  if (kind === "education") return "Follow-up needed";
  return "Product";
}

function getRecommendationCost(item: Recommendation) {
  if (!item.product) return null;
  return getVerifiedProductPrice(item.product);
}

function getVerifiedProductPrice(product: Recommendation["product"]) {
  if (!product?.priceVerifiedAt) return null;
  return product.price ?? product.bagPrice ?? null;
}

function mergeUniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function logProductFeedbackSaveFailure(error: unknown, feedbackType: ProductFeedbackType) {
  if (process.env.NODE_ENV === "production") return;

  const databaseError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };

  console.warn("[Furvise results] product feedback save failed", {
    action: "toggle",
    errorCode: databaseError?.code || "",
    errorDetails: databaseError?.details || "",
    errorHint: databaseError?.hint || "",
    errorMessage: databaseError?.message || "",
    feedbackType,
    table: "dog_product_feedback",
  });
}

const wellnessGoalOptions: { value: WellnessGoal; label: string }[] = [
  { value: "nutrition", label: "Nutrition" },
  { value: "dental_care", label: "Dental care" },
  { value: "grooming", label: "Grooming" },
  { value: "activity", label: "Activity" },
  { value: "preventive_care", label: "Preventive care" },
  { value: "reminders", label: "Reminders" },
  { value: "something_else", label: "Something else" },
];

const nutritionGoalOptions: { value: NutritionGoal; label: string }[] = [
  { value: "lower_cost", label: "Lower cost" },
  { value: "compare_current_food", label: "Compare current food" },
  { value: "life_stage_fit", label: "Life-stage fit" },
  { value: "ingredient_concerns", label: "Ingredient fit" },
  { value: "picky_eating", label: "Picky eating" },
  { value: "sensitive_stomach", label: "Sensitive stomach" },
  { value: "just_exploring", label: "Just exploring" },
];

function formatWellnessGoalLabel(goal: WellnessGoal | "") {
  return wellnessGoalOptions.find((option) => option.value === goal)?.label || "";
}

function formatNutritionGoalLabel(goal: NutritionGoal | "") {
  return nutritionGoalOptions.find((option) => option.value === goal)?.label || "";
}

function formatProductSummary(product: Recommendation["product"]) {
  if (!product) return "";
  const lifeStage = `${product.lifeStage} life stage`;
  const speciesLabel = formatProductSpeciesBadge(product);
  if (product.category === "food") {
    return `${speciesLabel} - ${product.protein} protein - ${lifeStage}`;
  }
  if (product.protein === "Not applicable") {
    return `${speciesLabel} - ${lifeStage}`;
  }
  return `${speciesLabel} - ${product.protein} - ${lifeStage}`;
}

function capitalizeSpecies(species: "dog" | "cat") {
  return species === "dog" ? "Dog" : "Cat";
}

const productFeedbackOptions: { type: ProductFeedbackType; label: string }[] = [
  { type: "saved", label: "Save" },
  { type: "tried", label: "Tried" },
  { type: "worked", label: "Worked" },
  { type: "did_not_work", label: "Didn't work" },
  { type: "too_expensive", label: "Too expensive" },
  { type: "avoid_product", label: "Avoid" },
];
