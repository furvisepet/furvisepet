"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { ANALYSIS_STORAGE_KEY, parseStoredAnalysis } from "../lib/ai-analysis";
import {
  buildContextSummary,
  buildGuidanceCareEntry,
  formatAskResponsePlainText,
  parseAskResponse,
} from "../lib/ask.mjs";
import { toLocalDateTimeInputValue } from "../lib/care-log.mjs";
import {
  createCareEntryUnlessDuplicate,
  getBrowserSupabase,
  loadDogProfilesWithMemories,
  PROFILE_ID_STORAGE_KEY,
  type CareEntryCategory,
  type DogProfileWithMemories,
} from "../lib/supabase";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import { FURVISE_SAFETY_LINE, FURVISE_URGENT_SAFETY_MESSAGE } from "../lib/safety-copy";

const prompts = [
  "Summarize recent changes",
  "Prepare for a vet visit",
  "What should I watch next?",
  "Explain recent history",
] as const;

type StructuredResponse = {
  title: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
  safetyNote: string | null;
};
type AskSaveMetadata = {
  answerType: string;
  cannotAnswerFromSavedData: boolean;
  saveCategory: CareEntryCategory;
  saveDetail: string;
  saveDetailPreview: string;
  saveDisabledReason?: string;
  saveTitle: string;
  saveable: boolean;
  usedSavedFactsCount: number;
};
type ContextUsed = {
  petName: string | null;
  profileCount: number;
  productFeedbackCount: number;
  recentUpdateCount: number;
  savedDetailCount: number;
  storedGuidanceCount: number;
};
type AskUsageStatus = {
  allowed: boolean;
  count: number;
  earlyAccessUnlocked: boolean;
  limit: number;
  remaining: number;
  gate?: {
    hardBlocked?: boolean;
    message?: string | null;
    softNotice?: string | null;
  };
};

const askLimitMessage =
  "You've used your free Ask Furvise messages for this month. Your care log, dashboard, pet profiles, and curated product suggestions are still available.";

export default function AskPage() {
  return (
    <Suspense fallback={<AppPage>{null}</AppPage>}>
      <AskPageContent />
    </Suspense>
  );
}

function AskPageContent() {
  const searchParams = useSearchParams();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [selectedPet, setSelectedPet] = useState(searchParams.get("pet") || "all");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<StructuredResponse | null>(null);
  const [followUpResponse, setFollowUpResponse] = useState<StructuredResponse | null>(null);
  const [saveMetadata, setSaveMetadata] = useState<AskSaveMetadata | null>(null);
  const [followUpSaveMetadata, setFollowUpSaveMetadata] = useState<AskSaveMetadata | null>(null);
  const [contextUsed, setContextUsed] = useState<ContextUsed | null>(null);
  const [urgent, setUrgent] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [followUpUsed, setFollowUpUsed] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [usage, setUsage] = useState<AskUsageStatus | null>(null);

  useEffect(() => {
    if (authStatus !== "signedIn" || !authUser) return;
    let active = true;
    async function load() {
      try {
        const user = authUser;
        if (!user) return;
        const rows = await loadDogProfilesWithMemories(user);
        if (active) {
          setProfiles(rows);
          if (!searchParams.get("pet") && rows.length === 1) setSelectedPet(rows[0].id);
        }
        const usageStatus = await fetchAskUsage();
        if (active && usageStatus) setUsage(usageStatus);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not load your pets.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [authStatus, authUser, searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(question.trim(), false);
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!response || followUpUsed) return;
    await ask(followUpQuestion.trim(), true);
  }

  async function ask(prompt: string, isFollowUp: boolean) {
    if (!prompt || submitting) return;
    setSubmitting(true);
    setError("");
    setStatus("");
    if (!isFollowUp) {
      setResponse(null);
      setFollowUpResponse(null);
      setSaveMetadata(null);
      setFollowUpSaveMetadata(null);
      setFollowUpUsed(false);
      setUrgent(false);
    }
    try {
      const token = await getAskAuthToken();
      if (!token) throw new Error("Please sign in again before asking Furvise.");
      const storedAnalysis = readRelevantStoredAnalysis(selectedPet);
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          petId: selectedPet,
          previousResponse: isFollowUp ? response : null,
          question: prompt,
          storedAnalysis,
        }),
      });
      const payload = await result.json().catch(() => null) as {
        contextUsed?: ContextUsed | null;
        error?: string;
        response?: unknown;
        saveMetadata?: AskSaveMetadata | null;
        usage?: AskUsageStatus | null;
        urgent?: boolean;
      } | null;
      const parsed = parseAskResponse(payload?.response) as StructuredResponse | null;
      if (payload?.usage) setUsage(payload.usage);
      if (!result.ok || !parsed) throw new Error(payload?.error || "Furvise could not answer right now. Please try again.");
      if (isFollowUp) {
        setFollowUpResponse(parsed);
        setFollowUpSaveMetadata(payload?.saveMetadata || null);
        setFollowUpUsed(true);
        setFollowUpQuestion("");
      } else {
        setResponse(parsed);
        setSaveMetadata(payload?.saveMetadata || null);
      }
      setContextUsed(payload?.contextUsed || null);
      setUrgent(Boolean(payload?.urgent));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Furvise could not answer right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyResponse() {
    if (!response) return;
    const text = [formatAskResponsePlainText(response), followUpResponse ? `Follow-up\n\n${formatAskResponsePlainText(followUpResponse)}` : ""]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Response copied.");
    } catch {
      setError("Furvise could not copy the response. Select the text and copy it manually.");
    }
  }

  function requestSave() {
    const activeSaveMetadata = followUpResponse ? followUpSaveMetadata : saveMetadata;
    if (!activeSaveMetadata?.saveable) {
      setStatus("");
      return;
    }
    if (selectedPet === "all") {
      setError("Choose one pet before saving guidance to care history.");
      return;
    }
    setSaveConfirmationOpen(true);
  }

  async function confirmSave() {
    const guidance = followUpResponse || response;
    const activeSaveMetadata = followUpResponse ? followUpSaveMetadata : saveMetadata;
    if (!guidance || !activeSaveMetadata?.saveable || selectedPet === "all") return;
    setSubmitting(true);
    setError("");
    try {
      const entry = buildGuidanceCareEntry(guidance, activeSaveMetadata);
      const result = await createCareEntryUnlessDuplicate({
        category: entry.category as CareEntryCategory,
        note: entry.note,
        occurredAt: toLocalDateTimeInputValue(),
        petProfileId: selectedPet,
        severity: null,
        title: entry.title,
      });
      setSaveConfirmationOpen(false);
      setStatus(result.action === "duplicate" ? "This summary is already saved in Care History." : "Furvise guidance saved to care history.");
    } catch (saveError) {
      logAskCareSaveFailure(saveError);
      setError("Furvise could not save this update.");
    } finally {
      setSubmitting(false);
    }
  }

  function askAnother() {
    setResponse(null);
    setFollowUpResponse(null);
    setSaveMetadata(null);
    setFollowUpSaveMetadata(null);
    setContextUsed(null);
    setFollowUpUsed(false);
    setFollowUpQuestion("");
    setQuestion("");
    setUrgent(false);
    setError("");
    setStatus("");
  }

  const responseToRender = response;
  const monthlyLimitReached = Boolean(usage && !usage.earlyAccessUnlocked && usage.count >= usage.limit);
  const askSubmitDisabled = submitting || profiles.length === 0 || monthlyLimitReached;
  const askSubmitLabel = monthlyLimitReached ? "Monthly limit reached" : submitting ? "Thinking…" : "Ask Furvise";
  const askUsageNotice = usage ? getAskUsageNotice(usage) : "";
  const savePetName = profiles.find((profile) => profile.id === selectedPet)?.name;
  const savePetLabel = savePetName ? formatPetDisplayName(savePetName) : "this pet";
  const activeSaveMetadata = followUpResponse ? followUpSaveMetadata : saveMetadata;
  const saveDisabled = !activeSaveMetadata?.saveable;
  const saveDisabledMessage = "Nothing useful to save yet. Add a care update first, then Ask Furvise can save a better summary.";

  return (
    <AppPage>
      <div className="ask-print-root">
        <header className="print:hidden">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--pw-heading)] sm:text-5xl">Ask Furvise</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--pw-muted)]">Ask one focused question using the pet context already saved to your account.</p>
          {askUsageNotice ? <AskUsageNotice text={askUsageNotice} /> : null}
        </header>

        {loading ? <Status text="Loading pet context…" /> : !responseToRender ? (
          <section className="mt-8 max-w-full overflow-hidden rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 sm:p-6 print:hidden">
            <form onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[var(--pw-heading)]">Pet context</span>
                <select className={inputClass} onChange={(event) => setSelectedPet(event.target.value)} value={selectedPet}>
                  <option value="all">All pets</option>
                  {profiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {formatPetDisplayName(profile.name)} ({formatSpecies(profile.species)})
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-5">
                <p className="text-sm font-semibold text-[var(--pw-heading)]">Suggested prompts</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {prompts.map((prompt) => <button className="min-h-10 max-w-full whitespace-normal break-words rounded-full border border-[var(--pw-border)] bg-[var(--pw-card-muted)] px-3 py-2 text-left text-sm font-semibold leading-5 text-[var(--pw-text)] hover:border-[var(--pw-primary)]" key={prompt} onClick={() => setQuestion(prompt)} type="button">{prompt}</button>)}
                </div>
              </div>
              <label className="mt-5 block">
                <span className="mb-2 block text-sm font-semibold text-[var(--pw-heading)]">What would you like help with?</span>
                <textarea className={`${inputClass} min-h-36 resize-y py-3`} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about changes, preparation, or what to monitor." required value={question} />
              </label>
              <button className={primaryButton} disabled={askSubmitDisabled} type="submit">{askSubmitLabel}</button>
            </form>
          </section>
        ) : null}

        {monthlyLimitReached ? <Status text={askLimitMessage} tone="warn" /> : null}
        {error ? <Status text={error} tone="warn" /> : null}
        {status ? <Status text={status} /> : null}

        {responseToRender ? (
          <div className="mt-8 grid gap-5" aria-live="polite">
            {contextUsed ? <ContextSummary context={contextUsed} /> : null}
            <ResponseCard response={responseToRender} urgent={urgent} />
            {followUpResponse ? (
              <section>
                <p className="mb-2 text-sm font-semibold text-[var(--pw-primary)]">Follow-up response</p>
                <ResponseCard response={followUpResponse} urgent={urgent} />
              </section>
            ) : null}

            <div className="flex flex-wrap gap-3 print:hidden">
              <button className={secondaryButton} onClick={copyResponse} type="button">Copy</button>
              <button className={secondaryButton} disabled={saveDisabled} onClick={requestSave} title={saveDisabled ? saveDisabledMessage : undefined} type="button">Save to care history</button>
              <button className={secondaryButton} onClick={() => window.print()} type="button">Print</button>
              <button className={secondaryButton} onClick={askAnother} type="button">Ask another question</button>
            </div>
            {saveDisabled ? <p className="text-sm leading-6 text-[var(--pw-muted)] print:hidden">{saveDisabledMessage}</p> : null}

            {!followUpUsed && !urgent ? (
              <form className="rounded-3xl border border-[var(--pw-border)] bg-[var(--pw-surface)] p-5 print:hidden" onSubmit={submitFollowUp}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[var(--pw-heading)]">One follow-up question</span>
                  <textarea className={`${inputClass} min-h-24 resize-y py-3`} onChange={(event) => setFollowUpQuestion(event.target.value)} placeholder="Ask one focused follow-up using the same pet context." required value={followUpQuestion} />
                </label>
                <button className={primaryButton} disabled={askSubmitDisabled} type="submit">{monthlyLimitReached ? "Monthly limit reached" : submitting ? "Thinking…" : "Ask follow-up"}</button>
              </form>
            ) : followUpUsed ? (
              <p className="text-sm text-[var(--pw-muted)] print:hidden">One follow-up has been used. Ask another question to start a new response.</p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-8 max-w-3xl rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 text-sm leading-6 text-[var(--pw-muted)]">
          {FURVISE_SAFETY_LINE} {FURVISE_URGENT_SAFETY_MESSAGE}
        </p>
      </div>

      {saveConfirmationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 print:hidden">
          <section aria-labelledby="save-guidance-title" aria-modal="true" className="w-full max-w-[540px] rounded-3xl bg-[var(--pw-surface)] p-8 shadow-2xl shadow-black/20 sm:p-10" role="alertdialog">
            <h2 className="mb-4 text-xl font-semibold text-[var(--pw-heading)]" id="save-guidance-title">Save to care history?</h2>
            <p className="max-w-[30rem] leading-7 text-[var(--pw-muted)]">Save this Furvise response as a clearly labeled note in {savePetLabel === "this pet" ? "this pet's" : `${savePetLabel}'s`} care history.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button className={modalSecondaryButton} onClick={() => setSaveConfirmationOpen(false)} type="button">Cancel</button>
              <button className={modalPrimaryButton} disabled={submitting} onClick={confirmSave} type="button">{submitting ? "Saving…" : "Save note"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppPage>
  );
}

function logAskCareSaveFailure(error: unknown) {
  if (process.env.NODE_ENV === "production") return;

  const databaseError = error as {
    code?: string;
    details?: string;
    hint?: string;
    message?: string;
  };

  console.warn("[Furvise ask] care entry save failed", {
    action: "insert",
    errorCode: databaseError?.code || "",
    errorDetails: databaseError?.details || "",
    errorHint: databaseError?.hint || "",
    errorMessage: databaseError?.message || "",
    table: "pet_care_entries",
  });
}

async function getAskAuthToken() {
  const client = getBrowserSupabase();
  const { data } = client ? await client.auth.getSession() : { data: { session: null } };
  return data.session?.access_token || "";
}

async function fetchAskUsage() {
  try {
    const token = await getAskAuthToken();
    if (!token) return null;
    const response = await fetch("/api/ask", {
      headers: { Authorization: `Bearer ${token}` },
      method: "GET",
    });
    const payload = await response.json().catch(() => null) as { usage?: AskUsageStatus | null } | null;
    if (response.ok && payload?.usage) return payload.usage;
  } catch {
    // Usage display is helpful, but the Ask form should still load if this fails.
  }
  return null;
}

function getAskUsageNotice(usage: AskUsageStatus) {
  if (usage.earlyAccessUnlocked || usage.remaining <= 0 || usage.remaining > 5) return "";
  return `You have ${usage.remaining} Ask Furvise message${usage.remaining === 1 ? "" : "s"} left this month.`;
}

function AskUsageNotice({ text }: { text: string }) {
  return (
    <div className="mt-4 inline-flex max-w-full flex-col rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-surface)] px-4 py-3 text-sm leading-6 text-[var(--pw-muted)]">
      <span className="font-semibold text-[var(--pw-heading)]">{text}</span>
    </div>
  );
}

function ResponseCard({ response, urgent }: { response: StructuredResponse; urgent: boolean }) {
  return (
    <section className={`rounded-3xl border p-6 ${urgent ? "border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)]" : "border-[var(--pw-border)] bg-[var(--pw-surface)]"}`}>
      <h2 className="text-2xl font-semibold text-[var(--pw-heading)]">{response.title}</h2>
      <p className="mt-3 leading-7 text-[var(--pw-text)]">{response.summary}</p>
      {response.sections.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {response.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="font-semibold text-[var(--pw-heading)]">{section.heading}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5 leading-6 text-[var(--pw-text)]">
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
      {response.safetyNote ? <p className="mt-6 rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-4 text-sm leading-6 text-[var(--pw-warning-text)]">{response.safetyNote}</p> : null}
    </section>
  );
}

function ContextSummary({ context }: { context: ContextUsed }) {
  return (
    <details className="rounded-2xl border border-[var(--pw-border)] bg-[var(--pw-card-muted)] p-4 print:hidden">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--pw-heading)]">{buildContextSummary(context)}</summary>
      <dl className="mt-3 grid gap-2 text-sm text-[var(--pw-muted)] sm:grid-cols-2">
        <div><dt className="font-semibold text-[var(--pw-heading)]">Profiles</dt><dd>{context.profileCount}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-heading)]">Saved details</dt><dd>{context.savedDetailCount}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-heading)]">Recent updates</dt><dd>{context.recentUpdateCount}</dd></div>
        <div><dt className="font-semibold text-[var(--pw-heading)]">Stored guidance</dt><dd>{context.storedGuidanceCount}</dd></div>
        {context.productFeedbackCount ? <div><dt className="font-semibold text-[var(--pw-heading)]">Relevant product notes</dt><dd>{context.productFeedbackCount}</dd></div> : null}
      </dl>
    </details>
  );
}

function readRelevantStoredAnalysis(selectedPet: string) {
  if (typeof window === "undefined" || selectedPet === "all" || window.localStorage.getItem(PROFILE_ID_STORAGE_KEY) !== selectedPet) return null;
  try {
    const raw = window.localStorage.getItem(ANALYSIS_STORAGE_KEY);
    return raw ? parseStoredAnalysis(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function Status({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  return <div className={`mt-6 rounded-3xl border p-5 print:hidden ${tone === "warn" ? "border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] text-[var(--pw-warning-text)]" : "border-[var(--pw-border)] bg-[var(--pw-surface)] text-[var(--pw-muted)]"}`} role="status">{text}</div>;
}

const inputClass = "min-h-11 w-full rounded-2xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-4 text-base text-[var(--pw-text)] outline-none focus:border-[var(--pw-primary)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]";
const primaryButton = "mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--pw-primary)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--pw-subtle)] disabled:opacity-70";
const secondaryButton = "inline-flex min-h-11 items-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-4 text-sm font-semibold text-[var(--pw-text)] hover:border-[var(--pw-primary)] disabled:opacity-60";
const modalPrimaryButton = "inline-flex h-14 w-full items-center justify-center rounded-full bg-[var(--pw-primary)] px-8 text-sm font-semibold text-white transition hover:bg-[var(--pw-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)] disabled:cursor-not-allowed disabled:bg-[var(--pw-subtle)] disabled:opacity-70 sm:w-auto";
const modalSecondaryButton = "inline-flex h-14 w-full items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-[var(--pw-surface)] px-8 text-sm font-semibold text-[var(--pw-text)] transition hover:border-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pw-surface)] disabled:opacity-60 sm:w-auto";
