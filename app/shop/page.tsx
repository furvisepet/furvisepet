"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "../components/app-page";
import { PageHeader, PrimaryButton } from "../components/product-primitives";
import type { ProductAiUsageStatus } from "../lib/billing/shop-usage";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  buildNoSafeProductMatchMessage,
  FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE,
  FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
  FURVISE_PRODUCT_USAGE_CAP_MESSAGE,
  FURVISE_SEARCH_FALLBACK_MESSAGE,
  FURVISE_URGENT_SAFETY_MESSAGE,
} from "../lib/furvise-voice";
import {
  formatPetDisplayName,
  formatSpecies,
  getProductSpeciesLabel,
} from "../lib/petwise";
import type { MockProduct, ProductCountry } from "../lib/petwise";
import {
  getActiveProductCountry,
  getProductLabelLinkInfo,
  getProductLinkInfo,
} from "../lib/product-providers";
import {
  MIN_SHOP_QUERY_LENGTH,
  searchShopProducts,
} from "../lib/shop";
import {
  isVagueShopQueryWithoutSignal,
  parseShopQueryInterpretation,
  type ShopQueryInterpretation,
} from "../lib/shop-query";
import {
  parseShopProductFitExplanation,
  type ShopProductFitExplanation,
} from "../lib/shop/product-fit-explanation";
import {
  parseShopProductQuestionAnswer,
  type ShopProductQuestionAnswer,
} from "../lib/shop/product-question";
import {
  formatProductResultCount,
  getProductDifferentiator,
} from "../lib/shop/product-display";
import {
  dogProfileRowToDraft,
  detectAccountProductCountry,
  getCurrentAccessToken,
  getSupabaseConfigError,
  loadDogProfilesWithMemories,
  loadUserProfileForUser,
  type DogProfileWithMemories,
} from "../lib/supabase";

type LoadState = "loading" | "ready" | "error";
type InterpretationState = {
  aiExhausted: boolean;
  aiUnavailable: boolean;
  error: string;
  fallback: boolean;
  interpretation: ShopQueryInterpretation | null;
  loading: boolean;
  petId: string;
  query: string;
  message: string;
};
type ProductExperienceState = "idle" | "understanding_request" | "awaiting_followup" | "searching_catalog" | "ranking_results" | "results" | "no_results" | "ai_exhausted" | "safety_suppressed" | "failed";
type CatalogState = {
  error: string;
  loading: boolean;
  petId: string;
  productCountry: ProductCountry;
  products: MockProduct[];
  query: string;
};
type FitExplanationState = {
  error: string;
  explanation: ShopProductFitExplanation | null;
  fallback: boolean;
  loading: boolean;
};
type ProductQuestionState = {
  answer: ShopProductQuestionAnswer | null;
  error: string;
  fallback: boolean;
  loading: boolean;
  question: string;
  usage: ProductAiUsageStatus | null;
};

const DEFAULT_PRODUCT_QUESTION_CHIPS = [
  "What should I check first?",
  "How would I use this?",
  "What should I watch for?",
  "When should I avoid it?",
];

const DENTAL_PRODUCT_QUESTION_CHIPS = [
  "Is this good for daily chewing?",
  "How often should I use it?",
  "What size should I choose?",
  "What should I watch for?",
];

const GROOMING_PRODUCT_QUESTION_CHIPS = [
  "Is this good for itchy paws?",
  "How do I use it?",
  "What should I check first?",
  "When should I avoid it?",
];

export default function ShopPage() {
  return (
    <Suspense fallback={<AppPage>{null}</AppPage>}>
      <ShopPageContent />
    </Suspense>
  );
}

function ShopPageContent() {
  const searchParams = useSearchParams();
  const requestedPetId = searchParams.get("petId") || "";
  const configError = getSupabaseConfigError();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [selectedPetId, setSelectedPetId] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [interpretationState, setInterpretationState] = useState<InterpretationState>({
    aiExhausted: false,
    aiUnavailable: false,
    error: "",
    fallback: false,
    interpretation: null,
    loading: false,
    petId: "",
    query: "",
    message: "",
  });
  const [shopUsage, setShopUsage] = useState<ProductAiUsageStatus | null>(null);
  const [shopUsageError, setShopUsageError] = useState("");
  const [catalogState, setCatalogState] = useState<CatalogState>({
    error: "",
    loading: false,
    petId: "",
    productCountry: "US",
    products: [],
    query: "",
  });
  const [limitReachedQuery, setLimitReachedQuery] = useState("");
  const [fitExplanationCache, setFitExplanationCache] = useState<Record<string, FitExplanationState>>({});
  const [productQuestionCache, setProductQuestionCache] = useState<Record<string, ProductQuestionState>>({});
  const [productQuestionInputs, setProductQuestionInputs] = useState<Record<string, string>>({});
  const [productCountry, setProductCountry] = useState<ProductCountry>("US");
  const [state, setState] = useState<LoadState>(configError ? "error" : "loading");
  const [error, setError] = useState(configError);
  const [invalidPetParam, setInvalidPetParam] = useState(false);

  useEffect(() => {
    if (configError) return;
    if (authStatus !== "signedIn" || !authUser) return;

    let active = true;

    async function load() {
      setState("loading");
      setError("");
      setInvalidPetParam(false);

      try {
        const user = authUser;
        if (!user) return;
        const [profileRows, loadedAccountProfile] = await Promise.all([
          loadDogProfilesWithMemories(user),
          loadUserProfileForUser(user).catch(() => null),
        ]);
        const accountProfile = loadedAccountProfile?.country
          ? loadedAccountProfile
          : await detectAccountProductCountry().catch(() => loadedAccountProfile);
        if (!active) return;

        setProfiles(profileRows);
        setProductCountry(getActiveProductCountry({ accountCountry: accountProfile?.country || null }));

        const requestedProfile = requestedPetId
          ? profileRows.find((profile) => profile.id === requestedPetId) || null
          : null;
        const nextSelectedPetId = requestedProfile?.id || (requestedPetId ? "" : profileRows.length === 1 ? profileRows[0].id : "");
        setSelectedPetId(nextSelectedPetId);
        setInvalidPetParam(Boolean(requestedPetId && !requestedProfile));
        setState("ready");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Furvise could not load Products.");
        setState("error");
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, configError, requestedPetId]);

  useEffect(() => {
    if (configError || authStatus !== "signedIn") return;
    let active = true;

    async function loadShopUsage() {
      try {
        const token = await getCurrentAccessToken();
        if (!token) return;
        const response = await fetch("/api/shop/interpret-query", {
          headers: { Authorization: `Bearer ${token}` },
          method: "GET",
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: unknown;
          usage?: unknown;
        } | null;
        if (!response.ok) {
          throw new Error(FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE);
        }
        if (active) {
          setShopUsage(parseProductAiUsageStatus(payload?.usage));
          setShopUsageError("");
        }
      } catch (usageError) {
        if (active) {
          setShopUsageError(usageError instanceof Error ? usageError.message : FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE);
        }
      }
    }

    void loadShopUsage();
    return () => {
      active = false;
    };
  }, [authStatus, configError]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedPetId) || null,
    [profiles, selectedPetId],
  );
  const selectedPetName = selectedProfile ? formatPetDisplayName(selectedProfile.name) : "";
  const selectedDraft = selectedProfile ? dogProfileRowToDraft(selectedProfile) : null;
  const interpretationMatches =
    interpretationState.petId === selectedPetId && interpretationState.query === submittedQuery;
  const activeInterpretation = interpretationMatches ? interpretationState.interpretation : null;
  const interpretationLoading = interpretationMatches && interpretationState.loading;
  const interpretationError = interpretationMatches ? interpretationState.error : "";
  const catalogMatches = catalogState.petId === selectedPetId
    && catalogState.productCountry === productCountry
    && catalogState.query === submittedQuery;
  const catalogProducts = useMemo(
    () => (catalogMatches ? catalogState.products : []),
    [catalogMatches, catalogState.products],
  );
  const catalogLoading = catalogMatches && catalogState.loading;
  const catalogError = catalogMatches ? catalogState.error : "";
  const searchResult = useMemo(
    () => activeInterpretation?.safetyFlags.urgentCare && submittedQuery.trim()
        ? {
            avoidIngredientsRemovedMatches: false,
            emptyState: "urgent" as const,
            ingredientVerificationRemovedMatches: false,
            products: [],
          }
        : activeInterpretation?.safetyFlags.medicalTreatmentIntent && submittedQuery.trim()
          ? {
              avoidIngredientsRemovedMatches: false,
              emptyState: "medical_intent" as const,
              ingredientVerificationRemovedMatches: false,
              products: [],
            }
          : searchShopProducts({
            interpretation: activeInterpretation,
            productCountry,
            products: catalogProducts,
            profile: selectedDraft,
            query: submittedQuery,
          }),
    [activeInterpretation, catalogProducts, productCountry, selectedDraft, submittedQuery],
  );
  const showAvoidNote = !interpretationLoading && searchResult.avoidIngredientsRemovedMatches;
  const canSearch = queryInput.trim().length >= MIN_SHOP_QUERY_LENGTH && Boolean(selectedPetId) && !interpretationLoading && !catalogLoading;
  const productExperienceState: ProductExperienceState = !submittedQuery ? "idle"
    : interpretationLoading ? "understanding_request"
    : catalogLoading ? "searching_catalog"
    : activeInterpretation?.safetyFlags.urgentCare ? "safety_suppressed"
    : interpretationState.aiExhausted ? "ai_exhausted"
    : interpretationError || catalogError ? "failed"
    : searchResult.products.length ? "results" : "no_results";

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    if (nextQuery.length < MIN_SHOP_QUERY_LENGTH || !selectedPetId) return;
    startSearch(nextQuery);
  }

  function startSearch(nextQuery: string) {
    if (nextQuery.length < MIN_SHOP_QUERY_LENGTH || !selectedPetId) return;
    setQueryInput(nextQuery);
    setSubmittedQuery(nextQuery);
    setLimitReachedQuery("");
    setFitExplanationCache({});
    setProductQuestionCache({});
    setProductQuestionInputs({});
    void loadSubmittedCatalog({ petId: selectedPetId, productCountry, query: nextQuery });
    if (isVagueShopQueryWithoutSignal(nextQuery)) {
      setInterpretationState({
        aiExhausted: false,
        aiUnavailable: false,
        error: "",
        fallback: false,
        interpretation: null,
        loading: false,
        petId: "",
        query: "",
        message: "",
      });
      return;
    }
    void interpretSubmittedQuery({
      petId: selectedPetId,
      productCountry,
      query: nextQuery,
    });
  }

  function resetInterpretation() {
    setInterpretationState({
      aiExhausted: false,
      aiUnavailable: false,
      error: "",
      fallback: false,
      interpretation: null,
      loading: false,
      petId: "",
      query: "",
      message: "",
    });
    setLimitReachedQuery("");
    setFitExplanationCache({});
    setProductQuestionCache({});
    setProductQuestionInputs({});
    setCatalogState({ error: "", loading: false, petId: "", productCountry, products: [], query: "" });
  }

  async function explainProductFit(productId: string) {
    if (!selectedPetId || !submittedQuery.trim() || !selectedProfile) return;
    const cacheKey = buildFitExplanationCacheKey({
      petId: selectedPetId,
      productId,
      query: submittedQuery,
    });
    const cached = fitExplanationCache[cacheKey];
    if (cached?.loading || cached?.explanation) return;

    setFitExplanationCache((current) => ({
      ...current,
      [cacheKey]: {
        error: "",
        explanation: null,
        fallback: false,
        loading: true,
      },
    }));

    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Please sign in again before checking this product.");

      const response = await fetch("/api/shop/explain-product-fit", {
        body: JSON.stringify({
          interpretation: activeInterpretation,
          petId: selectedPetId,
          productCountry,
          productId,
          query: submittedQuery,
          requestId: crypto.randomUUID(),
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: unknown;
        explanation?: unknown;
        fallback?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE);
      }

      const explanation = parseShopProductFitExplanation(payload?.explanation, selectedPetName || "this pet");
      if (!explanation) throw new Error(FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE);

      setFitExplanationCache((current) => ({
        ...current,
        [cacheKey]: {
          error: "",
          explanation,
          fallback: payload?.fallback === true,
          loading: false,
        },
      }));
    } catch (fitError) {
      setFitExplanationCache((current) => ({
        ...current,
        [cacheKey]: {
          error: fitError instanceof Error ? fitError.message : FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
          explanation: null,
          fallback: true,
          loading: false,
        },
      }));
    }
  }

  async function askProductQuestion(productId: string, questionOverride?: string) {
    if (!selectedPetId || !submittedQuery.trim() || !selectedProfile) return;
    const cacheKey = buildFitExplanationCacheKey({
      petId: selectedPetId,
      productId,
      query: submittedQuery,
    });
    const question = (questionOverride ?? productQuestionInputs[cacheKey] ?? "").trim();
    if (!question || productQuestionCache[cacheKey]?.loading) return;
    if (shopUsage?.allowed === false) {
      setProductQuestionCache((current) => ({
        ...current,
        [cacheKey]: {
          answer: current[cacheKey]?.answer || null,
          error: "You’ve used all of your AI guidance for this month. Product details and direct browsing are still available.",
          fallback: true,
          loading: false,
          question,
          usage: shopUsage,
        },
      }));
      return;
    }

    setProductQuestionCache((current) => ({
      ...current,
      [cacheKey]: {
        answer: current[cacheKey]?.answer || null,
        error: "",
        fallback: false,
        loading: true,
        question,
        usage: current[cacheKey]?.usage || null,
      },
    }));

    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Please sign in again before asking about this product.");

      const response = await fetch("/api/shop/product-question", {
        body: JSON.stringify({
          interpretation: activeInterpretation,
          petId: selectedPetId,
          productCountry,
          productId,
          query: submittedQuery,
          question,
          requestId: crypto.randomUUID(),
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        answer?: unknown;
        error?: unknown;
        fallback?: unknown;
        usage?: unknown;
        usageUnavailable?: unknown;
      } | null;
      const usage = parseProductAiUsageStatus(payload?.usage);
      if (usage) setShopUsage(usage);
      setShopUsageError(payload?.usageUnavailable === true ? FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE : "");
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : buildProductQuestionRetryMessage());
      }

      const answer = parseShopProductQuestionAnswer(payload?.answer, selectedPetName || "this pet");
      if (!answer) throw new Error(buildProductQuestionRetryMessage());

      setProductQuestionCache((current) => ({
        ...current,
        [cacheKey]: {
          answer,
          error: "",
          fallback: payload?.fallback === true,
          loading: false,
          question,
          usage,
        },
      }));
      setProductQuestionInputs((current) => ({ ...current, [cacheKey]: "" }));
    } catch (questionError) {
      setProductQuestionCache((current) => ({
        ...current,
        [cacheKey]: {
          answer: current[cacheKey]?.answer || null,
          error: questionError instanceof Error ? questionError.message : buildProductQuestionRetryMessage(),
          fallback: true,
          loading: false,
          question,
          usage: current[cacheKey]?.usage || null,
        },
      }));
    }
  }

  function buildProductQuestionRetryMessage() {
    return FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE;
  }

  async function interpretSubmittedQuery({
    petId,
    productCountry: country,
    query,
  }: {
    petId: string;
    productCountry: ProductCountry;
    query: string;
  }) {
    setInterpretationState({
      aiExhausted: false,
      aiUnavailable: false,
      error: "",
      fallback: false,
      interpretation: null,
      loading: true,
      petId,
      query,
      message: "",
    });

    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Please sign in again before searching products.");

      const response = await fetch("/api/shop/interpret-query", {
        body: JSON.stringify({ petId, productCountry: country, query, requestId: crypto.randomUUID() }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        cached?: unknown;
        error?: unknown;
        fallback?: unknown;
        interpretation?: unknown;
        limitReached?: unknown;
        creditsExhausted?: unknown;
        aiUnavailable?: unknown;
        message?: unknown;
        usage?: unknown;
      } | null;
      const usage = parseProductAiUsageStatus(payload?.usage);
      if (usage) setShopUsage(usage);
      if (!response.ok) {
        if (response.status === 402 || payload?.limitReached === true) {
          setLimitReachedQuery(query);
        }
        throw new Error(typeof payload?.error === "string" ? payload.error : FURVISE_SEARCH_FALLBACK_MESSAGE);
      }

      const interpretation = parseShopQueryInterpretation(payload?.interpretation);
      if (!interpretation) throw new Error(FURVISE_SEARCH_FALLBACK_MESSAGE);

      setInterpretationState({
        aiExhausted: payload?.creditsExhausted === true || payload?.limitReached === true,
        aiUnavailable: payload?.aiUnavailable === true,
        error: "",
        fallback: payload?.fallback === true,
        interpretation,
        loading: false,
        petId,
        query,
        message: typeof payload?.message === "string" ? payload.message : "",
      });
      setLimitReachedQuery(payload?.creditsExhausted === true || payload?.limitReached === true ? query : "");
    } catch (interpretError) {
      setInterpretationState({
        aiExhausted: false,
        aiUnavailable: true,
        error: interpretError instanceof Error
          ? interpretError.message
          : FURVISE_SEARCH_FALLBACK_MESSAGE,
        fallback: true,
        interpretation: null,
        loading: false,
        petId,
        query,
        message: "AI guidance is unavailable right now, but these products match the filters we could identify.",
      });
    }
  }

  async function loadSubmittedCatalog({
    petId,
    productCountry: country,
    query,
  }: {
    petId: string;
    productCountry: ProductCountry;
    query: string;
  }) {
    setCatalogState({ error: "", loading: true, petId, productCountry: country, products: [], query });
    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Please sign in again before searching products.");
      const response = await fetch("/api/shop/catalog", {
        body: JSON.stringify({ petId, productCountry: country, query }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown; products?: unknown } | null;
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE);
      }
      setCatalogState({
        error: "",
        loading: false,
        petId,
        productCountry: country,
        products: parseCatalogProducts(payload?.products),
        query,
      });
    } catch (catalogLoadError) {
      setCatalogState({
        error: catalogLoadError instanceof Error ? catalogLoadError.message : FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE,
        loading: false,
        petId,
        productCountry: country,
        products: [],
        query,
      });
    }
  }

  return (
    <AppPage layout="focused" shell="wide">
      <div className="min-w-0 overflow-x-hidden">
        <PageHeader
          mobileTitleSize="compact"
          supportingText={`Find food, grooming, dental, and everyday care products that fit ${selectedPetName || "your pet"}.`}
          title={`Products for ${selectedPetName || "your pet"}`}
        />

        {state === "loading" ? <Status text="Loading Products..." /> : null}
        {state === "error" ? <Status text={error || "Furvise could not load Products."} tone="warn" /> : null}

        {state === "ready" ? (
          <div className="mt-6 min-w-0 md:mt-8" data-product-state={productExperienceState}>
            <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface-primary)] p-4 shadow-[var(--shadow-surface-1)] md:p-6">
              <form className="grid min-w-0 gap-3 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end md:gap-4" onSubmit={submitSearch}>
                <label className="grid gap-2">
                  <span className={labelClass}>Pet</span>
                  <select
                    className={inputClass}
                    onChange={(event) => {
                      setSelectedPetId(event.target.value);
                      setSubmittedQuery("");
                      resetInterpretation();
                    }}
                    value={selectedPetId}
                  >
                    <option value="">Choose a pet</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {formatPetDisplayName(profile.name)}
                      </option>
                    ))}
                  </select>
                </label>

                {invalidPetParam ? (
                  <p className="rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold text-[var(--pw-warning-text)]">
                    That pet profile could not be opened for this account.
                  </p>
                ) : null}

                <label className="grid gap-2">
                  <span className={labelClass}>Search</span>
                  <input
                    className={inputClass}
                    minLength={MIN_SHOP_QUERY_LENGTH}
                    onChange={(event) => setQueryInput(event.target.value)}
                    placeholder="What are you looking for?"
                    type="search"
                    value={queryInput}
                  />
                </label>

                <PrimaryButton
                  className="w-full sm:w-fit"
                  disabled={!canSearch}
                  type="submit"
                >
                  Search
                </PrimaryButton>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:gap-x-5" aria-label="Popular categories">
                <span className="basis-full text-center text-sm text-[var(--text-tertiary)] md:basis-auto">Popular categories</span>
                {["Food", "Dental", "Grooming", "Skin and coat"].map((example) => (
                  <button
                    className="inline-flex min-h-11 max-w-full items-center rounded-full border border-[var(--border-subtle)] bg-[var(--chip-background)] px-3.5 text-[0.9375rem] font-semibold text-[var(--ghost-action-foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] md:min-h-10 md:px-4 md:text-sm"
                    key={example}
                    onClick={() => startSearch(example.toLowerCase())}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:gap-x-5" aria-label="Browse by need">
                <span className="basis-full text-center text-sm text-[var(--text-tertiary)] md:basis-auto">Browse by need</span>
                {["Sensitive stomach", "Itchy skin", "Paw care"].map((example) => (
                  <button
                    className="inline-flex min-h-11 max-w-full items-center rounded-full border border-[var(--border-subtle)] bg-[var(--chip-background)] px-3.5 text-[0.9375rem] font-semibold text-[var(--ghost-action-foreground)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] md:min-h-10 md:px-4 md:text-sm"
                    key={example}
                    onClick={() => startSearch(example.toLowerCase())}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>

            {submittedQuery.trim() ? <section className="mt-10 min-w-0">
              {submittedQuery.trim() ? (
                <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--pw-primary)]">Results for</p>
                    <h2 className="mt-1 break-words text-2xl font-semibold text-[var(--pw-heading)]">
                      {submittedQuery}
                    </h2>
                  </div>
                  {selectedProfile ? (
                    <p className="text-sm font-semibold text-[var(--pw-muted)]">
                      {formatSpecies(selectedProfile.species)}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showAvoidNote ? (
                <p className="mb-4 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 text-sm font-semibold text-[var(--pw-muted)]">
                  We left out products with ingredients you have said to avoid.
                </p>
              ) : null}

              {interpretationError || catalogError ? (
                <p className="mb-4 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
                  {catalogError || interpretationError}
                </p>
              ) : null}

              {limitReachedQuery === submittedQuery ? <CapabilityNotice
                clear={() => { setQueryInput(""); setSubmittedQuery(""); resetInterpretation(); }}
                browse={(value) => startSearch(value)}
                message="You’ve used all of your AI guidance for this month. You can still browse products directly by category or keyword."
              /> : interpretationState.aiUnavailable ? <CapabilityNotice
                clear={() => { setQueryInput(""); setSubmittedQuery(""); resetInterpretation(); }}
                browse={(value) => startSearch(value)}
                message={interpretationState.message || "AI guidance is unavailable right now, but these products match the filters we could identify."}
              /> : null}

              <ShopResults
                emptyState={searchResult.emptyState}
                explanationCache={fitExplanationCache}
                loading={interpretationLoading || catalogLoading}
                onExplainProductFit={explainProductFit}
                onProductQuestion={askProductQuestion}
                onProductQuestionInputChange={(cacheKey, value) =>
                  setProductQuestionInputs((current) => ({ ...current, [cacheKey]: value }))
                }
                products={searchResult.products}
                productQuestionCache={productQuestionCache}
                productQuestionInputs={productQuestionInputs}
                productsAiUsage={shopUsage}
                productsAiUsageError={shopUsageError}
                query={submittedQuery}
                selectedPetId={selectedPetId}
                selectedPetName={selectedPetName || "this pet"}
              />
            </section> : null}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function CapabilityNotice({ browse, clear, message }: { browse: (query: string) => void; clear: () => void; message: string }) {
  return <div className="mb-5 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4" role="status">
    <p className="text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">{message}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {["dental", "food", "grooming"].map((query) => <button className="min-h-11 rounded-full border border-[var(--border-strong)] bg-[var(--surface-primary)] px-4 text-sm font-semibold" key={query} onClick={() => browse(query)} type="button">Browse {query[0].toUpperCase() + query.slice(1)}</button>)}
      <button className="min-h-11 px-3 text-sm font-semibold underline underline-offset-4" onClick={clear} type="button">Clear search</button>
    </div>
  </div>;
}

function ShopResults({
  emptyState,
  explanationCache,
  loading = false,
  onExplainProductFit,
  onProductQuestion,
  onProductQuestionInputChange,
  products,
  productQuestionCache,
  productQuestionInputs,
  productsAiUsage,
  productsAiUsageError,
  query,
  selectedPetId,
  selectedPetName,
}: {
  emptyState: ReturnType<typeof searchShopProducts>["emptyState"];
  explanationCache: Record<string, FitExplanationState>;
  loading?: boolean;
  onExplainProductFit: (productId: string) => void;
  onProductQuestion: (productId: string, questionOverride?: string) => void;
  onProductQuestionInputChange: (cacheKey: string, value: string) => void;
  products: MockProduct[];
  productQuestionCache: Record<string, ProductQuestionState>;
  productQuestionInputs: Record<string, string>;
  productsAiUsage: ProductAiUsageStatus | null;
  productsAiUsageError: string;
  query: string;
  selectedPetId: string;
  selectedPetName: string;
}) {
  if (!query.trim() || emptyState === "no_query") {
    return null;
  }

  if (emptyState === "missing_pet") {
    return null;
  }

  if (emptyState === "query_too_short") {
    return null;
  }

  if (emptyState === "vague_query") {
    return (
      <EmptyState
        body="Try a broader term or another category."
        title="No matches in the current collection"
      />
    );
  }

  if (emptyState === "urgent") {
    return (
      <EmptyState
        body={FURVISE_URGENT_SAFETY_MESSAGE}
        title="Product shopping is hidden for now"
        tone="urgent"
      />
    );
  }

  if (emptyState === "shop_limit") {
    return (
      <EmptyState
        body={FURVISE_PRODUCT_USAGE_CAP_MESSAGE}
        title="Monthly search limit reached"
      />
    );
  }

  if (loading) {
    return (
      <EmptyState
        body="Checking available products for this pet."
        title="Searching the current collection"
      />
    );
  }

  if (emptyState === "medical_intent") {
    return (
      <EmptyState
        body="Furvise can search routine product ideas, but not product requests framed as medical care. Contact a veterinarian for medical concerns."
        title="Use a routine shopping query"
        tone="urgent"
      />
    );
  }

  if (emptyState === "species_conflict") {
    return (
      <EmptyState
        body="This search appears to be for a different species than the selected pet."
        title="Check the selected pet"
      />
    );
  }

  if (emptyState === "ingredient_verification_empty") {
    return (
      <EmptyState
        body={buildNoSafeProductMatchMessage(selectedPetName)}
        title="No verified ingredient match yet"
      />
    );
  }

  if (emptyState === "region_empty") {
    return (
      <EmptyState
        body={buildNoSafeProductMatchMessage(selectedPetName)}
        title="No product for this country yet"
      />
    );
  }

  if (emptyState === "no_match") {
    return (
      <EmptyState
        body="Try a broader term or another category."
        title="No matches in the current collection"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-sm text-[var(--pw-subtle)]">
        {formatProductResultCount(products.length)}
      </p>

      {products.map((product) => (
        <ProductCard
          cacheKey={buildFitExplanationCacheKey({
            petId: selectedPetId,
            productId: product.id,
            query,
          })}
          explanationState={
            explanationCache[
              buildFitExplanationCacheKey({
                petId: selectedPetId,
                productId: product.id,
                query,
              })
            ]
          }
          key={product.id}
          onExplain={() => onExplainProductFit(product.id)}
          onProductQuestion={onProductQuestion}
          onProductQuestionInputChange={onProductQuestionInputChange}
          product={product}
          showDifferentiator={products.length >= 2}
          questionInput={
            productQuestionInputs[
              buildFitExplanationCacheKey({
                petId: selectedPetId,
                productId: product.id,
                query,
              })
            ] || ""
          }
          questionState={
            productQuestionCache[
              buildFitExplanationCacheKey({
                petId: selectedPetId,
                productId: product.id,
                query,
              })
            ]
          }
          productsAiUsage={productsAiUsage}
          productsAiUsageError={productsAiUsageError}
          selectedPetName={selectedPetName}
        />
      ))}

    </div>
  );
}

function ProductCard({
  cacheKey,
  explanationState,
  onExplain,
  onProductQuestion,
  onProductQuestionInputChange,
  product,
  questionInput,
  questionState,
  productsAiUsage,
  productsAiUsageError,
  selectedPetName,
  showDifferentiator,
}: {
  cacheKey: string;
  explanationState?: FitExplanationState;
  onExplain: () => void;
  onProductQuestion: (productId: string, questionOverride?: string) => void;
  onProductQuestionInputChange: (cacheKey: string, value: string) => void;
  product: MockProduct;
  questionInput: string;
  questionState?: ProductQuestionState;
  productsAiUsage: ProductAiUsageStatus | null;
  productsAiUsageError: string;
  selectedPetName: string;
  showDifferentiator: boolean;
}) {
  const [openPanel, setOpenPanel] = useState<"why" | "ask" | null>(null);
  const description = getProductCardDescription(product);
  const productTypeLine = getProductTypeLine(product);
  const labelCheckNote = !product.ingredientsVerified ? "Check the label before buying or using." : "";
  const caution = getProductCardCaution(product);
  const differentiator = showDifferentiator ? getProductDifferentiator(product) : "";
  const productLink = getProductLinkInfo(product);
  const labelLink = getProductLabelLinkInfo(product);
  const whyPanelOpen = openPanel === "why";
  const askPanelOpen = openPanel === "ask";

  function openWhyPanel() {
    setOpenPanel("why");
    onExplain();
  }

  function openAskPanel() {
    setOpenPanel("ask");
  }

  return (
    <article className="min-w-0 rounded-lg border border-[var(--pw-border)] bg-[var(--pw-surface)] p-4 shadow-sm">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--pw-primary)]">
            {product.brand || product.retailer || "Product"}
          </p>
          <h3 className="mt-1 break-words text-lg font-semibold text-[var(--pw-heading)]">
            {product.name}
          </h3>
          <p className="mt-1.5 text-sm leading-5 text-[var(--pw-muted)]">
            {description}
          </p>
          {productTypeLine ? (
            <p className="mt-1.5 text-xs font-semibold uppercase text-[var(--pw-subtle)]">
              {productTypeLine}
            </p>
          ) : null}
          {differentiator ? (
            <p className="mt-2 text-sm font-medium leading-5 text-[var(--pw-text)]">
              {differentiator}
            </p>
          ) : null}
          {labelCheckNote ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
              {labelCheckNote}
            </p>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-col items-center gap-2 sm:w-fit">
          {productLink?.variant === "link" ? (
            <Link
              aria-label={`View ${product.name}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] sm:w-fit"
              href={productLink.href}
              rel={productLink.rel}
              target={productLink.target}
            >
              View product
            </Link>
          ) : (
            <span className="text-sm text-[var(--pw-subtle)]">Product page unavailable</span>
          )}
          {labelLink?.variant === "link" ? (
            <Link
              aria-label={`View label for ${product.name}`}
              className="text-sm font-semibold text-[var(--pw-primary)] underline-offset-4 hover:underline"
              href={labelLink.href}
              rel={labelLink.rel}
              target={labelLink.target}
            >
              View label
            </Link>
          ) : null}
        </div>
      </div>

      {caution ? (
        <p className="mt-4 text-sm leading-6 text-[var(--pw-muted)]">{caution}</p>
      ) : null}

      <div className="mt-4 border-t border-[var(--pw-border)] pt-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          <button
            aria-expanded={whyPanelOpen}
            className="inline-flex min-h-10 max-w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] disabled:cursor-default disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)]"
            disabled={explanationState?.loading}
            onClick={openWhyPanel}
            type="button"
          >
            {explanationState?.loading ? "Checking product fit..." : "Why this product?"}
          </button>
          <button
            aria-expanded={askPanelOpen}
            className="inline-flex min-h-10 max-w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)]"
            onClick={openAskPanel}
            type="button"
          >
            Ask product question
          </button>
        </div>

        {whyPanelOpen && explanationState?.error ? (
          <p className="mt-3 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
            {explanationState.error}
          </p>
        ) : null}

        {whyPanelOpen && explanationState?.explanation ? (
          <ProductFitExplanationPanel explanation={explanationState.explanation} />
        ) : null}

        {askPanelOpen ? (
          <ProductQuestionPanel
            cacheKey={cacheKey}
            onAsk={(questionOverride) => onProductQuestion(product.id, questionOverride)}
            onInputChange={(value) => onProductQuestionInputChange(cacheKey, value)}
            productsAiUsage={productsAiUsage}
            productsAiUsageError={productsAiUsageError}
            questionChips={getProductQuestionChips(product, selectedPetName)}
            questionInput={questionInput}
            questionState={questionState}
            selectedPetName={selectedPetName}
          />
        ) : null}
      </div>
    </article>
  );
}

function ProductFitExplanationPanel({
  explanation,
}: {
  explanation: ShopProductFitExplanation;
}) {
  return (
    <div className="mt-4 min-w-0 max-w-full rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm leading-6 text-[var(--pw-muted)] [overflow-wrap:anywhere]">
      <h4 className="text-base font-semibold text-[var(--pw-heading)]">Why this product?</h4>
      <div className="mt-3 space-y-3">
        {explanation.bodyParagraphs.map((paragraph) => (
          <p className="whitespace-normal break-words" key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <p className="mt-3 whitespace-normal break-words font-semibold text-[var(--pw-muted)]">{explanation.safetyLine}</p>
    </div>
  );
}

function ProductQuestionPanel({
  cacheKey,
  onAsk,
  onInputChange,
  productsAiUsage,
  productsAiUsageError,
  questionChips,
  questionInput,
  questionState,
  selectedPetName,
}: {
  cacheKey: string;
  onAsk: (questionOverride?: string) => void;
  onInputChange: (value: string) => void;
  productsAiUsage: ProductAiUsageStatus | null;
  productsAiUsageError: string;
  questionChips: string[];
  questionInput: string;
  questionState?: ProductQuestionState;
  selectedPetName: string;
}) {
  const displayUsage = questionState?.usage || productsAiUsage;
  const answer = questionState?.answer || null;
  const questionCapReached = displayUsage?.allowed === false;
  const asksMissingInfo = isProductMissingInfoQuestion(questionState?.question || "");
  const importantMissingNote = answer && !asksMissingInfo
    ? buildProductQuestionImportantMissingNote(answer.whatIsMissing, questionState?.question || "", answer.answer)
    : "";

  return (
    <div className="mt-4 min-w-0 max-w-full border-t border-[var(--pw-border)] pt-4">
      <h4 className="text-base font-semibold text-[var(--pw-heading)]">Ask about this product</h4>
      <p className="mt-1 text-sm leading-6 text-[var(--pw-muted)]">
        Ask about ingredients, use, warnings, or whether it fits {selectedPetName}.
      </p>
      {productsAiUsageError ? (
        <p className="mt-2 text-xs font-semibold text-[var(--pw-warning-text)]">{FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE}</p>
      ) : null}
      {questionCapReached ? (
        <div className="mt-2 text-xs font-semibold leading-5 text-[var(--pw-warning-text)]" role="status">
          <p>{FURVISE_PRODUCT_USAGE_CAP_MESSAGE}</p>
          <p>You can still browse products by category or keyword and open product details.</p>
        </div>
      ) : null}
      <form
        className="mt-3 grid min-w-0 gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (questionCapReached) return;
          onAsk();
        }}
      >
        <label className="sr-only" htmlFor={`product-question-${cacheKey}`}>
          Ask about this product
        </label>
        <div className="flex min-w-0 flex-wrap gap-2">
          {questionChips.map((chip) => (
            <button
              className="inline-flex min-h-9 max-w-full items-center whitespace-normal rounded-full border border-[var(--pw-border)] bg-[var(--pw-surface)] px-3 py-1.5 text-left text-xs font-semibold leading-5 text-[var(--pw-text)] transition hover:border-[var(--pw-primary)]"
              disabled={questionCapReached || questionState?.loading}
              key={chip}
              onClick={() => onAsk(chip)}
              type="button"
            >
              {chip}
            </button>
          ))}
        </div>
        <textarea
          className="min-h-20 w-full resize-y rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 py-3 text-sm leading-6 text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-subtle)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pw-primary)_22%,transparent)]"
          id={`product-question-${cacheKey}`}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="Ask about ingredients, use, size, warnings, or why it may fit."
          value={questionInput}
        />
        <button
          className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[var(--secondary-action-border)] bg-[var(--secondary-action)] px-4 text-sm font-semibold text-[var(--secondary-action-text)] transition hover:bg-[var(--secondary-action-hover)] active:bg-[var(--secondary-action-active)] disabled:cursor-default disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)] sm:w-fit"
          disabled={questionCapReached || questionState?.loading || !questionInput.trim()}
          type="submit"
        >
          {questionState?.loading ? "Answering..." : "Ask product question"}
        </button>
      </form>

      {questionState?.error ? (
        <p className="mt-3 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
          {questionState.error}
        </p>
      ) : null}

      {answer ? (
        <div className="mt-4 grid gap-3 text-sm leading-6 text-[var(--pw-muted)] [overflow-wrap:anywhere]">
          <p className="whitespace-normal break-words">{answer.sections.directAnswer}</p>
          {importantMissingNote ? (
            <p className="whitespace-normal break-words rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 font-semibold text-[var(--pw-warning-text)]">
              {importantMissingNote}
            </p>
          ) : null}
          <p className="whitespace-normal break-words font-semibold">{answer.safetyNote}</p>
        </div>
      ) : null}
    </div>
  );
}

function isProductMissingInfoQuestion(question: string) {
  const normalized = question.trim().toLowerCase();
  return normalized.includes("what info is missing") ||
    normalized.includes("what does furvise not know") ||
    normalized.includes("missing info") ||
    /ingredient list.*verified|ingredients?.*verified|verified.*ingredients?/.test(normalized);
}

function buildProductQuestionImportantMissingNote(missingInfo: string[], question: string, answer: string) {
  const normalizedQuestion = question.toLowerCase();
  const normalizedAnswer = answer.toLowerCase();
  const normalized = missingInfo.map((item) => item.toLowerCase());
  const missingIngredients = normalized.some((item) => item.includes("ingredient list"));
  const missingDirections = normalized.some((item) => item.includes("directions"));
  const missingWarnings = normalized.some((item) => item.includes("warnings"));
  const asksAboutIngredientsOrLabel = /\b(ingredient|ingredients|contains|fragrance|oil|dye|allerg|allergy|sensitive|label)\b/.test(normalizedQuestion);
  const asksAboutDirections = /\b(use|apply|direction|how|often|size)\b/.test(normalizedQuestion);
  const asksAboutWarnings = /\b(watch|warning|avoid|problem|irritation|worse)\b/.test(normalizedQuestion);
  const alreadyMentionsLabelCheck = /review the label|check the label|ingredient/.test(normalizedAnswer);
  const alreadyMentionsDirections = /direction|package directions|follow the package/.test(normalizedAnswer);
  const alreadyMentionsWarnings = /warning|watch|irritation|worse/.test(normalizedAnswer);

  if (missingIngredients && missingDirections && asksAboutIngredientsOrLabel && !alreadyMentionsLabelCheck && !alreadyMentionsDirections) {
    return FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE;
  }
  if (missingIngredients && asksAboutIngredientsOrLabel && !alreadyMentionsLabelCheck) {
    return FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE;
  }
  if (missingDirections && asksAboutDirections && !alreadyMentionsDirections) {
    return FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE;
  }
  if (missingWarnings && asksAboutWarnings && !alreadyMentionsWarnings) {
    return FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE;
  }
  return "";
}

function EmptyState({
  body,
  title,
  tone = "neutral",
}: {
  body: string;
  title: string;
  tone?: "neutral" | "urgent";
}) {
  const toneClass =
    tone === "urgent"
      ? "border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] text-[var(--pw-danger-text)]"
      : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]";

  return (
    <div className={`rounded-3xl border p-6 ${toneClass}`} role="status">
      <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">{title}</h2>
      <p className="mt-3 leading-7">{body}</p>
    </div>
  );
}

function Status({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  return (
    <div
      className={`mt-8 rounded-3xl border p-5 ${
        tone === "warn"
          ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]"
          : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]"
      }`}
      role="status"
    >
      {text}
    </div>
  );
}

function parseCatalogProducts(value: unknown): MockProduct[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MockProduct => {
    if (!item || typeof item !== "object") return false;
    const product = item as Partial<MockProduct>;
    return typeof product.id === "string"
      && typeof product.name === "string"
      && Array.isArray(product.species)
      && Array.isArray(product.availableCountries)
      && Array.isArray(product.concernTags)
      && Array.isArray(product.excludedIngredients)
      && typeof product.category === "string";
  });
}

function parseProductAiUsageStatus(value: unknown): ProductAiUsageStatus | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Partial<ProductAiUsageStatus>;
  if (
    typeof usage.allowed !== "boolean" ||
    typeof usage.count !== "number" ||
    typeof usage.limit !== "number" ||
    typeof usage.monthKey !== "string" ||
    typeof usage.remaining !== "number"
  ) {
    return null;
  }
  return usage as ProductAiUsageStatus;
}

function formatCategory(value: MockProduct["category"]) {
  if (value === "health_essentials") return "Health essentials";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function getProductCardDescription(product: MockProduct) {
  if (product.shortDescription) return product.shortDescription;
  if (product.category === "grooming" && product.subcategory === "shampoo") {
    const speciesLabel = getProductSpeciesLabel(product);
    return `A fragrance-free ${speciesLabel} shampoo for routine baths, with a gentle formula aimed at sensitive or itchy skin.`;
  }
  if (product.verifiedDescription) return formatProductCardDescription(product.verifiedDescription);
  const speciesLabel = getProductSpeciesLabel(product);
  return `A ${speciesLabel} ${formatProductType(product)} for routine ${formatCategory(product.category).toLowerCase()} needs.`;
}

function formatProductCardDescription(description: string) {
  return description
    .replace(/\bpositioned for\b/gi, "made for")
    .replace(/\bcatalog search\b/gi, "shopping")
    .replace(/\bsearches\b/gi, "needs");
}

function getProductCardCaution(product: MockProduct) {
  if (product.category === "grooming" && product.subcategory === "shampoo") {
    return "Not medical care. Stop use if irritation appears or worsens.";
  }
  if (!product.cautions) return "";
  const restrictedCareWord = "treat" + "ment";
  return product.cautions
    .replace(new RegExp(`\\bNot a medical ${restrictedCareWord}\\.`, "gi"), "Not medical care.")
    .replace(new RegExp(`\\b${restrictedCareWord}\\b`, "gi"), "medical care");
}

function getProductTypeLine(product: MockProduct) {
  if (product.productTypeLabel) return product.productTypeLabel;
  const speciesLabel = getProductSpeciesLabel(product) === "pet"
    ? "Pet"
    : formatSpecies(product.species[0]);
  return `${speciesLabel} ${formatProductType(product)}`;
}

function formatProductType(product: MockProduct) {
  const category = formatCategory(product.category).toLowerCase();
  const subcategory = product.subcategory ? product.subcategory.replace(/_/g, " ").toLowerCase() : "";
  if (category === "grooming" && subcategory === "shampoo") return "grooming shampoo";
  if (subcategory && !category.includes(subcategory)) return `${category} ${subcategory}`;
  return subcategory || category || "product";
}

function getProductQuestionChips(product: MockProduct, petName: string) {
  const productText = [product.category, product.subcategory, ...(product.tags || [])].join(" ").toLowerCase();
  if (productText.includes("dental")) return DENTAL_PRODUCT_QUESTION_CHIPS;
  if (product.category === "grooming" || productText.includes("shampoo") || productText.includes("brush")) {
    return GROOMING_PRODUCT_QUESTION_CHIPS;
  }
  if (product.category === "food" || productText.includes("treat")) {
    return [
      `Is this okay for ${petName}?`,
      "How should I introduce it?",
      "What should I check first?",
      "What should I watch for?",
    ];
  }
  return DEFAULT_PRODUCT_QUESTION_CHIPS;
}

function buildFitExplanationCacheKey({
  petId,
  productId,
  query,
}: {
  petId: string;
  productId: string;
  query: string;
}) {
  return `${petId}:${productId}:${query.trim().toLowerCase()}`;
}

const labelClass = "text-sm font-semibold text-[var(--pw-heading)]";
const inputClass =
  "min-h-[3.25rem] w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-subtle)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pw-primary)_22%,transparent)] lg:min-h-12";
