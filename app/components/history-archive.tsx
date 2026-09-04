"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppPage } from "./app-page";
import { LoadingState, Notice, PageHeader } from "./product-primitives";
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
import { markAppDataChanged, useAppDataVersion } from "../lib/navigation/app-data-freshness";
import { formatPetDisplayName } from "../lib/petwise";
import {
  hasAnyHistoryArchiveEntries,
  listHistoryArchivePets,
  queryHistoryArchive,
  removeCareEntryFromHistory,
  type CareEntryWithPetName,
  type HistoryArchivePet,
} from "../lib/supabase";

const controlClass = "min-h-12 w-full rounded-[var(--radius-sm)] border border-[var(--input-border)] bg-[var(--input-background)] px-3.5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--forest)]";

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
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [removalStatus, setRemovalStatus] = useState("");
  const requestId = useRef(0);
  const filterUrlInitialized = useRef(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const removeButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelRemovalRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const removalStatusRef = useRef<HTMLParagraphElement | null>(null);
  const confirmationWasOpenRef = useRef(false);

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
    if (!displayedEntry) {
      confirmationWasOpenRef.current = false;
      return;
    }
    const wasConfirming = confirmationWasOpenRef.current;
    confirmationWasOpenRef.current = confirmingRemoval;
    window.setTimeout(() => {
      if (confirmingRemoval) cancelRemovalRef.current?.focus();
      else if (wasConfirming) removeButtonRef.current?.focus();
      else closeButtonRef.current?.focus();
    }, 0);
  }, [confirmingRemoval, displayedEntry]);

  useEffect(() => {
    if (!displayedEntry) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape" || removing) return;
      if (confirmingRemoval) {
        setConfirmingRemoval(false);
        setRemoveError("");
        return;
      }
      setActiveEntry(null);
      removeHistoryEntrySearchParameter();
      window.setTimeout(() => openerRef.current?.focus(), 0);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmingRemoval, displayedEntry, removing]);

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

  function openEntry(entry: CareEntryWithPetName, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setActiveEntry(entry);
    setConfirmingRemoval(false);
    setRemoveError("");
    setRemovalStatus("");
    const params = new URLSearchParams(window.location.search);
    params.set("entry", entry.id);
    window.history.replaceState(null, "", `/history?${params.toString()}`);
  }

  function closeEntry() {
    if (removing) return;
    setActiveEntry(null);
    setConfirmingRemoval(false);
    setRemoveError("");
    removeHistoryEntrySearchParameter();
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  function prepareRemoval() {
    setConfirmingRemoval(true);
    setRemoveError("");
  }

  function cancelRemoval() {
    if (removing) return;
    setConfirmingRemoval(false);
    setRemoveError("");
  }

  async function removeFromHistory() {
    if (!displayedEntry || removing) return;
    const entryId = displayedEntry.id;
    setRemoving(true);
    setRemoveError("");
    try {
      await removeCareEntryFromHistory(entryId);
      const remainingEntries = entries.filter((entry) => entry.id !== entryId);
      setEntries(remainingEntries);
      setNextOffset((current) => Math.max(0, current - 1));
      if (!remainingEntries.length && !hasMore && !filtersActive) setHasAnyHistory(false);
      setActiveEntry(null);
      setConfirmingRemoval(false);
      removeHistoryEntrySearchParameter();
      setRemovalStatus("Entry removed from History. Furvise will no longer use it for current tracking.");
      markAppDataChanged();
      void hasAnyHistoryArchiveEntries().then(setHasAnyHistory).catch(() => null);
      window.setTimeout(() => removalStatusRef.current?.focus(), 0);
    } catch (removeFailure) {
      setRemoveError(removeFailure instanceof Error ? removeFailure.message : "Furvise could not remove this entry. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <AppPage layout="workspace" shell="wide">
      <div className="w-full" data-ui="history-archive">
        <PageHeader
          eyebrow="HISTORY"
          supportingText="Search across your pets and past updates."
          title="Find something you've saved."
        />

        {error ? <Notice tone="warning">{error}</Notice> : null}
        {removalStatus ? <p ref={removalStatusRef} className="mb-6 border-y border-[var(--line)] py-3 text-sm leading-6 text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" role="status" tabIndex={-1}>{removalStatus}</p> : null}

        {hasAnyHistory ? (
          <section aria-label="Search and filter History" className="border-y border-[var(--line)] py-6">
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

        {loading && !entries.length ? <LoadingState label="Loading History" /> : null}
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
          <section aria-labelledby={confirmingRemoval ? "history-remove-title" : "history-entry-title"} aria-modal="true" className="max-h-[100dvh] w-full overflow-y-auto border border-[var(--border-subtle)] bg-[var(--surface-overlay)] p-6 shadow-[var(--shadow-floating)] sm:max-h-[90dvh] sm:max-w-xl sm:rounded-[var(--radius-md)]" ref={dialogRef} role="dialog">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-[var(--text-secondary)]">{formatHistoryTimestamp(displayedEntry.occurred_at)} · {formatPetDisplayName(displayedEntry.pet_name)} · {formatCareEntryCategory(displayedEntry.category)}</p>
                <h2 className="sr-only" id="history-entry-title">History entry details</h2>
              </div>
              <button ref={closeButtonRef} aria-label="Close history entry" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" disabled={removing} onClick={closeEntry} type="button">×</button>
            </div>
            {!confirmingRemoval ? (
              <>
                <p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-[var(--text-primary)]">{displayedEntry.note}</p>
                <div className="mt-8 border-t border-[var(--line)] pt-6">
                  <button ref={removeButtonRef} className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" onClick={prepareRemoval} type="button">Remove from history</button>
                </div>
              </>
            ) : (
              <div className="mt-7 border-y border-[var(--line)] py-7" data-ui="history-remove-confirmation">
                <p className="app-page-eyebrow text-[var(--danger-text)]">REMOVE FROM HISTORY</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]" id="history-remove-title">Remove this entry from History?</h2>
                <p className="mt-3 leading-7 text-[var(--text-secondary)]">Furvise will stop using this entry as part of current tracking. The entry will be removed from History, while limited provenance records may be retained. This cannot be undone from the app.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button aria-busy={removing || undefined} className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--danger-text)] px-5 text-sm font-semibold text-[var(--danger-text)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-[var(--border-subtle)] disabled:text-[var(--disabled-text)] sm:w-auto" disabled={removing} onClick={() => void removeFromHistory()} type="button">{removing ? "Removing..." : "Remove from history"}</button>
                  <button ref={cancelRemovalRef} className="inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-default)] px-5 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed sm:w-auto" disabled={removing} onClick={cancelRemoval} type="button">Cancel</button>
                </div>
                <div aria-live="assertive">
                  {removeError ? <p className="mt-5 border-y border-[var(--danger-text)] py-3 text-sm leading-6 text-[var(--danger-text)]" role="alert">{removeError}</p> : null}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AppPage>
  );
}

function HistorySelect({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label><span className="mb-2 block text-xs font-semibold tracking-[0.08em] text-[var(--text-secondary)]">{label}</span><select className={controlClass} onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function HistoryResults({ entries, onOpen }: { entries: CareEntryWithPetName[]; onOpen: (entry: CareEntryWithPetName, opener: HTMLButtonElement) => void }) {
  return (
    <section aria-labelledby="history-results-title" className="mt-12">
      <h2 className="sr-only" id="history-results-title">History results</h2>
      <div className="hidden md:block" data-ui="history-desktop-results">
        <div aria-hidden="true" className="grid grid-cols-[12rem_10rem_minmax(0,1fr)_9rem] gap-5 border-b border-[var(--line)] pb-3 text-xs font-semibold tracking-[0.08em] text-[var(--text-secondary)]">
          <span>WHEN</span><span>PET</span><span>WHAT HAPPENED</span><span>CATEGORY</span>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {entries.map((entry) => <button className="grid min-h-20 w-full grid-cols-[12rem_10rem_minmax(0,1fr)_9rem] items-center gap-5 py-4 text-left hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" key={entry.id} onClick={(event) => onOpen(entry, event.currentTarget)} type="button"><span className="text-sm text-[var(--text-secondary)]">{formatHistoryTimestamp(entry.occurred_at)}</span><span className="truncate text-sm text-[var(--text-secondary)]">{formatPetDisplayName(entry.pet_name)}</span><span className="min-w-0 break-words text-base font-medium leading-6 text-[var(--text-primary)]">{entry.note}</span><span className="text-sm text-[var(--text-secondary)]">{formatCareEntryCategory(entry.category)}</span></button>)}
        </div>
      </div>
      <div className="divide-y divide-[var(--line)] border-y border-[var(--line)] md:hidden" data-ui="history-mobile-results">
        {entries.map((entry) => <button className="block min-h-20 w-full py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" key={entry.id} onClick={(event) => onOpen(entry, event.currentTarget)} type="button"><span className="block text-sm leading-6 text-[var(--text-secondary)]">{formatHistoryTimestamp(entry.occurred_at)} · {formatPetDisplayName(entry.pet_name)} · {formatCareEntryCategory(entry.category)}</span><span className="mt-1 block break-words text-base font-medium leading-7 text-[var(--text-primary)]">{entry.note}</span></button>)}
      </div>
    </section>
  );
}

function HistoryEmpty() {
  return <section data-ui="history-empty"><h2 className="app-section-title">No history yet.</h2><p className="mt-3 text-base leading-7 text-[var(--text-secondary)]">Things you save in Today will appear here.</p></section>;
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

function removeHistoryEntrySearchParameter() {
  const params = new URLSearchParams(window.location.search);
  params.delete("entry");
  const query = params.toString();
  window.history.replaceState(null, "", query ? `/history?${query}` : "/history");
}
