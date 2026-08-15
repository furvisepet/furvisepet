"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type KeyboardEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppPage } from "../components/app-page";
import { AskUsageNotice } from "../components/ask-usage-notice";
import { BrandMark } from "../components/brand-mark";
import { PageHeader, PrimaryButton } from "../components/product-primitives";
import { WorkflowDialog, WorkflowEmptyState } from "../components/workflow-primitives";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import {
  buildGuidanceCareEntry,
  formatAskResponsePlainText,
  parseAskConversationResponse,
} from "../lib/ask.mjs";
import { buildAskRequestPayload, type AskRequestPayload } from "../lib/ask-request-contract";
import { resolveAskPetSelection } from "../lib/ask-pet-selection";
import { getActivePetId, setActivePetId } from "../lib/active-pet";
import { trackAskEvent } from "../lib/ask-analytics";
import { deriveConversationTitle, formatConversationDate, getPersistenceNotices, type AskConversationDetail, type AskConversationSummary } from "../lib/ask-conversations";
import { toLocalDateTimeInputValue } from "../lib/care-log.mjs";
import { FURVISE_ANSWER_UNAVAILABLE_MESSAGE } from "../lib/furvise-voice";
import { clearClientMutationKey, getOrCreateClientMutationKey, idempotentClientFetch } from "../lib/security/idempotency/client";
import {
  createCareEntryUnlessDuplicate,
  getBrowserSupabase,
  loadDogProfilesWithMemories,
  type CareEntryCategory,
  type DogProfileWithMemories,
} from "../lib/supabase";
import { formatPetDisplayName, formatSpecies } from "../lib/petwise";
import { markAppDataChanged } from "../lib/navigation/app-data-freshness";
import { setAskRequestActive } from "../lib/navigation/ask-request-activity";
import { getAskErrorPresentation, type AskFailureCode } from "../lib/ask-client-errors";

const emptyStarters = [
  "What should I track before {pet}'s next vet visit?",
  "Summarize what has changed recently.",
  "Could a food change be related to what I'm seeing?",
  "Help me build a simple care routine.",
] as const;

type AnswerType = "direct_answer" | "care_plan" | "tracking_plan" | "vet_prep" | "history_summary" | "product_guidance" | "clarification" | "urgent_guidance";
type AnswerAction = "save_key_detail" | "add_to_care_history" | "start_tracking" | "prepare_vet_note" | "copy";
type StructuredResponse = {
  title: string;
  summary: string;
  directAnswer: string;
  supportingText: string | null;
  sections: { heading: string; items: string[] }[];
  safetyNote: string | null;
  answerType: AnswerType;
  suggestedQuestions: string[];
  actions: AnswerAction[];
  usedContextSummary: string[];
  missingUsefulDetails: string[];
  urgency: "routine" | "resolved" | "monitor" | "urgent";
  clarificationQuestion?: string;
  saveSuggestions?: Array<{ type: string; statement: string; attribution: string; suggestedLabel: string; requiresConfirmation: true }>;
  trackingPlan?: { observations: string[]; frequency: string; duration: string; comparison: string; seekCareSoonerIf: string[] };
  vetBriefRelevant?: boolean;
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
type ContextUsed = { petName: string | null; usedSources: string[] };
type CarePersistence = { status: "persisted" | "suggested" | "skipped" | "failed"; careEntryIds: string[]; concernIds: string[]; errorCode: string | null; memoryIds?: string[]; profileUpdated?: boolean };
type AskUsageStatus = { allowed: boolean; count: number; limit: number; planId: "free" | "plus"; remaining: number; resetAt?: string };
type SuggestionUiStatus = "idle" | "saving" | "applied" | "already_applied" | "failed" | "dismissed";
type StateSuggestion = {
  id: string;
  type: "history" | "memory" | "concern_resolution" | "concern_opening";
  title: string;
  details?: string | null;
  status?: "pending" | "saved" | "dismissed";
  applyStatus?: "applied" | "already_applied";
  uiStatus?: SuggestionUiStatus;
  error?: string | null;
  careEntryId?: string | null;
  concernId?: string | null;
};
type ConversationMessage =
  | { id: string; role: "user"; text: string; requestId?: string | null; failed?: boolean }
  | { id: string; role: "furvise"; response: StructuredResponse; saveMetadata: AskSaveMetadata | null; contextUsed: ContextUsed | null; handledWithoutAi?: boolean; creditsUsed?: number; suggestion?: StateSuggestion | null; automaticSaveConfirmation?: string | null; carePersistence?: CarePersistence | null };
type AskRequestPhase = "idle" | "submitting" | "receiving" | "completed" | "failed" | "retrying";
type FailedAskRequest = {
  code: AskFailureCode;
  payload: AskRequestPayload;
  requestId: string;
  scope: string;
  userMessageId: string;
  retryAfterSeconds?: number;
};

export default function AskPage() {
  return <Suspense fallback={<AppPage>{null}</AppPage>}><AskPageContent /></Suspense>;
}

function AskPageContent() {
  const searchParams = useSearchParams();
  const { status: authStatus, user: authUser } = useRequireConfirmedSupabaseAuth();
  const [profiles, setProfiles] = useState<DogProfileWithMemories[]>([]);
  const [selectedPet, setSelectedPet] = useState(searchParams.get("pet") || "");
  const [conversations, setConversations] = useState<AskConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("New question");
  const [thread, setThread] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingNewQuestion, setPendingNewQuestion] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AskConversationSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AskConversationSummary | null>(null);
  const [saveTargetId, setSaveTargetId] = useState<string | null>(null);
  const [saveDraft, setSaveDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [conversationListError, setConversationListError] = useState("");
  const [requestPhase, setRequestPhase] = useState<AskRequestPhase>("idle");
  const [failedRequest, setFailedRequest] = useState<FailedAskRequest | null>(null);
  const [status, setStatus] = useState("");
  const [persistenceWarning, setPersistenceWarning] = useState("");
  const [usage, setUsage] = useState<AskUsageStatus | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const askRequestActiveRef = useRef(false);

  useEffect(() => {
    if (authStatus !== "signedIn" || !authUser) return;
    const user = authUser;
    let active = true;
    async function load() {
      try {
        const rows = await loadDogProfilesWithMemories(user);
        if (!active) return;
        setProfiles(rows);
        const requestedPet = searchParams.get("pet");
        const storedPet = readStoredActivePetId();
        const petId = resolveAskPetSelection({ explicitPetId: requestedPet, pets: rows, storedPetId: storedPet });
        setSelectedPet(petId);
        if (petId) persistActivePetId(petId);
        const usageStatus = await fetchAskUsage().catch(() => null);
        const history = await fetchConversationList().catch(() => {
          setConversationListError("Recent conversations could not be loaded. Try again.");
          return [];
        });
        if (!active) return;
        if (usageStatus) setUsage(usageStatus);
        setConversations(history);
        const requestedConversation = searchParams.get("conversation");
        if (requestedConversation && history.some((item) => item.id === requestedConversation)) {
          await openConversation(requestedConversation, history);
        } else if (petId) {
          await importLegacyConversation(petId, history);
          setQuestion(readDraft(getDraftKey(null, petId)));
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Furvise could not open Ask.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
    // The initial route selection is intentionally captured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, authUser]);

  useEffect(() => {
    if (!selectedPet || typeof window === "undefined") return;
    window.localStorage.setItem(getDraftKey(activeConversationId, selectedPet), question);
  }, [activeConversationId, question, selectedPet]);

  const activeProfile = profiles.find((profile) => profile.id === selectedPet) || null;
  const petName = activeProfile ? formatPetDisplayName(activeProfile.name) : "your pet";
  const assistantMessages = useMemo(() => thread.filter((message): message is Extract<ConversationMessage, { role: "furvise" }> => message.role === "furvise"), [thread]);
  const latestAnswer = assistantMessages.at(-1) || null;
  const saveTarget = assistantMessages.find((message) => message.id === saveTargetId) || null;
  const hasThread = Boolean(thread.length);
  const requestActive = requestPhase === "submitting" || requestPhase === "receiving" || requestPhase === "retrying";
  const composerUnavailable = submitting || requestActive || profiles.length === 0 || !selectedPet;

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [requestPhase, thread]);

  async function refreshConversations() {
    try {
      const history = await fetchConversationList();
      setConversations(history);
      setConversationListError("");
      return history;
    } catch (refreshError) {
      setConversationListError("Recent conversations could not be loaded. Try again.");
      throw refreshError;
    }
  }

  async function openConversation(id: string, known = conversations) {
    if (askRequestActiveRef.current) return;
    saveCurrentDraft();
    setError("");
    setStatus("");
    setLoading(true);
    try {
      const payload = await conversationJson(`/api/ask/conversations/${encodeURIComponent(id)}`) as { conversation?: AskConversationDetail };
      if (!payload.conversation) throw new Error("That conversation is not available.");
      const parsedThread = parseConversationDetail(payload.conversation);
      setSelectedPet(payload.conversation.petId);
      if (typeof window !== "undefined") {
        persistActivePetId(payload.conversation.petId);
        replaceAskLocation({ conversationId: payload.conversation.id });
      }
      setActiveConversationId(payload.conversation.id);
      setActiveTitle(payload.conversation.title);
      setThread(parsedThread);
      const lastMessage = parsedThread.at(-1);
      const lastAnswer = [...parsedThread].reverse().find((message): message is Extract<ConversationMessage, { role: "furvise" }> => message.role === "furvise");
      const retryScope = `ask:${payload.conversation.petId}:${payload.conversation.id}`;
      setFailedRequest(lastMessage?.role === "user" && lastMessage.failed && lastMessage.requestId
        ? {
            code: "UNKNOWN_ERROR",
            payload: buildAskRequestPayload({
              conversationId: payload.conversation.id,
              locale: navigator.language,
              message: lastMessage.text,
              petId: payload.conversation.petId,
              previousResponse: lastAnswer?.response || null,
              question: lastMessage.text,
              requestId: lastMessage.requestId,
            }),
            requestId: lastMessage.requestId,
            scope: retryScope,
            userMessageId: lastMessage.id,
          }
        : null);
      setQuestion(readDraft(getDraftKey(payload.conversation.id, payload.conversation.petId)));
      setHistoryOpen(false);
      trackAskEvent("conversation_reopened");
      if (!known.some((item) => item.id === id)) await refreshConversations();
      requestAnimationFrame(() => composerRef.current?.focus());
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "That conversation could not be opened.");
    } finally {
      setLoading(false);
    }
  }

  function switchPet(petId: string) {
    if (askRequestActiveRef.current) return;
    saveCurrentDraft();
    setSelectedPet(petId);
    if (typeof window !== "undefined") {
      persistActivePetId(petId);
      replaceAskLocation({ petId });
    }
    setActiveConversationId(null);
    setActiveTitle("New question");
    setThread([]);
    setQuestion(readDraft(getDraftKey(null, petId)));
    setError("");
    setPersistenceWarning("");
    setStatus("");
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function requestNewQuestion() {
    if (askRequestActiveRef.current) return;
    if (question.trim()) setPendingNewQuestion(true);
    else startNewQuestion();
  }

  function startNewQuestion() {
    if (askRequestActiveRef.current) return;
    if (selectedPet && typeof window !== "undefined") window.localStorage.removeItem(getDraftKey(activeConversationId, selectedPet));
    setQuestion("");
    setThread([]);
    setActiveConversationId(null);
    if (selectedPet && typeof window !== "undefined") replaceAskLocation({ petId: selectedPet });
    setActiveTitle("New question");
    setPendingNewQuestion(false);
    setError("");
    setPersistenceWarning("");
    setStatus(activeConversationId ? "Your previous conversation is saved in Recent conversations." : "");
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(question.trim(), "composer");
  }

  async function ask(promptValue: string, source: "composer" | "empty_state" | "response_suggestion", retry?: FailedAskRequest) {
    const prompt = promptValue.trim();
    if (!prompt || composerUnavailable || askRequestActiveRef.current) return;
    const conversationIdAtSubmit = retry?.payload.conversationId || activeConversationId;
    const scope = retry?.scope || `ask:${selectedPet}:${conversationIdAtSubmit || "new"}`;
    const requestId = retry?.requestId || getOrCreateClientMutationKey(scope);
    const requestPayload = retry?.payload || buildAskRequestPayload({
      conversationId: conversationIdAtSubmit,
      locale: navigator.language,
      message: prompt,
      petId: selectedPet,
      previousResponse: latestAnswer?.response || null,
      question: prompt,
      requestId,
    });
    const userMessageId = retry?.userMessageId || createMessageId("user");
    askRequestActiveRef.current = true;
    setAskRequestActive(true);
    setRequestPhase(retry ? "retrying" : "submitting");
    setFailedRequest(null);
    setError("");
    setPersistenceWarning("");
    setStatus("");
    if (!retry) setThread((current) => [...current, { id: userMessageId, role: "user", text: prompt }]);
    trackAskEvent(requestPayload.previousResponse ? "follow_up_submitted" : "question_submitted", { source });
    try {
      const token = await getAskAuthToken();
      if (!token) throw new AskRequestError("AUTH_REQUIRED");
      const request = idempotentClientFetch("/api/ask", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(55_000),
      }, scope, requestId);
      setQuestion("");
      const result = await request;
      setRequestPhase("receiving");
      const payload = await result.json().catch(() => null) as { assistantMessageId?: string; automaticSaveConfirmation?: string | null; carePersistence?: CarePersistence | null; code?: AskFailureCode; contextUsed?: ContextUsed | null; conversationId?: string; creditsUsed?: number; dataChanged?: boolean; handledWithoutAi?: boolean; message?: string; persistence?: { saved?: boolean; warning?: string }; response?: unknown; retryAfterSeconds?: number; saveMetadata?: AskSaveMetadata | null; success?: boolean; suggestion?: StateSuggestion | null; usage?: AskUsageStatus | null; userMessageId?: string } | null;
      const parsed = parseAskConversationResponse(payload?.response) as StructuredResponse | null;
      if (payload?.usage) setUsage(payload.usage);
      if (!result.ok || !payload?.success || !parsed || !payload.conversationId) throw new AskRequestError(payload?.code || "UNKNOWN_ERROR", payload?.message, payload?.retryAfterSeconds);
      if (payload.dataChanged) markAppDataChanged();

      const confirmedCarePersistence = payload.carePersistence?.status === "persisted" && Boolean(payload.carePersistence.careEntryIds.length);
      const assistantMessage = { automaticSaveConfirmation: confirmedCarePersistence ? "Added to care history" : null, carePersistence: payload.carePersistence || null, contextUsed: payload.contextUsed || null, creditsUsed: payload.creditsUsed || 0, handledWithoutAi: Boolean(payload.handledWithoutAi), id: payload.assistantMessageId || createMessageId("furvise"), response: parsed, role: "furvise" as const, saveMetadata: payload.saveMetadata || null, suggestion: payload.suggestion || null };
      setThread((current) => {
        const withoutExistingAssistant = current.filter((message) => message.id !== assistantMessage.id);
        return [...withoutExistingAssistant.map((message) => message.id === userMessageId && payload.userMessageId ? { ...message, id: payload.userMessageId } : message), assistantMessage];
      });
      if (!conversationIdAtSubmit) {
        setActiveConversationId(payload.conversationId);
        if (typeof window !== "undefined") replaceAskLocation({ conversationId: payload.conversationId });
        setActiveTitle(deriveConversationTitle(prompt, petName));
        trackAskEvent("conversation_started", { source });
      }
      await refreshConversations().catch(() => undefined);
      setPersistenceWarning(payload.persistence?.saved === false ? payload.persistence.warning || "This answer could not be saved to conversation history." : "");
      setRequestPhase("completed");
      if (parsed.urgency === "urgent") trackAskEvent("urgent_guidance_shown", { answerType: parsed.answerType });
      if (parsed.clarificationQuestion) trackAskEvent("clarification_requested", { answerType: parsed.answerType });
      if (parsed.saveSuggestions?.length) trackAskEvent("memory_save_suggested", { answerType: parsed.answerType });
    } catch (askError) {
      const failure = getAskFailure(askError);
      setFailedRequest({ code: failure.code, payload: requestPayload, requestId, retryAfterSeconds: failure.retryAfterSeconds, scope, userMessageId });
      setRequestPhase("failed");
      trackAskEvent("answer_failed", { source });
    } finally {
      askRequestActiveRef.current = false;
      setAskRequestActive(false);
    }
  }

  function editFailedMessage() {
    if (!failedRequest) return;
    setThread((current) => current.filter((message) => message.id !== failedRequest.userMessageId));
    clearClientMutationKey(failedRequest.scope, failedRequest.requestId);
    setQuestion(failedRequest.payload.question);
    setFailedRequest(null);
    setRequestPhase("idle");
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function saveCurrentDraft() {
    if (selectedPet && typeof window !== "undefined") window.localStorage.setItem(getDraftKey(activeConversationId, selectedPet), question);
  }

  async function renameConversation() {
    if (!renameTarget || !renameDraft.trim()) return;
    try {
      await conversationJson(`/api/ask/conversations/${encodeURIComponent(renameTarget.id)}`, { method: "PATCH", body: JSON.stringify({ title: renameDraft.trim() }) });
      setConversations((items) => items.map((item) => item.id === renameTarget.id ? { ...item, title: renameDraft.trim() } : item));
      if (activeConversationId === renameTarget.id) setActiveTitle(renameDraft.trim());
      setRenameTarget(null);
      setStatus("Conversation renamed.");
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "The conversation could not be renamed.");
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    try {
      await conversationJson(`/api/ask/conversations/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setConversations((items) => items.filter((item) => item.id !== deleteTarget.id));
      if (activeConversationId === deleteTarget.id) startNewQuestion();
      setDeleteTarget(null);
      setStatus("Conversation deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The conversation could not be deleted.");
    }
  }

  async function copyAnswer(message: Extract<ConversationMessage, { role: "furvise" }>) {
    try { await navigator.clipboard.writeText(formatAskResponsePlainText(message.response)); setStatus("Answer copied."); }
    catch { setError("I couldn't copy that answer. Select the text and copy it manually."); }
  }

  function requestSave(message: Extract<ConversationMessage, { role: "furvise" }>) {
    if (!message.saveMetadata?.saveable || !activeProfile) return;
    setSaveTargetId(message.id);
    setSaveDraft(message.saveMetadata.saveDetail);
  }

  async function confirmSave() {
    if (!saveTarget?.saveMetadata?.saveable || !activeProfile || !saveDraft.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const entry = buildGuidanceCareEntry(saveTarget.response, { ...saveTarget.saveMetadata, saveDetail: saveDraft.trim() });
      const result = await createCareEntryUnlessDuplicate({ category: entry.category as CareEntryCategory, note: entry.note, occurredAt: toLocalDateTimeInputValue(), petProfileId: activeProfile.id, severity: null, title: entry.title });
      if (result.action === "created") markAppDataChanged();
      setSaveTargetId(null);
      setStatus(result.action === "duplicate" ? "This detail is already in History." : `Saved to ${petName}'s care history.`);
      trackAskEvent("memory_saved", { answerType: saveTarget.response.answerType });
    } catch (saveError) {
      logAskCareSaveFailure(saveError);
      setError("I couldn't save that detail. You can try again.");
    } finally { setSubmitting(false); }
  }

  function selectSuggestion(suggestion: string, source: "empty_state" | "response_suggestion") {
    setQuestion(suggestion);
    if (source === "response_suggestion") trackAskEvent("suggestion_selected", { answerType: latestAnswer?.response.answerType, source });
    void ask(suggestion, source);
  }

  function runAction(action: AnswerAction, message: Extract<ConversationMessage, { role: "furvise" }>) {
    trackAskEvent("answer_action_selected", { action, answerType: message.response.answerType });
    if (action === "copy") void copyAnswer(message);
    if (action === "prepare_vet_note") {
      trackAskEvent("vet_brief_started", { answerType: message.response.answerType });
      const conversation = activeConversationId ? `&conversation=${encodeURIComponent(activeConversationId)}` : "";
      window.location.assign(`/vet-brief?pet=${encodeURIComponent(selectedPet)}&source=ask${conversation}`);
    }
    if (action === "start_tracking") trackAskEvent("tracking_started", { answerType: message.response.answerType });
    if (action === "save_key_detail" || action === "add_to_care_history" || action === "start_tracking") requestSave(message);
  }

  async function applyStateSuggestion(messageId: string, suggestion: StateSuggestion, action: "save" | "monitor" | "dismiss" | "edit", details?: string) {
    setThread((current) => updateMessageSuggestion(current, messageId, suggestion.id, { error: null, uiStatus: "saving" }));
    try {
      const payload = await suggestionJson(`/api/ask/suggestions/${encodeURIComponent(suggestion.id)}`, {
        body: JSON.stringify({ action, ...(details ? { details } : {}) }),
        method: "PATCH",
      });
      if (action === "edit" && payload.suggestion) {
        const editedSuggestion = payload.suggestion;
        setThread((current) => current.map((item) => item.id === messageId && item.role === "furvise" ? { ...item, suggestion: { ...editedSuggestion, error: null, uiStatus: "idle" } } : item));
        return;
      }
      if (action === "dismiss") {
        setThread((current) => updateMessageSuggestion(current, messageId, suggestion.id, { error: null, status: "dismissed", uiStatus: "dismissed" }));
        return;
      }
      const applyStatus = payload.status === "already_applied" ? "already_applied" : "applied";
      markAppDataChanged();
      setThread((current) => updateMessageSuggestion(current, messageId, suggestion.id, {
        ...(payload.suggestion || {}),
        applyStatus,
        careEntryId: payload.careEntryId || null,
        concernId: payload.concernId || suggestion.concernId || null,
        error: null,
        status: "saved",
        uiStatus: applyStatus,
      }));
      await refreshConversations().catch(() => undefined);
    } catch (applyError) {
      setThread((current) => updateMessageSuggestion(current, messageId, suggestion.id, {
        error: getFriendlySuggestionError(applyError),
        uiStatus: "failed",
      }));
    } finally {
      setThread((current) => updateMessageSuggestionIfSaving(current, messageId, suggestion.id));
    }
  }

  return (
    <AppPage layout="focused" shell="reading">
      <header>
        <PageHeader
          actions={<nav aria-label="Conversation actions" className="flex flex-wrap gap-2">
            {activeConversationId ? <button aria-label="Rename current conversation" className={quietButton} disabled={requestActive} onClick={() => { const target = conversations.find((item) => item.id === activeConversationId); if (target) { setRenameTarget(target); setRenameDraft(target.title); } }} title="Rename conversation" type="button">Rename</button> : null}
            <button className={secondaryButton} disabled={requestActive} onClick={() => setHistoryOpen(true)} type="button">Recent conversations</button>
            {activeConversationId || thread.length ? <button className={secondaryButton} disabled={requestActive} onClick={requestNewQuestion} type="button">New question</button> : null}
          </nav>}
          supportingText="Ask about changes, routines, products, or an upcoming vet visit."
          title={activeConversationId ? activeTitle : `Ask about ${petName}`}
        />
        {usage && selectedPet ? <AskUsageNotice petId={selectedPet} usage={usage} /> : null}
      </header>

      {loading ? <Status text="Getting your pet's space ready..." /> : null}
      {!loading && profiles.length === 0 ? <Status text="Choose a pet so Furvise knows who you're asking about." tone="warn" /> : null}
      {error ? <Status text={error} tone="warn" /> : null}
      {status ? <Status text={status} /> : null}
      {persistenceWarning ? <Status text={persistenceWarning} tone="warn" /> : null}

      {!loading && profiles.length ? (
        <div className="mt-7 min-w-0">
          <CompactPetSelector activeProfile={activeProfile} disabled={requestActive} onChange={switchPet} profiles={profiles} selectedPet={selectedPet} />
          <main className="min-w-0">
            <section aria-label="Conversation with Furvise" className={`flex w-full flex-col ${thread.length || requestActive ? "min-h-[66vh]" : ""}`}>
              <div aria-live="polite" className="flex-1 space-y-8">
                {!thread.length && !submitting ? <EmptyConversation petName={petName} onSelect={(prompt) => selectSuggestion(prompt, "empty_state")} /> : null}
                {thread.map((message, index) => message.role === "user"
                  ? <UserMessage key={message.id} text={message.text} />
                  : <FurviseMessage key={message.id} likelyVetConcern={hasLikelyVetConcern(thread, index)} message={message} onAction={runAction} onSuggestionAction={(suggestion, action, details) => applyStateSuggestion(message.id, suggestion, action, details)} />)}
                {requestActive ? <Thinking petName={petName} /> : null}
                {failedRequest ? <AskFailureState code={failedRequest.code} onEdit={editFailedMessage} onRetry={() => void ask(failedRequest.payload.question, "composer", failedRequest)} planId={usage?.planId} retryAfterSeconds={failedRequest.retryAfterSeconds} /> : null}
                <div aria-hidden="true" ref={conversationEndRef} />
              </div>
              {latestAnswer && latestAnswer.response.urgency !== "urgent" ? <SuggestedQuestions onSelect={(suggestion) => selectSuggestion(suggestion, "response_suggestion")} suggestions={latestAnswer.response.suggestedQuestions} /> : null}
              <div className={`app-sticky-composer sticky ${hasThread ? "lg:sticky" : "lg:relative"} mt-4 bg-[var(--surface-page)] pt-1`} data-ui="ask-composer-region">
                <Composer disabled={composerUnavailable} hasThread={hasThread} inputRef={composerRef} loading={requestActive} onChange={setQuestion} onSubmit={submit} petName={petName} value={question} />
                <p className="mt-2 text-center text-xs leading-5 text-[var(--pw-subtle)]">Furvise organizes care information and does not replace a veterinarian.</p>
              </div>
            </section>
          </main>
        </div>
      ) : null}

      {historyOpen ? <RecentConversations conversations={conversations} error={conversationListError} onClose={() => setHistoryOpen(false)} onDelete={setDeleteTarget} onOpen={(id) => void openConversation(id)} onRename={(item) => { setRenameTarget(item); setRenameDraft(item.title); }} onRetry={() => void refreshConversations()} /> : null}
      {pendingNewQuestion ? <ConfirmDialog description={`Your current conversation will stay in ${petName}\u2019s history.`} onCancel={() => setPendingNewQuestion(false)} onConfirm={startNewQuestion} title="Start a new question?" confirmLabel="Start new question" cancelLabel="Keep writing" /> : null}
      {renameTarget ? <RenameDialog loading={false} onCancel={() => setRenameTarget(null)} onChange={setRenameDraft} onConfirm={() => void renameConversation()} value={renameDraft} /> : null}
      {deleteTarget ? <ConfirmDialog description={`Delete \u201c${deleteTarget.title}\u201d? This cannot be undone.`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void deleteConversation()} title="Delete conversation?" confirmLabel="Delete" cancelLabel="Cancel" danger /> : null}
      {saveTarget ? <SaveDialog draft={saveDraft} loading={submitting} onCancel={() => setSaveTargetId(null)} onChange={setSaveDraft} onConfirm={confirmSave} petName={petName} /> : null}
    </AppPage>
  );
}

function EmptyConversation({ petName, onSelect }: { petName: string; onSelect: (prompt: string) => void }) {
  return <section className="pb-4 pt-7 sm:pt-9">
    <h2 className="text-2xl font-semibold text-[var(--text-primary)]">What would you like help with?</h2>
    <p className="mt-3 max-w-2xl leading-7 text-[var(--text-secondary)]">Ask about routines, changes you have noticed, products, or an upcoming vet visit.</p>
    <div className="mt-6 max-w-3xl border-t border-[var(--line)]">{emptyStarters.map((starter) => { const label = starter.replace("{pet}", petName); return <button className="group flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 border-b border-[var(--line)] px-2 text-left text-sm font-semibold text-[var(--ghost-action-foreground)] transition-colors hover:bg-[var(--selection)] hover:text-[var(--selected-text)] active:bg-[var(--surface-interactive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pw-focus-ring)]" data-ui="starter-question" key={starter} onClick={() => onSelect(label)} type="button"><span>{label}</span><span aria-hidden="true" className="shrink-0 transition-transform group-hover:translate-x-0.5">→</span></button>; })}</div>
  </section>;
}

function UserMessage({ text }: { text: string }) {
  return <article aria-label="You" className="border-b border-[var(--line)] pb-6"><p className="text-sm font-medium text-[var(--text-tertiary)]">You</p><p className="mt-2 whitespace-pre-wrap text-[1.02rem] leading-7 text-[var(--text-primary)]">{text}</p></article>;
}

function FurviseMessage({ likelyVetConcern, message, onAction, onSuggestionAction }: { likelyVetConcern: boolean; message: Extract<ConversationMessage, { role: "furvise" }>; onAction: (action: AnswerAction, message: Extract<ConversationMessage, { role: "furvise" }>) => void; onSuggestionAction: (suggestion: StateSuggestion, action: "save" | "monitor" | "dismiss" | "edit", details?: string) => Promise<void> }) {
  const { response } = message;
  const configuredActions: AnswerAction[] = likelyVetConcern && response.urgency !== "urgent" ? ["prepare_vet_note", "copy"] : response.actions;
  const actions = [...new Set(configuredActions)].filter((action) => {
    const saves = action === "save_key_detail" || action === "add_to_care_history" || action === "start_tracking";
    return !saves || Boolean(message.saveMetadata?.saveable);
  }).slice(0, 2);
  const urgent = response.urgency === "urgent";
  const monitoring = response.urgency === "monitor";
  const resolved = response.urgency === "resolved";
  return <article className={urgent
    ? "rounded-2xl border border-[var(--pw-danger-border)] bg-[var(--pw-danger-surface)] p-5 sm:p-6"
    : monitoring ? "rounded-2xl border border-[var(--pw-warning-border)] bg-[var(--pw-warning-surface)] p-5 sm:p-6"
      : resolved ? "rounded-2xl border border-[var(--selection-strong)] bg-[var(--surface-supportive)] p-5 sm:p-6" : ""}>
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--pw-heading)]"><BrandMark showName={false} size={24} /><span>Furvise</span></div>
    {shouldShowAnswerHeading(response.title) ? <h2 className="text-xl font-semibold leading-8 text-[var(--pw-heading)]">{response.title}</h2> : null}
    <p className={shouldShowAnswerHeading(response.title) ? "mt-2 text-[1.05rem] leading-8 text-[var(--pw-text)]" : "text-[1.05rem] leading-8 text-[var(--pw-text)]"}>{response.directAnswer}</p>
    {response.supportingText ? <p className="mt-3 leading-7 text-[var(--pw-muted)]">{response.supportingText}</p> : null}
    <AdaptiveSections answerType={response.answerType} sections={response.sections} />
    {actions.length ? <div className="mt-5 flex flex-wrap gap-2">{actions.map((action) => <button className={secondaryButton} key={action} onClick={() => onAction(action, message)} type="button">{formatAction(action)}</button>)}</div> : null}
    {message.suggestion && message.suggestion.status !== "saved" && !message.suggestion.applyStatus ? <StateUpdateSuggestion onAction={onSuggestionAction} suggestion={message.suggestion} /> : null}
    {getPersistenceNotices(message).map((notice) => <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)]" data-persistence-notice={notice.type} key={notice.key}>{notice.label}</p>)}
    {message.carePersistence?.status === "failed" ? <p className="mt-3 text-xs font-semibold text-[var(--pw-warning-text)]" role="status">This update could not be added to care history. Ask Furvise to save it to try again.</p> : null}
  </article>;
}

function StateUpdateSuggestion({ onAction, suggestion }: { onAction: (suggestion: StateSuggestion, action: "save" | "monitor" | "dismiss" | "edit", details?: string) => Promise<void>; suggestion: StateSuggestion }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.details || "");
  const resolution = suggestion.type === "concern_resolution";
  const uiStatus = suggestion.uiStatus || (suggestion.status === "saved" ? suggestion.applyStatus || "applied" : suggestion.status === "dismissed" ? "dismissed" : "idle");
  const working = uiStatus === "saving";
  function act(action: "save" | "monitor" | "dismiss" | "edit", details?: string) {
    if (working) return;
    void onAction(suggestion, action, details).then(() => { if (action === "edit") setEditing(false); }).catch(() => undefined);
  }
  if (uiStatus === "dismissed") return null;
  if (uiStatus === "applied" || uiStatus === "already_applied") return <p className="mt-3 text-xs font-semibold text-[var(--text-secondary)]">{uiStatus === "already_applied" ? "Already added to care history" : "Added to care history"}</p>;
  return <section aria-label={suggestion.title} className="mt-5 max-w-xl rounded-xl border border-[var(--line)] bg-[var(--surface-supportive)] p-4">
    <p className="text-sm font-semibold text-[var(--text-primary)]">{suggestion.title}</p>
    {editing ? <textarea aria-label="Edit suggested update" className={`${inputClass} mt-3 min-h-24 py-3`} onChange={(event) => setDraft(event.target.value)} value={draft} /> : suggestion.details ? <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{suggestion.details}</p> : null}
    {uiStatus === "failed" ? <p className="mt-3 text-sm font-medium text-[var(--pw-warning-text)]" role="status">{suggestion.error || "This improvement could not be saved."}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {editing ? <button className={secondaryButton} disabled={working || !draft.trim()} onClick={() => act("edit", draft.trim())} type="button">Save edit</button> : <button className={secondaryButton} disabled={working} onClick={() => act("save")} type="button">{working ? "Saving..." : uiStatus === "failed" ? "Try again" : resolution ? "Save improvement" : "Save"}</button>}
      {!resolution && !editing ? <button className={quietButton} disabled={working} onClick={() => setEditing(true)} type="button">Edit</button> : null}
      <button className={quietButton} disabled={working} onClick={() => editing ? setEditing(false) : act("dismiss")} type="button">{editing ? "Cancel" : "Not now"}</button>
    </div>
  </section>;
}

function shouldShowAnswerHeading(title: string) {
  return Boolean(title && !/^(?:Furvise|A\s+good\s+update|Greeting|What is missing|Next step)$/i.test(title.trim()));
}

function AdaptiveSections({ answerType, sections }: { answerType: AnswerType; sections: StructuredResponse["sections"] }) {
  if (!sections.length) return null;
  if (answerType === "care_plan") return <div className="mt-5 space-y-5">{sections.map((section) => <section key={section.heading}><h3 className={sectionHeading}>{section.heading}</h3><ol className="mt-2 list-decimal space-y-3 pl-6 leading-7 text-[var(--pw-text)]">{section.items.map((item, index) => <li className="pl-1" key={`${index}-${item}`}>{item}</li>)}</ol></section>)}</div>;
  if (answerType === "history_summary") return <div className="mt-5 border-l border-[var(--pw-border-strong)] pl-5">{sections.map((section) => <section className="mb-5 last:mb-0" key={section.heading}><h3 className={sectionHeading}>{section.heading}</h3><ul className="mt-2 space-y-2 leading-7 text-[var(--pw-text)]">{section.items.map((item) => <li key={item}>{item}</li>)}</ul></section>)}</div>;
  return <div className="mt-5 grid gap-5 md:grid-cols-2">{sections.map((section) => <section className="min-w-0" key={section.heading}><h3 className={sectionHeading}>{section.heading}</h3><ul className="mt-2 space-y-2 leading-7 text-[var(--pw-text)]">{section.items.map((item) => <li className="flex gap-3" key={item}><span aria-hidden="true" className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--pw-subtle)]" /><span>{item}</span></li>)}</ul></section>)}</div>;
}

function SuggestedQuestions({ onSelect, suggestions }: { onSelect: (suggestion: string) => void; suggestions: string[] }) {
  if (!suggestions.length) return null;
  return <div aria-label="Suggested follow-up questions" className="mt-7 flex snap-x gap-2 overflow-x-auto pb-2 sm:flex-wrap">{suggestions.slice(0, 3).map((suggestion) => <button className={`${suggestionButton} min-w-[15rem] snap-start sm:min-w-0`} key={suggestion} onClick={() => onSelect(suggestion)} type="button">{suggestion}</button>)}</div>;
}

function Composer({ disabled, hasThread, inputRef, loading, onChange, onSubmit, petName, value }: { disabled: boolean; hasThread: boolean; inputRef: React.RefObject<HTMLTextAreaElement | null>; loading: boolean; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; petName: string; value: string }) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }
  const placeholder = hasThread ? `Ask a follow-up about ${petName}\u2026` : `Ask anything about ${petName}\u2026`;
  const canSend = Boolean(value.trim()) && !disabled;
  return <form className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface-primary)] p-3 shadow-[var(--shadow-surface-2)]" onSubmit={onSubmit}>
    <div className="mb-2 flex items-center justify-between gap-3 px-1"><span className="text-xs font-semibold text-[var(--pw-primary)]">{petName}</span><span className="hidden text-xs text-[var(--pw-subtle)] sm:inline">Enter to send · Shift + Enter for a new line</span></div>
    <div className="flex items-end gap-2"><textarea aria-label={placeholder.replace("\u2026", "")} className="max-h-40 min-h-14 flex-1 resize-none rounded-lg bg-transparent px-2 py-3 text-base leading-6 text-[var(--pw-text)] outline-none placeholder:text-[var(--pw-placeholder)] focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]" disabled={disabled} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} placeholder={placeholder} ref={inputRef} value={value} /><PrimaryButton aria-label="Send question" className="mb-1 min-h-11 min-w-16 px-4" disabled={!canSend} loading={loading} type="submit">Ask</PrimaryButton></div>
  </form>;
}

function Thinking({ petName }: { petName: string }) { return <div className="flex items-center gap-3 py-3 text-sm text-[var(--pw-muted)]" role="status"><BrandMark showName={false} size={24} /><span>{`Furvise is reviewing ${petName}'s saved details...`}</span></div>; }

function AskFailureState({ code, onEdit, onRetry, planId, retryAfterSeconds }: { code: AskFailureCode; onEdit: () => void; onRetry: () => void; planId?: "free" | "plus"; retryAfterSeconds?: number }) {
  const presentation = getAskErrorPresentation(code, retryAfterSeconds);
  const message = code === "UNKNOWN_ERROR"
    ? FURVISE_ANSWER_UNAVAILABLE_MESSAGE
    : code === "AI_RATE_LIMITED"
      ? `${presentation.message} No AI credit was used.`
      : presentation.message;
  return <div className="max-w-xl rounded-xl border border-[var(--line)] bg-[var(--surface-primary)] px-4 py-4 text-sm text-[var(--text-secondary)]" role="alert">
    <h2 className="font-semibold text-[var(--text-primary)]">{presentation.title}</h2>
    <p className="mt-1 leading-6">{message}</p>
    {presentation.recommendedAction !== "wait" ? <div className="mt-3 flex flex-wrap gap-2">
      {presentation.recommendedAction === "sign_in" ? <Link className={secondaryButton} href="/login?next=%2Fask">Sign in</Link> : null}
      {presentation.recommendedAction === "saved_data" ? <><Link className={secondaryButton} href="/pets">Back to pets</Link><Link className={quietButton} href="/care-log">View history</Link></> : null}
      {code === "AI_CREDITS_EXHAUSTED" && planId === "free" ? <Link className={secondaryButton} href="/membership">Upgrade to Plus</Link> : null}
      {presentation.retryable ? <button className={secondaryButton} onClick={onRetry} type="button">Try again</button> : null}
      {presentation.recommendedAction === "edit" || presentation.retryable ? <button className={quietButton} onClick={onEdit} type="button">Edit question</button> : null}
    </div> : null}
  </div>;
}

function CompactPetSelector({ activeProfile, disabled, onChange, profiles, selectedPet }: { activeProfile: DogProfileWithMemories | null; disabled: boolean; onChange: (id: string) => void; profiles: DogProfileWithMemories[]; selectedPet: string }) {
  if (!activeProfile) return null;
  return <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-[var(--line)] py-3"><label className="text-sm font-medium text-[var(--text-secondary)]" htmlFor="ask-pet-select">Asking about</label><select className="min-h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--surface-interactive)] px-3 text-sm font-semibold text-[var(--text-primary)]" disabled={disabled} id="ask-pet-select" onChange={(event) => onChange(event.target.value)} value={selectedPet}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{formatPetDisplayName(profile.name)}</option>)}</select><span className="text-sm text-[var(--text-tertiary)]">{formatSpecies(activeProfile.species)}{formatAge(activeProfile) ? ` · ${formatAge(activeProfile)}` : ""}</span></div>;
}

function RecentConversations({ conversations, error, onClose, onDelete, onOpen, onRename, onRetry }: { conversations: AskConversationSummary[]; error: string; onClose: () => void; onDelete: (item: AskConversationSummary) => void; onOpen: (id: string) => void; onRename: (item: AskConversationSummary) => void; onRetry: () => void }) {
  useEffect(() => { const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose]);
  return <div className="fixed inset-0 z-[var(--z-dialog)] flex justify-end bg-[var(--pw-overlay)]" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><aside aria-label="Recent conversations" aria-modal="true" className="h-full w-full max-w-md overflow-y-auto bg-[var(--pw-surface)] p-5 shadow-2xl" role="dialog"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-[var(--pw-heading)]">Recent conversations</h2><p className="mt-1 text-sm text-[var(--pw-muted)]">Open a past question and answer.</p></div><button aria-label="Close recent conversations" className={quietButton} onClick={onClose} type="button">Close</button></div>{error ? <div className="mt-5 rounded-xl border border-[var(--pw-warning-border)] p-3 text-sm text-[var(--pw-warning-text)]" role="status"><p>{error}</p><button className={`${quietButton} mt-2`} onClick={onRetry} type="button">Retry</button></div> : null}{conversations.length ? <ul className="mt-6 divide-y divide-[var(--pw-border)]">{conversations.map((item) => <li className="py-4" key={item.id}><button className="w-full text-left" onClick={() => onOpen(item.id)} type="button"><span className="block font-semibold text-[var(--pw-heading)]">{item.title}</span><span className="mt-1 block text-xs font-medium text-[var(--pw-subtle)]">{formatPetDisplayName(item.petName)} · {formatConversationDate(item.lastActivityAt)}</span><span className="mt-2 block line-clamp-2 text-sm leading-6 text-[var(--pw-muted)]">{item.preview}</span></button><div className="mt-2 flex gap-3"><button className={quietButton} onClick={() => onOpen(item.id)} type="button">Open</button><button className={quietButton} onClick={() => onRename(item)} type="button">Rename</button><button className={`${quietButton} text-[var(--pw-danger-text)]`} onClick={() => onDelete(item)} type="button">Delete</button></div></li>)}</ul> : !error ? <WorkflowEmptyState title="No conversations yet" text="Questions you ask Furvise will appear here." /> : null}</aside></div>;
}

function ConfirmDialog({ cancelLabel, confirmLabel, danger = false, description, onCancel, onConfirm, title }: { cancelLabel: string; confirmLabel: string; danger?: boolean; description: string; onCancel: () => void; onConfirm: () => void; title: string }) {
  return <WorkflowDialog title={title}><p className="mt-2 leading-7 text-[var(--pw-muted)]">{description}</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className={modalSecondaryButton} onClick={onCancel} type="button">{cancelLabel}</button>{danger ? <button className={dangerButton} onClick={onConfirm} type="button">{confirmLabel}</button> : <PrimaryButton onClick={onConfirm} type="button">{confirmLabel}</PrimaryButton>}</div></WorkflowDialog>;
}

function RenameDialog({ loading, onCancel, onChange, onConfirm, value }: { loading: boolean; onCancel: () => void; onChange: (value: string) => void; onConfirm: () => void; value: string }) {
  return <WorkflowDialog title="Rename conversation"><label className="mt-5 block text-sm font-semibold text-[var(--pw-heading)]">Conversation title<input autoFocus className={`${inputClass} mt-2`} maxLength={80} onChange={(event) => onChange(event.target.value)} value={value} /></label><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className={modalSecondaryButton} onClick={onCancel} type="button">Cancel</button><PrimaryButton disabled={loading || !value.trim()} loading={loading} onClick={onConfirm} type="button">Save title</PrimaryButton></div></WorkflowDialog>;
}

function SaveDialog({ draft, loading, onCancel, onChange, onConfirm, petName }: { draft: string; loading: boolean; onCancel: () => void; onChange: (value: string) => void; onConfirm: () => void; petName: string }) {
  return <WorkflowDialog title={`Save this to ${petName}'s care history?`}><p className="mt-2 text-sm leading-6 text-[var(--pw-muted)]">Review the exact detail before saving. You can edit it now.</p><textarea className={`${inputClass} mt-5 min-h-36 py-3`} onChange={(event) => onChange(event.target.value)} value={draft} /><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button className={modalSecondaryButton} onClick={onCancel} type="button">Cancel</button><PrimaryButton disabled={loading || !draft.trim()} loading={loading} onClick={onConfirm} type="button">Save detail</PrimaryButton></div></WorkflowDialog>;
}


function hasLikelyVetConcern(thread: ConversationMessage[], assistantIndex: number) { const answer = thread[assistantIndex]; if (answer?.role !== "furvise" || answer.response.urgency === "urgent") return false; if (answer.response.answerType === "vet_prep") return true; const question = [...thread.slice(0, assistantIndex)].reverse().find((message) => message.role === "user"); return question?.role === "user" && /\b(vet|veterinarian|appointment|visit)\b/i.test(question.text); }
function formatAge(profile: DogProfileWithMemories) { return profile.age_value === null || !profile.age_unit ? "" : `${profile.age_value} ${profile.age_unit}`; }
function formatAction(action: AnswerAction) { return ({ add_to_care_history: "Save to care history", copy: "Copy", prepare_vet_note: "Prepare vet brief", save_key_detail: "Save useful detail", start_tracking: "Start tracking" } as const)[action]; }

function parseConversationDetail(detail: AskConversationDetail): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const message of detail.messages) {
    if (message.role === "user") messages.push({ failed: message.failed, id: message.id, requestId: message.requestId, role: "user", text: message.text });
    else { const response = parseAskConversationResponse(message.response) as StructuredResponse | null; if (response) { const carePersistence = parseCarePersistence(message.carePersistence); messages.push({ automaticSaveConfirmation: carePersistence?.status === "persisted" && carePersistence.careEntryIds.length ? "Added to care history" : null, carePersistence, contextUsed: parseContextUsed(message.contextUsed), id: message.id, response, role: "furvise", saveMetadata: parseStoredSaveMetadata(message.saveMetadata), suggestion: parseStateSuggestion(message.suggestion) }); } }
  }
  return messages;
}
function parseLegacyThread(value: unknown): ConversationMessage[] { if (!Array.isArray(value)) return []; const messages: ConversationMessage[] = []; for (const item of value.slice(-40)) { if (!item || typeof item !== "object") continue; const draft = item as { id?: unknown; role?: unknown; text?: unknown; response?: unknown; saveMetadata?: unknown; contextUsed?: unknown }; if (draft.role === "user" && typeof draft.text === "string") messages.push({ id: typeof draft.id === "string" ? draft.id : createMessageId("user"), role: "user", text: draft.text.slice(0, 1200) }); else if (draft.role === "furvise") { const response = parseAskConversationResponse(draft.response) as StructuredResponse | null; if (response) messages.push({ contextUsed: parseContextUsed(draft.contextUsed), id: typeof draft.id === "string" ? draft.id : createMessageId("furvise"), response, role: "furvise", saveMetadata: parseStoredSaveMetadata(draft.saveMetadata) }); } } return messages; }
function parseContextUsed(value: unknown): ContextUsed | null { if (!value || typeof value !== "object") return null; const draft = value as { petName?: unknown; usedSources?: unknown }; return { petName: typeof draft.petName === "string" ? draft.petName : null, usedSources: Array.isArray(draft.usedSources) ? draft.usedSources.filter((item): item is string => typeof item === "string").slice(0, 8) : [] }; }
function parseCarePersistence(value: unknown): CarePersistence | null { if (!value || typeof value !== "object") return null; const draft = value as Partial<CarePersistence>; if (!draft.status || !["persisted", "suggested", "skipped", "failed"].includes(draft.status)) return null; return { status: draft.status, careEntryIds: Array.isArray(draft.careEntryIds) ? draft.careEntryIds.filter((id): id is string => typeof id === "string") : [], concernIds: Array.isArray(draft.concernIds) ? draft.concernIds.filter((id): id is string => typeof id === "string") : [], errorCode: typeof draft.errorCode === "string" ? draft.errorCode : null, memoryIds: Array.isArray(draft.memoryIds) ? draft.memoryIds.filter((id): id is string => typeof id === "string") : [], profileUpdated: draft.profileUpdated === true }; }
function parseStateSuggestion(value: unknown): StateSuggestion | null { if (!value || typeof value !== "object") return null; const draft = value as Partial<StateSuggestion>; if (typeof draft.id !== "string" || typeof draft.title !== "string" || !draft.type || !["history", "memory", "concern_resolution", "concern_opening"].includes(draft.type)) return null; return { applyStatus: draft.applyStatus, careEntryId: typeof draft.careEntryId === "string" ? draft.careEntryId : null, concernId: typeof draft.concernId === "string" ? draft.concernId : null, id: draft.id, type: draft.type, title: draft.title, details: typeof draft.details === "string" ? draft.details : null, status: draft.status }; }
function parseStoredSaveMetadata(value: unknown): AskSaveMetadata | null { if (!value || typeof value !== "object") return null; const draft = value as Partial<AskSaveMetadata>; if (typeof draft.answerType !== "string" || typeof draft.saveCategory !== "string" || typeof draft.saveDetail !== "string" || typeof draft.saveTitle !== "string" || typeof draft.saveable !== "boolean") return null; return { answerType: draft.answerType, cannotAnswerFromSavedData: Boolean(draft.cannotAnswerFromSavedData), saveCategory: draft.saveCategory as CareEntryCategory, saveDetail: draft.saveDetail.slice(0, 500), saveDetailPreview: typeof draft.saveDetailPreview === "string" ? draft.saveDetailPreview.slice(0, 220) : "", saveDisabledReason: typeof draft.saveDisabledReason === "string" ? draft.saveDisabledReason : "", saveTitle: draft.saveTitle.slice(0, 120), saveable: draft.saveable, usedSavedFactsCount: typeof draft.usedSavedFactsCount === "number" ? Math.max(0, draft.usedSavedFactsCount) : 0 }; }

async function importLegacyConversation(petId: string, known: AskConversationSummary[]) {
  if (known.some((item) => item.petId === petId) || typeof window === "undefined") return;
  try {
    const key = `furvise:ask-thread:${petId}`;
    const raw = window.sessionStorage.getItem(key);
    const messages = raw ? parseLegacyThread(JSON.parse(raw)) : [];
    if (!messages.some((message) => message.role === "furvise")) return;
    await conversationJson("/api/ask/conversations", { method: "POST", body: JSON.stringify({ messages, petId }) });
    window.sessionStorage.removeItem(key);
  } catch { /* A legacy session remains available for a later migration attempt. */ }
}
function getDraftKey(conversationId: string | null, petId: string) { return `furvise:ask-draft:${conversationId || `new:${petId}`}`; }
function replaceAskLocation({ conversationId, petId }: { conversationId?: string; petId?: string }) {
  const params = new URLSearchParams();
  if (conversationId) params.set("conversation", conversationId);
  else if (petId) params.set("pet", petId);
  window.history.replaceState(null, "", `/ask${params.size ? `?${params.toString()}` : ""}`);
}
function readStoredActivePetId() { try { return typeof window === "undefined" ? "" : getActivePetId(window.localStorage); } catch { return ""; } }
function persistActivePetId(petId: string) { try { if (typeof window !== "undefined") setActivePetId(window.localStorage, petId); } catch { /* Selection remains valid for this mounted Ask session. */ } }
function readDraft(key: string) { try { return typeof window === "undefined" ? "" : window.localStorage.getItem(key) || ""; } catch { return ""; } }
function createMessageId(role: string) { return `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
class AskRequestError extends Error { constructor(public code: AskFailureCode, message = "", public retryAfterSeconds?: number) { super(message); } }
class SuggestionApplyError extends Error { constructor(public code: string, message = "") { super(message); this.name = "SuggestionApplyError"; } }
function getAskFailure(error: unknown): { code: AskFailureCode; retryAfterSeconds?: number } { if (error instanceof AskRequestError) return { code: error.code, retryAfterSeconds: error.retryAfterSeconds }; if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) return { code: "REQUEST_TIMEOUT" }; if (error instanceof TypeError) return { code: "NETWORK_ERROR" }; return { code: "UNKNOWN_ERROR" }; }
function logAskCareSaveFailure(error: unknown) { if (process.env.NODE_ENV === "production") return; const databaseError = error as { code?: string; message?: string }; console.warn("[Furvise ask] care entry save failed", { errorCode: databaseError?.code || "", errorMessage: databaseError?.message || "" }); }
async function getAskAuthToken() { const client = getBrowserSupabase(); const { data } = client ? await client.auth.getSession() : { data: { session: null } }; return data.session?.access_token || ""; }
async function suggestionJson(url: string, init: RequestInit = {}) {
  const token = await getAskAuthToken();
  if (!token) throw new SuggestionApplyError("SUGGESTION_FORBIDDEN", "Please sign in again.");
  const method = (init.method || "GET").toUpperCase();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) };
  const response = method === "GET"
    ? await fetch(url, { ...init, headers })
    : await idempotentClientFetch(url, { ...init, headers }, `suggestion:${method}:${url}`);
  const payload = await response.json().catch(() => null) as { careEntryId?: string | null; code?: string; concernId?: string | null; error?: string; status?: string; suggestion?: StateSuggestion } | null;
  if (!response.ok) throw new SuggestionApplyError(payload?.code || "SUGGESTION_PERSISTENCE_FAILED", payload?.error || "This improvement could not be saved.");
  return payload || {};
}
function getFriendlySuggestionError(error: unknown) {
  if (error instanceof SuggestionApplyError && error.code === "SUGGESTION_FORBIDDEN") return "Please sign in again, then try saving this improvement.";
  if (error instanceof SuggestionApplyError && error.code === "SUGGESTION_INVALID") return "This improvement no longer has enough information to save.";
  if (error instanceof SuggestionApplyError && error.code === "SUGGESTION_CONFLICT") return "A newer update changed this concern. Refresh and try again.";
  return "This improvement could not be saved.";
}
function updateMessageSuggestion(thread: ConversationMessage[], messageId: string, suggestionId: string, patch: Partial<StateSuggestion>) {
  return thread.map((item) => item.id === messageId && item.role === "furvise" && item.suggestion?.id === suggestionId
    ? { ...item, suggestion: { ...item.suggestion, ...patch } }
    : item);
}
function updateMessageSuggestionIfSaving(thread: ConversationMessage[], messageId: string, suggestionId: string) {
  return thread.map((item) => item.id === messageId && item.role === "furvise" && item.suggestion?.id === suggestionId && item.suggestion.uiStatus === "saving"
    ? { ...item, suggestion: { ...item.suggestion, uiStatus: "idle" as const } }
    : item);
}
async function conversationJson(url: string, init: RequestInit = {}) { const token = await getAskAuthToken(); if (!token) throw new Error("Please sign in again."); const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }; const method = (init.method || "GET").toUpperCase(); const response = method === "GET" ? await fetch(url, { ...init, headers }) : await idempotentClientFetch(url, { ...init, headers }, `conversation:${method}:${url}`); if (response.status === 204) return {}; const payload = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(payload?.error || "Conversation history is temporarily unavailable."); return payload || {}; }
async function fetchConversationList() { const payload = await conversationJson("/api/ask/conversations") as { conversations?: AskConversationSummary[] }; return payload.conversations || []; }
async function fetchAskUsage() { try { const token = await getAskAuthToken(); if (!token) return null; const response = await fetch("/api/ask", { headers: { Authorization: `Bearer ${token}` }, method: "GET" }); const payload = await response.json().catch(() => null) as { usage?: AskUsageStatus | null } | null; return response.ok && payload?.usage ? payload.usage : null; } catch { return null; } }
function Status({ action, text, tone = "neutral" }: { action?: { label: string; onClick: () => void }; text: string; tone?: "neutral" | "warn" }) { return <div className={`mx-auto mt-5 flex max-w-[78rem] items-center justify-between gap-3 border-y px-1 py-3 text-sm leading-6 ${tone === "warn" ? "border-[var(--pw-warning-border)] text-[var(--pw-warning-text)]" : "border-[var(--pw-border)] text-[var(--pw-muted)]"}`} role="status"><span>{text}</span>{action ? <button className={secondaryButton} onClick={action.onClick} type="button">{action.label}</button> : null}</div>; }

const inputClass = "min-h-11 w-full rounded-xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-3 text-sm text-[var(--pw-text)] outline-none focus:border-[var(--pw-primary)] focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]";
const suggestionButton = "rounded-xl border border-[var(--selection-strong)] bg-[var(--surface-supportive)] px-4 py-3 text-left text-sm font-semibold leading-5 text-[var(--pw-text)] shadow-[0_4px_12px_var(--shadow)] transition hover:border-[var(--pw-primary)] hover:text-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--pw-border-strong)] bg-transparent px-3.5 text-sm font-semibold text-[var(--pw-text)] hover:border-[var(--pw-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]";
const quietButton = "inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-[var(--pw-muted)] hover:bg-[var(--pw-card-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pw-primary)]";
const modalSecondaryButton = "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--pw-border-strong)] px-5 text-sm font-semibold text-[var(--pw-text)]";
const dangerButton = "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--pw-danger)] px-5 text-sm font-semibold text-[var(--pw-danger-foreground)] hover:bg-[var(--pw-danger-hover)]";
const sectionHeading = "text-sm font-semibold uppercase tracking-[0.08em] text-[var(--pw-muted)]";
