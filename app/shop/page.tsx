"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "../components/app-page";
import type { ShopSearchUsageStatus } from "../lib/billing/shop-usage";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { readStoredGuidanceSnapshot } from "../lib/stored-guidance";
import {
  formatPetDisplayName,
  formatSpecies,
} from "../lib/petwise";
import type { MockProduct, ProductCountry } from "../lib/petwise";
import {
  getActiveProductCountry,
  getDisplayProductPriceLabel,
} from "../lib/product-providers";
import {
  MIN_SHOP_QUERY_LENGTH,
  searchStaticRealShopProducts,
  shouldHideShopProductsForUrgentCare,
} from "../lib/shop";
import {
  parseShopQueryInterpretation,
  type ShopQueryInterpretation,
} from "../lib/shop-query";
import {
  parseShopProductFitExplanation,
  type ShopProductFitExplanation,
} from "../lib/shop/product-fit-explanation";
import {
  dogProfileRowToDraft,
  detectAccountProductCountry,
  getCurrentAccessToken,
  getSupabaseConfigError,
  listCareEntriesForPet,
  loadDogProfilesWithMemories,
  loadUserProfileForUser,
  type CareEntryRow,
  type DogProfileWithMemories,
} from "../lib/supabase";

const SHOP_QUERY_EXAMPLES = [
  "shampoo",
  "dental treats",
  "sensitive skin shampoo",
  "chicken-free food",
  "grooming wipes",
  "flea comb",
];

type LoadState = "loading" | "ready" | "error";
type InterpretationState = {
  error: string;
  fallback: boolean;
  interpretation: ShopQueryInterpretation | null;
  loading: boolean;
  petId: string;
  query: string;
};
type FitExplanationState = {
  error: string;
  explanation: ShopProductFitExplanation | null;
  fallback: boolean;
  loading: boolean;
};

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
    error: "",
    fallback: false,
    interpretation: null,
    loading: false,
    petId: "",
    query: "",
  });
  const [shopUsage, setShopUsage] = useState<ShopSearchUsageStatus | null>(null);
  const [shopUsageError, setShopUsageError] = useState("");
  const [limitReachedQuery, setLimitReachedQuery] = useState("");
  const [fitExplanationCache, setFitExplanationCache] = useState<Record<string, FitExplanationState>>({});
  const [productCountry, setProductCountry] = useState<ProductCountry>("US");
  const [careEntryState, setCareEntryState] = useState<{ entries: CareEntryRow[]; petId: string }>({
    entries: [],
    petId: "",
  });
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
        setError(loadError instanceof Error ? loadError.message : "Furvise could not load Shop.");
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
          throw new Error(typeof payload?.error === "string" ? payload.error : "Furvise could not load Shop search usage.");
        }
        if (active) {
          setShopUsage(parseShopSearchUsageStatus(payload?.usage));
          setShopUsageError("");
        }
      } catch (usageError) {
        if (active) {
          setShopUsageError(usageError instanceof Error ? usageError.message : "Furvise could not load Shop search usage.");
        }
      }
    }

    void loadShopUsage();
    return () => {
      active = false;
    };
  }, [authStatus, configError]);

  useEffect(() => {
    if (authStatus !== "signedIn" || !selectedPetId) {
      return;
    }

    let active = true;
    listCareEntriesForPet(selectedPetId)
      .then((entries) => {
        if (active) setCareEntryState({ entries, petId: selectedPetId });
      })
      .catch(() => {
        if (active) setCareEntryState({ entries: [], petId: selectedPetId });
      });

    return () => {
      active = false;
    };
  }, [authStatus, selectedPetId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedPetId) || null,
    [profiles, selectedPetId],
  );
  const selectedPetName = selectedProfile ? formatPetDisplayName(selectedProfile.name) : "";
  const selectedDraft = selectedProfile ? dogProfileRowToDraft(selectedProfile) : null;
  const careEntries = careEntryState.petId === selectedPetId ? careEntryState.entries : [];
  const storedGuidance = useMemo(() => readStoredGuidanceSnapshot(), []);
  const guidance =
    storedGuidance.profileId === selectedPetId && storedGuidance.result?.status === "available"
      ? storedGuidance.result.analysis
      : null;
  const urgentShopHidden = shouldHideShopProductsForUrgentCare({
    entries: careEntries,
    guidance,
  });
  const interpretationMatches =
    interpretationState.petId === selectedPetId && interpretationState.query === submittedQuery;
  const activeInterpretation = interpretationMatches ? interpretationState.interpretation : null;
  const interpretationLoading = interpretationMatches && interpretationState.loading;
  const interpretationError = interpretationMatches ? interpretationState.error : "";
  const searchResult = useMemo(
    () =>
      limitReachedQuery && limitReachedQuery === submittedQuery
        ? {
            avoidIngredientsRemovedMatches: false,
            emptyState: "shop_limit" as const,
            ingredientVerificationRemovedMatches: false,
            products: [],
          }
        : (urgentShopHidden || activeInterpretation?.safetyFlags.urgentCare) && submittedQuery.trim()
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
          : searchStaticRealShopProducts({
            interpretation: activeInterpretation,
            productCountry,
            profile: selectedDraft,
            query: submittedQuery,
          }),
    [activeInterpretation, limitReachedQuery, productCountry, selectedDraft, submittedQuery, urgentShopHidden],
  );
  const showAvoidNote = !interpretationLoading && searchResult.avoidIngredientsRemovedMatches;
  const canSearch = queryInput.trim().length >= MIN_SHOP_QUERY_LENGTH && Boolean(selectedPetId);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = queryInput.trim();
    if (nextQuery.length < MIN_SHOP_QUERY_LENGTH || !selectedPetId) return;
    setSubmittedQuery(nextQuery);
    setLimitReachedQuery("");
    setFitExplanationCache({});
    void interpretSubmittedQuery({
      petId: selectedPetId,
      productCountry,
      query: nextQuery,
    });
  }

  function resetInterpretation() {
    setInterpretationState({
      error: "",
      fallback: false,
      interpretation: null,
      loading: false,
      petId: "",
      query: "",
    });
    setLimitReachedQuery("");
    setFitExplanationCache({});
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
        throw new Error(typeof payload?.error === "string" ? payload.error : "Furvise could not check this product.");
      }

      const explanation = parseShopProductFitExplanation(payload?.explanation, selectedPetName || "this pet");
      if (!explanation) throw new Error("Furvise could not check this product.");

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
          error: fitError instanceof Error ? fitError.message : "Furvise could not check this product.",
          explanation: null,
          fallback: true,
          loading: false,
        },
      }));
    }
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
      error: "",
      fallback: false,
      interpretation: null,
      loading: true,
      petId,
      query,
    });

    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error("Please sign in again before searching Shop.");

      const response = await fetch("/api/shop/interpret-query", {
        body: JSON.stringify({ petId, productCountry: country, query }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        cached?: unknown;
        error?: unknown;
        fallback?: unknown;
        interpretation?: unknown;
        limitReached?: unknown;
        usage?: unknown;
      } | null;
      const usage = parseShopSearchUsageStatus(payload?.usage);
      if (usage) setShopUsage(usage);
      if (!response.ok) {
        if (response.status === 402 || payload?.limitReached === true) {
          setLimitReachedQuery(query);
        }
        throw new Error(typeof payload?.error === "string" ? payload.error : "Furvise could not interpret this search.");
      }

      const interpretation = parseShopQueryInterpretation(payload?.interpretation);
      if (!interpretation) throw new Error("Furvise could not interpret this search.");

      setInterpretationState({
        error: "",
        fallback: payload?.fallback === true,
        interpretation,
        loading: false,
        petId,
        query,
      });
      setLimitReachedQuery("");
    } catch (interpretError) {
      setInterpretationState({
        error: interpretError instanceof Error ? interpretError.message : "Furvise could not interpret this search.",
        fallback: true,
        interpretation: null,
        loading: false,
        petId,
        query,
      });
    }
  }

  return (
    <AppPage>
      <div className="min-w-0 overflow-x-hidden">
        <header className="w-full max-w-[calc(100vw-2.5rem)] min-w-0 sm:max-w-3xl">
          <h1 className="break-words text-4xl font-semibold text-[var(--pw-heading)] sm:text-5xl">Shop carefully</h1>
          <p className="mt-3 max-w-full whitespace-normal break-words text-lg leading-7 text-[var(--pw-muted)]">
            Search product ideas using your pet&apos;s saved context. Furvise filters by species, region, and saved avoid ingredients when available.
          </p>
        </header>

        {state === "loading" ? <Status text="Loading Shop..." /> : null}
        {state === "error" ? <Status text={error || "Furvise could not load Shop."} tone="warn" /> : null}

        {state === "ready" ? (
          <div className="mt-7 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <section className="min-w-0 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm sm:p-6">
              <form className="grid min-w-0 gap-4" onSubmit={submitSearch}>
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
                    placeholder="What are you shopping for?"
                    type="search"
                    value={queryInput}
                  />
                </label>

                <button
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] disabled:cursor-default disabled:bg-[var(--pw-secondary)] sm:w-fit"
                  disabled={!canSearch}
                  type="submit"
                >
                  Search
                </button>

                <ShopUsageCounter error={shopUsageError} usage={shopUsage} />
              </form>

              <div className="mt-5 flex flex-wrap gap-2" aria-label="Search examples">
                {SHOP_QUERY_EXAMPLES.map((example) => (
                  <button
                    className="inline-flex min-h-10 max-w-full items-center rounded-full border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-3 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)]"
                    key={example}
                    onClick={() => setQueryInput(example)}
                    type="button"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-[var(--pw-card-muted)] p-4 text-sm leading-6 text-[var(--pw-muted)]">
                {selectedProfile ? (
                  <p>
                    Search carefully using {selectedPetName}&apos;s saved context. Product country: {productCountry === "US" ? "United States" : "Canada"}.
                  </p>
                ) : (
                  <p>Choose a pet before searching so Furvise can check species and saved avoid ingredients.</p>
                )}
              </div>
            </section>

            <section className="min-w-0">
              {submittedQuery.trim() ? (
                <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--pw-primary)]">Catalog search</p>
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
                  Some matches may be hidden because of saved avoid ingredients.
                </p>
              ) : null}

              {interpretationError ? (
                <p className="mb-4 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
                  Furvise could not interpret this search right now, so it is searching the catalog using the typed query.
                </p>
              ) : null}

              <ShopResults
                emptyState={searchResult.emptyState}
                explanationCache={fitExplanationCache}
                loading={interpretationLoading}
                onExplainProductFit={explainProductFit}
                products={searchResult.products}
                query={submittedQuery}
                selectedPetId={selectedPetId}
              />
            </section>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function ShopResults({
  emptyState,
  explanationCache,
  loading = false,
  onExplainProductFit,
  products,
  query,
  selectedPetId,
}: {
  emptyState: ReturnType<typeof searchStaticRealShopProducts>["emptyState"];
  explanationCache: Record<string, FitExplanationState>;
  loading?: boolean;
  onExplainProductFit: (productId: string) => void;
  products: MockProduct[];
  query: string;
  selectedPetId: string;
}) {
  if (!query.trim() || emptyState === "no_query") {
    return (
      <EmptyState
        body="Choose a pet and search for something specific, like shampoo, dental treats, or chicken-free food."
        title="What are you shopping for?"
      />
    );
  }

  if (emptyState === "missing_pet") {
    return (
      <EmptyState
        body="Choose a pet and search for something specific, like shampoo, dental treats, or chicken-free food."
        title="What are you shopping for?"
      />
    );
  }

  if (emptyState === "query_too_short") {
    return (
      <EmptyState
        body={`Use at least ${MIN_SHOP_QUERY_LENGTH} characters so Furvise can search the curated catalog carefully.`}
        title="What are you shopping for?"
      />
    );
  }

  if (emptyState === "urgent") {
    return (
      <EmptyState
        body="This pet has urgent care signs. Contact a veterinarian or emergency clinic before shopping for products."
        title="Product shopping is hidden for now"
        tone="urgent"
      />
    );
  }

  if (emptyState === "shop_limit") {
    return (
      <EmptyState
        body="You've used your included Shop searches for this month. You can still view saved pets and care history."
        title="Monthly Shop search limit reached"
      />
    );
  }

  if (loading) {
    return (
      <EmptyState
        body="Furvise is interpreting the shopping query before searching the curated catalog."
        title="Reading search"
      />
    );
  }

  if (emptyState === "medical_intent") {
    return (
      <EmptyState
        body="Furvise can search routine product ideas, but not product requests framed as treatment or cure. Contact a veterinarian for medical concerns."
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
        body="Furvise does not have an ingredient-verified catalog match for that search and your saved avoid ingredients right now."
        title="No ingredient-verified match yet"
      />
    );
  }

  if (emptyState === "region_empty") {
    return (
      <EmptyState
        body="Furvise does not have a catalog match available for your product country right now. You can change product country in Account settings."
        title="No region-verified match yet"
      />
    );
  }

  if (emptyState === "no_match") {
    return (
      <EmptyState
        body="Furvise does not have a safe catalog match for that search, pet context, and region right now."
        title="No careful match yet"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-4">
      {products.map((product) => (
        <ProductCard
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
          product={product}
        />
      ))}
    </div>
  );
}

function ProductCard({
  explanationState,
  onExplain,
  product,
}: {
  explanationState?: FitExplanationState;
  onExplain: () => void;
  product: MockProduct;
}) {
  const priceLabel = getDisplayProductPriceLabel(product);

  return (
    <article className="min-w-0 rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 shadow-sm">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--pw-primary)]">
            {product.brand || "Curated product"}
          </p>
          <h3 className="mt-1 break-words text-xl font-semibold text-[var(--pw-heading)]">
            {product.name}
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--pw-muted)]">
            {formatCategory(product.category)} catalog match from {product.retailer || product.brand || "curated catalog"}.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] sm:w-fit"
          href={product.productUrl || "#"}
          rel="noopener noreferrer"
          target="_blank"
        >
          View product
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill label="Curated product" />
        <Pill label="Region-verified catalog match" />
        <Pill label="Matches species and search" />
        <Pill label={product.ingredientsVerified ? "Ingredients verified" : "Ingredients not fully verified"} />
        <Pill label={priceLabel === "Not provided" ? "Price not provided" : `Price ${priceLabel}`} />
      </div>

      {!product.ingredientsVerified ? (
        <p className="mt-4 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
          Ingredient details are not fully verified.
        </p>
      ) : null}

      {product.cautions ? (
        <p className="mt-4 text-sm leading-6 text-[var(--pw-muted)]">{product.cautions}</p>
      ) : null}

      <div className="mt-5 border-t border-[var(--pw-border)] pt-4">
        <button
          className="inline-flex min-h-10 max-w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] disabled:cursor-default disabled:opacity-70"
          disabled={explanationState?.loading}
          onClick={onExplain}
          type="button"
        >
          {explanationState?.loading ? "Checking saved context..." : "Why this may fit"}
        </button>

        {explanationState?.error ? (
          <p className="mt-3 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-3 text-sm font-semibold leading-6 text-[var(--pw-warning-text)]">
            {explanationState.error}
          </p>
        ) : null}

        {explanationState?.explanation ? (
          <ProductFitExplanationPanel explanation={explanationState.explanation} />
        ) : null}
      </div>
    </article>
  );
}

function ProductFitExplanationPanel({ explanation }: { explanation: ShopProductFitExplanation }) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm leading-6 text-[var(--pw-muted)]">
      <p className="font-semibold text-[var(--pw-heading)]">{explanation.summary}</p>
      <ExplanationList heading="Saved context matched" items={explanation.matchedSavedFacts} />
      <ExplanationList heading="Product signals Furvise used" items={explanation.productSignalsUsed} />
      <ExplanationList heading="Cautions" items={explanation.cautions} />
      <p className="mt-3 font-semibold text-[var(--pw-muted)]">{explanation.safetyLine}</p>
    </div>
  );
}

function ExplanationList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="font-semibold text-[var(--pw-heading)]">{heading}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
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

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-8 max-w-full items-center rounded-full bg-[var(--pw-card-muted)] px-3 text-xs font-semibold text-[var(--pw-muted)]">
      {label}
    </span>
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

function ShopUsageCounter({
  error,
  usage,
}: {
  error: string;
  usage: ShopSearchUsageStatus | null;
}) {
  if (error) {
    return (
      <p className="text-sm font-semibold text-[var(--pw-warning-text)]">
        Shop search usage could not be loaded.
      </p>
    );
  }
  if (!usage) {
    return <p className="text-sm font-semibold text-[var(--pw-muted)]">Loading Shop search usage...</p>;
  }
  return (
    <div className="rounded-2xl bg-[var(--pw-card-muted)] p-3 text-sm leading-6 text-[var(--pw-muted)]" role="status">
      <p className="font-semibold text-[var(--pw-heading)]">
        Shop searches: {usage.count} / {usage.limit} used this month
      </p>
      <p>{usage.remaining} remaining</p>
    </div>
  );
}

function parseShopSearchUsageStatus(value: unknown): ShopSearchUsageStatus | null {
  if (!value || typeof value !== "object") return null;
  const usage = value as Partial<ShopSearchUsageStatus>;
  if (
    typeof usage.allowed !== "boolean" ||
    typeof usage.count !== "number" ||
    typeof usage.limit !== "number" ||
    typeof usage.monthKey !== "string" ||
    typeof usage.remaining !== "number"
  ) {
    return null;
  }
  return usage as ShopSearchUsageStatus;
}

function formatCategory(value: MockProduct["category"]) {
  if (value === "health_essentials") return "Health essentials";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
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
  "min-h-12 w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 text-base text-[var(--pw-text)] outline-none transition placeholder:text-[var(--pw-subtle)] focus:border-[var(--pw-primary)] focus:bg-[var(--pw-surface-elevated)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--pw-primary)_22%,transparent)]";
