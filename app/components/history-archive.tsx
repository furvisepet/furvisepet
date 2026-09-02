"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "./app-page";
import { Notice } from "./product-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  CARE_ENTRY_CATEGORIES,
  formatCareEntryCategory,
} from "../lib/care-log.mjs";
import {
  formatHistoryTimestamp,
  getHistoryFromInstant,
  HISTORY_PAGE_SIZE,
  isHistoryWhenFilter,
  normalizeHistorySearch,
  type HistoryWhenFilter,
} from "../lib/history-archive";
import { useAppDataVersion } from "../lib/navigation/app-data-freshness";
import { formatPetDisplayName } from "../lib/petwise";
import {
  hasAnyHistoryArchiveEntries,
  listHistoryArchivePets,
  queryHistoryArchive,
  type CareEntryWithPetName,
  type HistoryArchivePet,
} from "../lib/supabase";

const controlClass = "min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-interactive)] px-3.5 text-base text-[var(--text-primary)] focus-visible:border-[var(--forest)] focus-visible:outline-none";

export function HistoryArchive() {
  const searchParams = useSearchParams();
  const appDataVersion = useAppDataVersion();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const initialWhen = searchParams.get("when") || "all";
  const initialCategory = searchParams.get("category") || "all";
  const [search, setSearch] = useState(() => normalizeHistorySearch(searchParams.get("q") || ""));
  const [selectedPet, setSelectedPet] = useState(searchParams.get("pet") || "all");
  const [selectedCategory, setSelectedCategory] = useState(CARE_ENTRY_CATEGORIES.includes(initialCategory) ? initialCategory : "all");
  const [selectedWhen, setSelectedWhen] = useState<HistoryWhenFilter>(isHistoryWhenFilter(initialWhen) ? initialWhen : "all");
  const deferredSearch = useDeferredValue(search);
  const [pets, setPets] = useState<HistoryArchivePet[]>([]);
  const [entries, setEntries] = useState<CareEntryWithPetName[]>([]);
  const [hasAnyHistory, setHasAnyHistory] = useState<boolean | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [activeEntry, setActiveEntry] = useState<CareEntryWithPetName | null>(null);
  const requestId = useRef(0);
  const filterUrlInitialized = useRef(false);

  const filters = useMemo(() => ({
    category: selectedCategory === "all" ? "" : selectedCategory,
    from: getHistoryFromInstant(selectedWhen),
    petId: selectedPet === "all" ? "" : selectedPet,
    search: normalizeHistorySearch(deferredSearch),
  }), [deferredSearch, selectedCategory, selectedPet, selectedWhen]);
  const filtersActive = Boolean(filters.category || filters.from || filters.petId || filters.search);
  const queriedEntry = entries.find((candidate) => candidate.id === searchParams.get("entry")) || null;
  const displayedEntry = activeEntry || queriedEntry;

  useEffect(() => {
    if (authStatus !== "signedIn" || !user) return;
    let active = true;
    Promise.all([listHistoryArchivePets(), hasAnyHistoryArchiveEntries()])
      .then(([petRows, anyHistory]) => {
        if (!active) return;
        setPets(petRows);
        setHasAnyHistory(anyHistory);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load History.");
      });
    return () => { active = false; };
  }, [appDataVersion, authStatus, user]);

  useEffect(() => {
    if (authStatus !== "signedIn" || !user) return;
    const currentRequest = ++requestId.current;
    queryHistoryArchive({ ...filters, limit: HISTORY_PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (requestId.current !== currentRequest) return;
        setError("");
        setEntries(page.entries);
        setHasMore(page.hasMore);
        setNextOffset(page.nextOffset);
        if (page.entries.length) setHasAnyHistory(true);
      })
      .catch((loadError) => {
        if (requestId.current === currentRequest) setError(loadError instanceof Error ? loadError.message : "Furvise could not load History.");
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [appDataVersion, authStatus, filters, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrDelete(params, "q", normalizeHistorySearch(search));
    setOrDelete(params, "pet", selectedPet === "all" ? "" : selectedPet);
    setOrDelete(params, "category", selectedCategory === "all" ? "" : selectedCategory);
    setOrDelete(params, "when", selectedWhen === "all" ? "" : selectedWhen);
    if (filterUrlInitialized.current) params.delete("entry");
    else filterUrlInitialized.current = true;
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/history?${query}` : "/history");
  }, [search, selectedCategory, selectedPet, selectedWhen]);

  useEffect(() => {
    if (!displayedEntry) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveEntry(null);
      const params = new URLSearchParams(window.location.search);
      params.delete("entry");
      const query = params.toString();
      window.history.replaceState(null, "", query ? `/history?${query}` : "/history");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [displayedEntry]);

  async function loadOlder() {
    if (loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setError("");
    try {
      const page = await queryHistoryArchive({ ...filters, limit: HISTORY_PAGE_SIZE, offset: nextOffset });
      setEntries((current) => [...current, ...page.entries.filter((entry) => !current.some((item) => item.id === entry.id))]);
      setHasMore(page.hasMore);
      setNextOffset(page.nextOffset);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Furvise could not load older History.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setSelectedPet("all");
    setSelectedCategory("all");
    setSelectedWhen("all");
  }

  function openEntry(entry: CareEntryWithPetName) {
    setActiveEntry(entry);
    const params = new URLSearchParams(window.location.search);
    params.set("entry", entry.id);
    window.history.replaceState(null, "", `/history?${params.toString()}`);
  }

  function closeEntry() {
    setActiveEntry(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("entry");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/history?${query}` : "/history");
  }

  return (
    <AppPage layout="workspace" shell="wide">
      <div className="w-full" data-ui="history-archive">
        <header>
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-[var(--text-primary)] sm:text-5xl">HISTORY</h1>
          <p className="mt-3 text-base leading-7 text-[var(--text-secondary)] sm:text-lg">Find anything you&apos;ve saved about your pets.</p>
        </header>

        {error ? <div className="mt-8"><Notice tone="warning">{error}</Notice></div> : null}

        {hasAnyHistory ? (
          <section aria-label="Search and filter History" className="mt-10 border-y border-[var(--line)] py-6">
            <label>
              <span className="sr-only">Search history</span>
              <input className={`${controlClass} text-lg`} onChange={(event) => setSearch(event.target.value)} placeholder="Search history..." type="search" value={search} />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <HistorySelect label="PET" onChange={setSelectedPet} value={selectedPet}>
                <option value="all">All pets</option>
                {pets.map((pet) => <option key={pet.id} value={pet.id}>{formatPetDisplayName(pet.name)}</option>)}
              </HistorySelect>
              <HistorySelect label="CATEGORY" onChange={setSelectedCategory} value={selectedCategory}>
                <option value="all">All categories</option>
                {CARE_ENTRY_CATEGORIES.map((category) => <option key={category} value={category}>{formatCareEntryCategory(category)}</option>)}
              </HistorySelect>
              <HistorySelect label="WHEN" onChange={(value) => setSelectedWhen(isHistoryWhenFilter(value) ? value : "all")} value={selectedWhen}>
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="year">This year</option>
              </HistorySelect>
            </div>
          </section>
        ) : null}

        {loading && !entries.length ? <p className="mt-10 text-sm text-[var(--text-secondary)]" role="status">Loading History...</p> : null}
        {!loading && hasAnyHistory === false ? <HistoryEmpty /> : null}
        {!loading && hasAnyHistory && !entries.length ? (
          <section className="mt-12" data-ui="history-no-results">
            <p className="text-xl font-semibold text-[var(--text-primary)]">Nothing matches that search.</p>
            {filtersActive ? <button className="mt-4 min-h-11 text-sm font-semibold text-[var(--forest)] underline decoration-[var(--border-default)] underline-offset-4" onClick={clearFilters} type="button">Clear filters</button> : null}
          </section>
        ) : null}
        {entries.length ? <HistoryResults entries={entries} onOpen={openEntry} /> : null}
        {hasMore ? <button className="mt-8 min-h-11 rounded-[var(--radius-sm)] border border-[var(--forest)] px-5 text-sm font-semibold text-[var(--forest)]" disabled={loadingOlder} onClick={() => void loadOlder()} type="button">{loadingOlder ? "LOADING..." : "LOAD OLDER"}</button> : null}
      </div>

      {displayedEntry ? (
        <div className="fixed inset-0 z-[var(--z-dialog)] flex items-end justify-center bg-[var(--pw-overlay)] sm:items-center sm:p-5" role="presentation">
          <section aria-labelledby="history-entry-title" aria-modal="true" className="w-full border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-6 shadow-[var(--shadow-floating)] sm:max-w-xl sm:rounded-[var(--radius-md)]" role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">{formatHistoryTimestamp(displayedEntry.occurred_at)} · {formatPetDisplayName(displayedEntry.pet_name)} · {formatCareEntryCategory(displayedEntry.category)}</p>
                <h2 className="sr-only" id="history-entry-title">History entry details</h2>
              </div>
              <button aria-label="Close history entry" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] text-xl" onClick={closeEntry} type="button">×</button>
            </div>
            <p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-[var(--text-primary)]">{displayedEntry.note}</p>
          </section>
        </div>
      ) : null}
    </AppPage>
  );
}

function HistorySelect({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label><span className="mb-2 block text-xs font-semibold tracking-[0.08em] text-[var(--text-secondary)]">{label}</span><select className={controlClass} onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function HistoryResults({ entries, onOpen }: { entries: CareEntryWithPetName[]; onOpen: (entry: CareEntryWithPetName) => void }) {
  return (
    <section aria-labelledby="history-results-title" className="mt-12">
      <h2 className="sr-only" id="history-results-title">History results</h2>
      <div className="hidden md:block" data-ui="history-desktop-results">
        <div aria-hidden="true" className="grid grid-cols-[12rem_10rem_minmax(0,1fr)_9rem] gap-5 border-b border-[var(--line)] pb-3 text-xs font-semibold tracking-[0.08em] text-[var(--text-secondary)]">
          <span>WHEN</span><span>PET</span><span>WHAT HAPPENED</span><span>CATEGORY</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {entries.map((entry) => <button className="grid min-h-20 w-full grid-cols-[12rem_10rem_minmax(0,1fr)_9rem] items-center gap-5 py-4 text-left hover:bg-[var(--surface-hover)]" key={entry.id} onClick={() => onOpen(entry)} type="button"><span className="text-sm text-[var(--text-secondary)]">{formatHistoryTimestamp(entry.occurred_at)}</span><span className="truncate text-sm text-[var(--text-secondary)]">{formatPetDisplayName(entry.pet_name)}</span><span className="min-w-0 break-words text-base font-medium leading-6 text-[var(--text-primary)]">{entry.note}</span><span className="text-sm text-[var(--text-secondary)]">{formatCareEntryCategory(entry.category)}</span></button>)}
        </div>
      </div>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)] md:hidden" data-ui="history-mobile-results">
        {entries.map((entry) => <button className="block min-h-20 w-full py-5 text-left" key={entry.id} onClick={() => onOpen(entry)} type="button"><span className="block text-sm leading-6 text-[var(--text-secondary)]">{formatHistoryTimestamp(entry.occurred_at)} · {formatPetDisplayName(entry.pet_name)} · {formatCareEntryCategory(entry.category)}</span><span className="mt-1 block break-words text-base font-medium leading-7 text-[var(--text-primary)]">{entry.note}</span></button>)}
      </div>
    </section>
  );
}

function HistoryEmpty() {
  return <section className="mt-12" data-ui="history-empty"><h2 className="text-2xl font-semibold text-[var(--text-primary)]">No history yet.</h2><p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">Things you save in Today will appear here.</p></section>;
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}
