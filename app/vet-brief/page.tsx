"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { AppPage } from "../components/app-page";
import { appPageContainer } from "../components/product-primitives";
import { vetBriefText } from "../lib/vet-brief/report";
import { VetBriefDocumentView } from "../components/vet-brief-document";
import { WorkflowDocumentStatus } from "../components/workflow-primitives";
import { downloadGeneratedFile } from "../lib/furvise-output";
import { trackAskEvent } from "../lib/ask-analytics";
import { useRequireConfirmedSupabaseAuth } from "../lib/auth-session";
import { getBrowserSupabase } from "../lib/supabase";
import { getOrCreateClientMutationKey, idempotentClientFetch } from "../lib/security/idempotency/client";
import { getVetBriefFilename, parseVetBriefDocument } from "../lib/vet-brief/schema";
import type { VetBriefDatedItem, VetBriefDocument, VetBriefHistoryItem, VetBriefRecord, VetBriefSectionId } from "../lib/vet-brief/types";
import { readVetBriefClientDraft, removeVetBriefClientDraft, saveVetBriefClientDraft } from "../lib/vet-brief/client-drafts";

const outline: Array<{ id: VetBriefSectionId; label: string }> = [
  { id: "visit-reason", label: "Visit reason" },
  { id: "changes-noticed", label: "Changes noticed" },
  { id: "timeline", label: "Timeline" },
  { id: "food-products", label: "Food and products" },
  { id: "medications", label: "Medications" },
  { id: "care-history", label: "Care history" },
  { id: "questions", label: "Questions" },
  { id: "owner-notes", label: "Owner notes" },
];

export default function VetBriefPage() { return <Suspense fallback={<AppPage>{null}</AppPage>}><VetBriefPageContent /></Suspense>; }

function VetBriefPageContent() {
  const searchParams = useSearchParams();
  const { status: authStatus, user } = useRequireConfirmedSupabaseAuth();
  const petId = searchParams.get("pet") || "";
  const existingBriefId = searchParams.get("brief") || "";
  const source = searchParams.get("source") || "";
  const conversationId = searchParams.get("conversation") || "";
  if (authStatus !== "signedIn" || !user) return <AppPage>{null}</AppPage>;
  return <VetBriefWorkspace conversationId={conversationId} existingBriefId={existingBriefId} key={`${user.id}:${petId}:${existingBriefId || "new"}`} petId={petId} source={source} userId={user.id} />;
}

function VetBriefWorkspace({ conversationId, existingBriefId, petId, source, userId }: { conversationId: string; existingBriefId: string; petId: string; source: string; userId: string }) {
  const router = useRouter();
  const defaults = getDefaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [document, setDocument] = useState<VetBriefDocument | null>(null);
  const [sourceEntryIds, setSourceEntryIds] = useState<string[]>([]);
  const [documentPetId, setDocumentPetId] = useState(petId);
  const [confirmed, setConfirmed] = useState<VetBriefRecord | null>(null);
  const [previousVersionId, setPreviousVersionId] = useState<string | null>(null);
  const [mode, setMode] = useState<"review" | "preview">("preview");
  const [editingEmpty, setEditingEmpty] = useState<Set<VetBriefSectionId>>(new Set());
  const [paperSize, setPaperSize] = useState<"letter" | "a4">("letter");
  const [needsPurpose, setNeedsPurpose] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (existingBriefId) {
          const payload = await authenticatedJson(`/api/vet-briefs/${encodeURIComponent(existingBriefId)}`) as { brief?: VetBriefRecord };
          if (!active || !payload.brief) return;
          if (petId && payload.brief.petProfileId !== petId) throw new Error("That Vet Visit Brief does not belong to the selected pet.");
          const scope = { briefId: payload.brief.id, petId: payload.brief.petProfileId, userId };
          const savedDraft = readVetBriefClientDraft(window.localStorage, scope);
          setDocument(savedDraft?.document || payload.brief.document);
          setDocumentPetId(payload.brief.petProfileId);
          setSourceEntryIds(savedDraft?.sourceEntryIds || payload.brief.sourceEntryIds || []);
          setConfirmed(savedDraft ? null : payload.brief);
          if (!savedDraft) setMode("preview");
          setPreviousVersionId(payload.brief.id);
          setFrom(savedDraft?.document.dateRange.from || payload.brief.dateRange.from);
          setTo(savedDraft?.document.dateRange.to || payload.brief.dateRange.to);
          if (savedDraft) setStatus("Your saved draft has been restored.");
        } else {
          if (!petId) throw new Error("Choose a pet before preparing a Vet Visit Brief.");
          await validateDraftScope(petId);
          if (!active) return;
          const savedDraft = readVetBriefClientDraft(window.localStorage, { briefId: null, petId, userId });
          if (savedDraft) {
            setDocument(savedDraft.document);
            setDocumentPetId(petId);
            setSourceEntryIds(savedDraft.sourceEntryIds);
            setFrom(savedDraft.document.dateRange.from);
            setTo(savedDraft.document.dateRange.to);
            setStatus("Your saved draft has been restored.");
            return;
          }
          setNeedsPurpose(true);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "The Vet Visit Brief could not be prepared.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [existingBriefId, petId, source, conversationId, userId]);

  const documentStatus = confirmed ? "Confirmed" : previousVersionId ? "New version in progress" : "Draft";
  const retrospective = document?.title === "Furvise Care History Summary";

  async function prepareBrief(event: FormEvent) {
    event.preventDefault();
    if (!purpose.trim() || loading) return;
    setLoading(true); setError("");
    try {
      const draft = await fetchDraft(petId, from, to, source === "ask" ? conversationId : "", null, purpose);
      setDocument(draft.document); setSourceEntryIds(draft.sourceEntryIds);
      setNeedsPurpose(false); setMode("preview");
    } catch (error) { setError(error instanceof Error ? error.message : "The brief could not be prepared."); }
    finally { setLoading(false); }
  }

  async function refreshRange(event: FormEvent) {
    event.preventDefault();
    if (!documentPetId || from > to) return;
    setLoading(true); setError("");
    try {
      const draft = await fetchDraft(documentPetId, from, to, source === "ask" ? conversationId : "", document);
      setDocument(draft.document); setSourceEntryIds(draft.sourceEntryIds); setConfirmed(null);
      setStatus("Date range updated. Review the refreshed brief before confirming.");
    } catch (rangeError) { setError(rangeError instanceof Error ? rangeError.message : "The date range could not be updated."); }
    finally { setLoading(false); }
  }

  async function confirmBrief() {
    if (!document || !documentPetId) return;
    const checked = parseVetBriefDocument(document);
    if (!checked) { setError("Review the brief fields before confirming it."); return; }
    setSaving(true); setError("");
    try {
      const payload = await authenticatedJson("/api/vet-briefs", { method: "POST", body: JSON.stringify({ document: checked, petId: documentPetId, previousVersionId, sourceEntryIds }) }) as { brief?: VetBriefRecord };
      if (!payload.brief) throw new Error("The brief could not be saved.");
      setDocument(payload.brief.document); setConfirmed(payload.brief); setPreviousVersionId(payload.brief.id); setMode("preview");
      removeVetBriefClientDraft(window.localStorage, { briefId: previousVersionId, petId: documentPetId, userId });
      setStatus(`Version ${payload.brief.version} confirmed.`);
      trackAskEvent("vet_note_created", { action: "confirmed" });
      const params = new URLSearchParams({ pet: documentPetId, brief: payload.brief.id });
      if (source) params.set("source", source);
      if (conversationId) params.set("conversation", conversationId);
      router.replace(`/vet-brief?${params.toString()}`, { scroll: false });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The brief could not be saved."); }
    finally { setSaving(false); }
  }

  function editDocument(update: (current: VetBriefDocument) => VetBriefDocument) {
    setDocument((current) => current ? update(current) : current);
    if (confirmed) setStatus("Your edits are a new version in progress.");
    setConfirmed(null);
  }

  function saveDraft() {
    if (!document || !documentPetId) return;
    try {
      saveVetBriefClientDraft(window.localStorage, { briefId: previousVersionId, petId: documentPetId, userId }, { document, sourceEntryIds });
      setStatus("Draft saved on this device.");
    } catch { setError("The draft could not be saved on this device."); }
  }

  function createNewVersion() {
    setConfirmed(null);
    setMode("review");
    setStatus("New version in progress. The confirmed version remains unchanged.");
  }

  function focusSection(id: VetBriefSectionId) {
    setMode("review");
    requestAnimationFrame(() => {
      const section = documentGlobal().getElementById(`brief-section-${id}`);
      if (section instanceof HTMLDetailsElement) section.open = true;
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function addEmptySection(id: VetBriefSectionId) {
    setEditingEmpty((current) => new Set([...current, id]));
    if (document?.excludedSections.includes(id)) toggleSection(id, true);
    focusSection(id);
  }

  function toggleSection(id: VetBriefSectionId, include: boolean) {
    editDocument((current) => ({ ...current, excludedSections: include ? current.excludedSections.filter((item) => item !== id) : [...new Set([...current.excludedSections, id])] }));
  }

  async function downloadPdf() {
    if (!confirmed) return;
    try {
      const file = await fetchPdfFile(confirmed, paperSize);
      downloadGeneratedFile(file, file.name);
      setStatus("PDF ready. Check your browser downloads.");
    }
    catch (error) { setError(error instanceof Error ? error.message : "The PDF could not be downloaded."); }
  }

  async function shareBrief() {
    if (!confirmed || !navigator.share) return;
    try { const file = await fetchPdfFile(confirmed, paperSize); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: confirmed.document.title }); else await navigator.share({ title: confirmed.document.title, text: formatBriefForCopy(confirmed.document) }); }
    catch (shareError) { if ((shareError as Error)?.name !== "AbortError") setError("The brief could not be shared."); }
  }

  const emptySections = document ? outline.filter((item) => isSectionEmpty(document, item.id) && !editingEmpty.has(item.id)) : [];

  const askReturnHref = documentPetId ? `/ask?pet=${encodeURIComponent(documentPetId)}${conversationId ? `&conversation=${encodeURIComponent(conversationId)}` : ""}` : "/ask";
  return <AppPage layout="focused" width="wide"><div className="mx-auto w-full max-w-3xl pb-36">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><Link className="text-sm font-semibold text-[var(--pw-primary)]" href={askReturnHref}>Back to Ask</Link><h1 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-[var(--pw-heading)] sm:text-5xl">{retrospective ? "Care history summary" : "Vet brief"}</h1><p className="mt-3 max-w-3xl leading-7 text-[var(--pw-muted)]">{retrospective ? "Review the timeline and records, then choose how to keep or share the summary." : "Your pet’s history, ready for the appointment."}</p></div><WorkflowDocumentStatus status={documentStatus} /></header>
    {document && !loading ? <div aria-label="Choose review or preview" className="mt-6 flex items-center justify-between border-b border-[var(--pw-border)] pb-4"><p className="text-sm text-[var(--pw-muted)]">{mode === "preview" ? "Read through once. Edit only what needs changing." : "Open a section to make changes."}</p><button className={secondaryButton} onClick={() => setMode(mode === "preview" ? "review" : "preview")} type="button">{mode === "preview" ? "Edit details" : "Read brief"}</button></div> : null}
    {error ? <Status text={error} tone="warn" /> : null}{status ? <Status text={status} /> : null}
    {source === "ask" ? <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--pw-muted)]">Urgent guidance remains in Ask and is not copied into this document.</p> : null}

    {needsPurpose && !document ? <form className="mt-10 space-y-6" onSubmit={prepareBrief}>
      <div><h2 className="text-2xl font-semibold text-[var(--pw-heading)]">What is the appointment for?</h2><p className="mt-3 leading-7 text-[var(--pw-muted)]">A concern, a follow-up, or a routine checkup. Furvise will use saved history to prepare your brief.</p><TextArea label="Reason for the appointment" onChange={setPurpose} value={purpose} /></div>
      <details className="border-y border-[var(--pw-border)] py-4"><summary className="cursor-pointer font-semibold">Choose history dates</summary><div className="mt-4 grid grid-cols-2 gap-4"><DateField label="From" onChange={setFrom} value={from} /><DateField label="To" onChange={setTo} value={to} /></div></details>
      <button className={primaryButtonCompact} disabled={loading || !purpose.trim() || from > to} type="submit">{loading ? "Preparing your brief…" : "Prepare my brief"}</button>
    </form> : null}
    {loading ? <Status text="Reading saved history and preparing your brief…" /> : document ? <div className="mt-7 min-w-0">
      <section aria-label="Edit Vet Visit Brief" className={`${mode === "review" ? "block" : "hidden"} min-w-0`}>
        <details className="border-y border-[var(--pw-border)] py-5"><summary className="cursor-pointer font-semibold">Report title and history dates</summary><form className="mt-4 space-y-4" onSubmit={refreshRange}><TextField label="Document title" onChange={(value) => editDocument((current) => ({ ...current, title: value }))} value={document.title} /><div className="grid grid-cols-2 gap-3"><DateField label="From" onChange={setFrom} value={from} /><DateField label="To" onChange={setTo} value={to} /></div><p className="text-sm text-[var(--pw-muted)]">Preparing again replaces generated sections. Save your draft before changing dates if you want to keep your edits.</p><button className={secondaryButton} type="submit">Prepare again with these dates</button></form></details>

        <div className="mt-6">
          <div className="min-w-0">
            <div className="divide-y divide-[var(--pw-border)]">
              {(!isSectionEmpty(document, "visit-reason") || editingEmpty.has("visit-reason")) ? <EditorSection document={document} id="visit-reason" title="Visit reason" onInclude={toggleSection}><TextArea label="Reason for visit" onChange={(value) => editDocument((current) => ({ ...current, reasonForVisit: value }))} value={document.reasonForVisit === "Not recorded" ? "" : document.reasonForVisit} /><TextArea label="Visit overview" onChange={(value) => editDocument((current) => ({ ...current, visitSummary: value }))} value={document.visitSummary || ""} /></EditorSection> : null}
              {(!isSectionEmpty(document, "changes-noticed") || editingEmpty.has("changes-noticed")) ? <EditorSection document={document} id="changes-noticed" title="Changes noticed" onInclude={toggleSection}><DatedItemsEditor items={document.ownerReportedChanges} onChange={(items) => editDocument((current) => ({ ...current, ownerReportedChanges: items }))} title="Owner-reported changes" /><StringItemsEditor items={document.reportedPatterns} onChange={(items) => editDocument((current) => ({ ...current, reportedPatterns: items }))} title="Patterns noticed" /></EditorSection> : null}
              {(!isSectionEmpty(document, "timeline") || editingEmpty.has("timeline")) ? <EditorSection document={document} id="timeline" title="Timeline" onInclude={toggleSection}><DatedItemsEditor items={document.concernTimeline} onChange={(items) => editDocument((current) => ({ ...current, concernTimeline: items }))} title="Symptom or concern timeline" /></EditorSection> : null}
              {(!isSectionEmpty(document, "food-products") || editingEmpty.has("food-products")) ? <EditorSection document={document} id="food-products" title="Food and products" onInclude={toggleSection}><DatedItemsEditor items={document.foodChanges} onChange={(items) => editDocument((current) => ({ ...current, foodChanges: items }))} title="Recent food changes" /><DatedItemsEditor items={document.productsUsed} onChange={(items) => editDocument((current) => ({ ...current, productsUsed: items }))} title="Products used" /></EditorSection> : null}
              {(!isSectionEmpty(document, "medications") || editingEmpty.has("medications")) ? <EditorSection document={document} id="medications" title="Medications" onInclude={toggleSection}><DatedItemsEditor items={document.medicationsSupplements} onChange={(items) => editDocument((current) => ({ ...current, medicationsSupplements: items }))} title="Medications or supplements" /></EditorSection> : null}
              {(!isSectionEmpty(document, "care-history") || editingEmpty.has("care-history")) ? <EditorSection document={document} id="care-history" title="Care history" onInclude={toggleSection}><HistoryEditor items={document.relevantCareHistory} onChange={(items) => editDocument((current) => ({ ...current, relevantCareHistory: items }))} /></EditorSection> : null}
              {(!isSectionEmpty(document, "questions") || editingEmpty.has("questions")) ? <EditorSection document={document} id="questions" title="Questions" onInclude={toggleSection}><QuestionsEditor items={document.questionsForVeterinarian} onChange={(items) => editDocument((current) => ({ ...current, questionsForVeterinarian: items }))} /></EditorSection> : null}
              {(!isSectionEmpty(document, "owner-notes") || editingEmpty.has("owner-notes")) ? <EditorSection document={document} id="owner-notes" title="Owner notes" onInclude={toggleSection}><TextArea label="Notes to include" onChange={(value) => editDocument((current) => ({ ...current, ownerNotes: value }))} value={document.ownerNotes} /></EditorSection> : null}
            </div>
            {emptySections.length ? <MissingInformationGroup document={document} items={emptySections} onAdd={addEmptySection} onInclude={toggleSection} /> : null}
          </div>
        </div>
      </section>

      <section aria-label="Vet Visit Brief preview" className={`${mode === "preview" ? "block" : "hidden"} min-w-0`}>
        <div className="overflow-hidden rounded-xl border border-[var(--pw-border)]"><VetBriefDocumentView document={document} version={confirmed?.version} /></div>
        <details className="mt-5 text-sm text-[var(--pw-muted)]"><summary className="cursor-pointer">Paper size</summary><label className={`${controlLabel} mt-3 w-fit`}>Paper<select onChange={(event) => setPaperSize(event.target.value === "a4" ? "a4" : "letter")} value={paperSize}><option value="letter">US Letter</option><option value="a4">A4</option></select></label></details>
      </section>
    </div> : null}

    {document ? <ActionBar confirmed={confirmed} documentStatus={documentStatus} onConfirm={() => void confirmBrief()} onCreateVersion={createNewVersion} onDownload={() => void downloadPdf()} onSaveDraft={saveDraft} onShare={() => void shareBrief()} saving={saving} /> : null}
  </div></AppPage>;
}

function EditorSection({ children, document, id, onInclude, title }: { children: React.ReactNode; document: VetBriefDocument; id: VetBriefSectionId; onInclude: (id: VetBriefSectionId, include: boolean) => void; title: string }) { const included = !document.excludedSections.includes(id); return <details className="scroll-mt-24 py-6" id={`brief-section-${id}`}><summary className="cursor-pointer text-lg font-semibold text-[var(--pw-heading)]">{title}</summary><label className="mt-4 flex items-center gap-2 text-sm text-[var(--pw-muted)]"><input checked={included} onChange={(event) => onInclude(id, event.target.checked)} type="checkbox" />Include in brief</label><div className="mt-4">{children}</div></details>; }

function MissingInformationGroup({ document, items, onAdd, onInclude }: { document: VetBriefDocument; items: Array<{ id: VetBriefSectionId; label: string }>; onAdd: (id: VetBriefSectionId) => void; onInclude: (id: VetBriefSectionId, include: boolean) => void }) { return <section className="mt-6 border-y border-[var(--pw-border)] py-5" aria-labelledby="missing-information-title"><h2 className={sectionTitle} id="missing-information-title">Information not yet recorded</h2><p className="mt-2 text-sm leading-6 text-[var(--pw-muted)]">Optional additions. Empty sections are left out of the report; missing essentials are listed together.</p><ul className="mt-4 divide-y divide-[var(--pw-border)]">{items.map((item) => { const included = !document.excludedSections.includes(item.id); return <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.id}><span className="text-sm font-semibold text-[var(--pw-heading)]">{item.label}</span><div className="flex items-center gap-2"><button className={smallButton} onClick={() => onAdd(item.id)} type="button">Add information</button><button className={quietButton} onClick={() => onInclude(item.id, !included)} type="button">{included ? "Exclude" : "Include as not recorded"}</button></div></li>; })}</ul></section>; }

function DatedItemsEditor({ items, onChange, title }: { items: VetBriefDatedItem[]; onChange: (items: VetBriefDatedItem[]) => void; title: string }) { return <FieldGroup title={title}>{items.length ? <div className="space-y-4">{items.map((item, index) => <div className="border-l-2 border-[var(--pw-border)] pl-3" key={index}><DateField label="Date" onChange={(date) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, date: date || "Date unknown" } : current))} unknownAllowed value={item.date} /><TextArea label="Detail" onChange={(text) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, text } : current))} value={item.text} /><button className={removeButton} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</button></div>)}</div> : <p className="text-sm text-[var(--pw-muted)]">No entries yet.</p>}<button className={addButton} onClick={() => onChange([...items, { date: "Date unknown", text: "" }])} type="button">+ Add entry</button></FieldGroup>; }
function HistoryEditor({ items, onChange }: { items: VetBriefHistoryItem[]; onChange: (items: VetBriefHistoryItem[]) => void }) { return <FieldGroup title="Relevant care history">{items.length ? <div className="space-y-4">{items.map((item, index) => <div className="border-l-2 border-[var(--pw-border)] pl-3" key={index}><div className="grid gap-3 sm:grid-cols-2"><DateField label="Date" onChange={(date) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, date } : current))} value={item.date} /><TextField label="Category" onChange={(category) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, category } : current))} value={item.category} /></div><TextArea label="Entry" onChange={(text) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, text } : current))} value={item.text} /><button className={removeButton} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</button></div>)}</div> : <p className="text-sm text-[var(--pw-muted)]">No entries yet.</p>}<button className={addButton} onClick={() => onChange([...items, { category: "General", date: new Date().toISOString().slice(0, 10), text: "" }])} type="button">+ Add history item</button></FieldGroup>; }
function StringItemsEditor({ items, onChange, title }: { items: string[]; onChange: (items: string[]) => void; title: string }) { return <FieldGroup title={title}>{items.map((item, index) => <div className="mt-3 flex items-start gap-2" key={index}><textarea aria-label={`${title} item ${index + 1}`} className={`${inputClass} min-h-20 py-2`} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} value={item} /><button aria-label={`Remove ${title.toLowerCase()} item ${index + 1}`} className={removeButton} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</button></div>)}<button className={addButton} onClick={() => onChange([...items, ""])} type="button">+ Add item</button></FieldGroup>; }
function QuestionsEditor({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) { function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= items.length) return; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; onChange(next); } return <FieldGroup title="Questions for the veterinarian">{items.map((item, index) => <div className="mt-3 border-l-2 border-[var(--pw-border)] pl-3" key={index}><TextArea label={`Question ${index + 1}`} onChange={(text) => onChange(items.map((current, itemIndex) => itemIndex === index ? text : current))} value={item} /><div className="flex items-center gap-1"><span className="mr-2 text-xs text-[var(--pw-subtle)]">Reorder</span><button aria-label={`Move question ${index + 1} up`} className={iconButton} disabled={index === 0} onClick={() => move(index, -1)} title="Move up" type="button">↑</button><button aria-label={`Move question ${index + 1} down`} className={iconButton} disabled={index === items.length - 1} onClick={() => move(index, 1)} title="Move down" type="button">↓</button><button className={removeButton} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} type="button">Remove</button></div></div>)}<button className={addButton} onClick={() => onChange([...items, ""])} type="button">+ Add question</button></FieldGroup>; }
function FieldGroup({ children, title }: { children: React.ReactNode; title: string }) { return <fieldset className="mt-5 first:mt-0"><legend className="text-sm font-semibold text-[var(--pw-heading)]">{title}</legend><div className="mt-2">{children}</div></fieldset>; }
function DateField({ label, onChange, unknownAllowed = false, value }: { label: string; onChange: (value: string) => void; unknownAllowed?: boolean; value: string }) { const unknown = value === "Date unknown"; return <label className="block text-sm font-semibold text-[var(--pw-heading)]">{label}<input className={`${inputClass} mt-1`} onChange={(event) => onChange(event.target.value)} type="date" value={unknown ? "" : value} />{unknownAllowed && unknown ? <span className="mt-1 block text-xs font-normal text-[var(--pw-muted)]">Date unknown</span> : null}</label>; }
function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) { return <label className="block text-sm font-semibold text-[var(--pw-heading)]">{label}<input className={`${inputClass} mt-1`} onChange={(event) => onChange(event.target.value)} value={value} /></label>; }
function TextArea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) { return <label className="mt-3 block text-sm font-semibold text-[var(--pw-heading)]">{label}<textarea className={`${inputClass} mt-1 min-h-24 py-3`} onChange={(event) => onChange(event.target.value)} value={value} /></label>; }

function ActionBar({ confirmed, documentStatus, onConfirm, onCreateVersion, onDownload, onSaveDraft, onShare, saving }: { confirmed: VetBriefRecord | null; documentStatus: "Draft" | "Confirmed" | "New version in progress"; onConfirm: () => void; onCreateVersion: () => void; onDownload: () => void; onSaveDraft: () => void; onShare: () => void; saving: boolean }) { return <div className="fixed inset-x-0 bottom-14 z-30 border-t border-[var(--pw-border-strong)] bg-[var(--pw-surface)] pt-3 shadow-[0_-8px_24px_var(--pw-shadow)] lg:bottom-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}><div className={`${appPageContainer} flex flex-wrap items-center justify-between gap-3`}><WorkflowDocumentStatus status={documentStatus} />{confirmed ? <div className="flex flex-wrap gap-2"><button className={primaryButtonCompact} onClick={onDownload} type="button">Download PDF</button>{typeof navigator !== "undefined" && "share" in navigator ? <button className={secondaryButtonCompact} onClick={onShare} type="button">Share</button> : null}<Link className={secondaryButtonCompact} href={`/vet-briefs/${confirmed.id}/print`} target="_blank">Print</Link><button className={secondaryButtonCompact} onClick={onCreateVersion} type="button">Create new version</button></div> : <div className="flex flex-wrap gap-2"><button className={secondaryButtonCompact} onClick={onSaveDraft} type="button">Save draft</button><button className={primaryButtonCompact} disabled={saving} onClick={onConfirm} type="button">{saving ? "Confirming\u2026" : "Confirm brief"}</button></div>}</div></div>; }
function Status({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) { return <div className={`mt-5 border-y px-1 py-3 text-sm leading-6 ${tone === "warn" ? "border-[var(--pw-warning-border)] text-[var(--pw-warning-text)]" : "border-[var(--pw-border)] text-[var(--pw-muted)]"}`} role="status">{text}</div>; }

function isSectionEmpty(document: VetBriefDocument, id: VetBriefSectionId) { switch (id) { case "visit-reason": return !document.reasonForVisit.trim() || document.reasonForVisit === "Not recorded"; case "changes-noticed": return !document.ownerReportedChanges.length && !document.reportedPatterns.length; case "timeline": return !document.concernTimeline.length; case "food-products": return !document.foodChanges.length && !document.productsUsed.length; case "medications": return !document.medicationsSupplements.length; case "care-history": return !document.relevantCareHistory.length; case "questions": return !document.questionsForVeterinarian.length; case "owner-notes": return !document.ownerNotes.trim(); } }
async function fetchDraft(petId: string, from: string, to: string, conversationId: string, existingDocument?: VetBriefDocument | null, reasonForVisit?: string) {
  const input = { reasonForVisit: reasonForVisit || existingDocument?.reasonForVisit || undefined, conversationId: conversationId || undefined, existingDocument: existingDocument || undefined, from, petId, to };
  // Identical retries share a key; changed dates or owner edits are a new operation.
  const scope = `vet-brief-draft:v2:${JSON.stringify(input)}`;
  const requestId = getOrCreateClientMutationKey(scope);
  return authenticatedJson("/api/vet-briefs/draft", {
    method: "POST", body: JSON.stringify({ ...input, requestId }),
  }, scope) as Promise<{ document: VetBriefDocument; sourceEntryIds: string[] }>;
}
async function authenticatedJson(url: string, init: RequestInit = {}, mutationScope?: string) {
  const token = await getAuthToken();
  if (!token) throw new Error("Please sign in again.");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) };
  const method = (init.method || "GET").toUpperCase();
  let explicitKey: string | undefined;
  try {
    const body = typeof init.body === "string" ? JSON.parse(init.body) as { requestId?: unknown } : null;
    explicitKey = typeof body?.requestId === "string" ? body.requestId : undefined;
  } catch { /* The server validates malformed bodies. */ }
  const response = method === "GET"
    ? await fetch(url, { ...init, headers })
    : await idempotentClientFetch(url, { ...init, headers }, mutationScope || `vet-brief:${method}:${url}`, explicitKey);
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error || "The Vet Visit Brief is temporarily unavailable.");
  return payload;
}
async function getAuthToken() { const client = getBrowserSupabase(); const { data } = client ? await client.auth.getSession() : { data: { session: null } }; return data.session?.access_token || ""; }
async function fetchPdfFile(brief: VetBriefRecord, paperSize: "letter" | "a4") { const token = await getAuthToken(); const response = await fetch(`/api/vet-briefs/${encodeURIComponent(brief.id)}/pdf?size=${paperSize}`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error || "The PDF could not be downloaded."); } const blob = await response.blob(); return new File([blob], getVetBriefFilename(brief.document.pet.name, brief.generatedAt), { type: "application/pdf" }); }
function formatBriefForCopy(document: VetBriefDocument) { return vetBriefText(document); }
function getDefaultRange() { const to = new Date(); const from = new Date(to); from.setUTCDate(from.getUTCDate() - 90); return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }; }
async function validateDraftScope(petId: string) { await authenticatedJson(`/api/vet-briefs/draft?pet=${encodeURIComponent(petId)}`); }
function documentGlobal() { return window.document; }

const inputClass = "min-h-11 w-full rounded-xl border border-[var(--pw-border-strong)] bg-[var(--pw-input)] px-3 text-base font-normal text-[var(--pw-text)] outline-none focus:border-[var(--pw-focus-ring)] focus-visible:ring-2 focus-visible:ring-[var(--pw-focus-ring)]";
const sectionTitle = "text-lg font-semibold text-[var(--pw-heading)]";
const primaryButtonCompact = "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--pw-primary)] px-4 text-sm font-semibold text-[var(--pw-primary-foreground)] disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)]";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--pw-border-strong)] px-4 text-sm font-semibold text-[var(--pw-text)]";
const secondaryButtonCompact = "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--pw-border-strong)] px-4 text-sm font-semibold text-[var(--pw-text)]";
const smallButton = "min-h-9 rounded-full border border-[var(--pw-border)] px-3 text-xs font-semibold text-[var(--pw-text)]";
const addButton = "mt-3 min-h-9 rounded-lg px-2 text-sm font-semibold text-[var(--pw-primary)] hover:bg-[var(--pw-primary-soft)]";
const quietButton = "min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--pw-muted)] hover:bg-[var(--pw-card-muted)]";
const iconButton = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pw-border)] text-sm font-semibold disabled:border-[var(--pw-border-strong)] disabled:bg-[var(--pw-disabled-background)] disabled:text-[var(--pw-disabled-text)]";
const removeButton = "min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--pw-danger-text)] hover:bg-[var(--pw-danger-surface)]";
const controlLabel = "flex min-h-10 items-center gap-2 rounded-full border border-[var(--pw-border-strong)] px-3 text-xs font-semibold text-[var(--pw-text)]";
