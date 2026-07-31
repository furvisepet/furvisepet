import type { VetBriefDocument } from "../lib/vet-brief/types";

export function VetBriefDocumentView({ document, version }: { document: VetBriefDocument; version?: number }) {
  const included = (id: VetBriefDocument["excludedSections"][number]) => !document.excludedSections.includes(id);
  return (
    <article className="vet-brief-document mx-auto w-full max-w-[8.5in] bg-[var(--pw-document-paper)] px-6 py-8 text-[var(--pw-document-text)] sm:px-10 sm:py-12 print:max-w-none print:px-[0.65in] print:py-[0.55in]">
      <header className="border-b border-[var(--pw-document-border)] pb-5">
        <div className="flex items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pw-document-brand)]">Furvise</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{document.title}</h1></div>{version ? <span className="shrink-0 rounded-full border border-[var(--pw-document-border)] px-3 py-1 text-xs font-semibold">Version {version}</span> : null}</div>
        <p className="mt-3 text-sm text-[var(--pw-document-muted)]">Prepared {formatDate(document.generatedAt.slice(0, 10))} · Covers {formatDate(document.dateRange.from)} to {formatDate(document.dateRange.to)}</p>
      </header>

      <section className="grid gap-4 border-b border-[var(--pw-document-border-soft)] py-5 sm:grid-cols-2"><Field label="Pet" value={document.pet.name} /><Field label="Species" value={document.pet.species} /><Field label="Breed" value={document.pet.breed} /><Field label="Age" value={document.pet.age} /><Field label="Weight" value={document.pet.weight} /></section>

      {included("visit-reason") ? <DocumentSection title="Reason for visit"><p>{document.reasonForVisit || "Not recorded"}</p></DocumentSection> : null}
      {included("changes-noticed") ? <><DatedItems items={document.ownerReportedChanges} title="Owner-reported changes" /><SimpleList items={document.reportedPatterns} title="Patterns the owner has reported" /></> : null}
      {included("timeline") ? <DatedItems items={document.concernTimeline} title="Symptom or concern timeline" /> : null}
      {included("food-products") ? <><DatedItems items={document.foodChanges} title="Recent food changes" /><DatedItems items={document.productsUsed} title="Recent products used" /></> : null}
      {included("medications") ? <DatedItems empty="Current medication not saved" items={document.medicationsSupplements} title="Medications or supplements" /> : null}
      {included("care-history") ? <DocumentSection title="Relevant care history">{document.relevantCareHistory.length ? <ul className="space-y-3">{document.relevantCareHistory.map((item, index) => <li className="break-inside-avoid" key={`${item.date}-${index}`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--pw-document-muted)]">{formatItemDate(item.date)} · {item.category}</p><p className="mt-1">{item.text}</p></li>)}</ul> : <Empty />}</DocumentSection> : null}
      {included("questions") ? <SimpleList items={document.questionsForVeterinarian} numbered title="Questions for the veterinarian" /> : null}
      <SimpleList items={document.missingInformation} title="Useful information still missing" />
      {included("owner-notes") ? <DocumentSection title="Owner notes">{document.ownerNotes ? <p className="whitespace-pre-wrap">{document.ownerNotes}</p> : <Empty />}</DocumentSection> : null}

      <footer className="mt-8 border-t border-[var(--pw-document-border)] pt-4 text-xs leading-5 text-[var(--pw-document-muted)]">{document.disclaimer}</footer>
    </article>
  );
}

function DatedItems({ empty = "Not recorded", items, title }: { empty?: string; items: Array<{ date: string; text: string }>; title: string }) { const recorded = items.filter((item) => item.text.trim()); return <DocumentSection title={title}>{recorded.length ? <ul className="space-y-3">{recorded.map((item, index) => <li className="break-inside-avoid" key={`${item.date}-${index}`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--pw-document-muted)]">{formatItemDate(item.date)}</p><p className="mt-1">{item.text}</p></li>)}</ul> : <Empty text={empty} />}</DocumentSection>; }
function SimpleList({ items, numbered = false, title }: { items: string[]; numbered?: boolean; title: string }) { const recorded = items.filter((item) => item.trim()); const Tag = numbered ? "ol" : "ul"; return <DocumentSection title={title}>{recorded.length ? <Tag className={`${numbered ? "list-decimal" : "list-disc"} space-y-2 pl-5`}>{recorded.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</Tag> : <Empty />}</DocumentSection>; }
function DocumentSection({ children, title }: { children: React.ReactNode; title: string }) { return <section className="break-inside-avoid border-b border-[var(--pw-document-border-soft)] py-5"><h2 className="mb-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--pw-document-text)]">{title}</h2><div className="text-[0.95rem] leading-6">{children}</div></section>; }
function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--pw-document-muted)]">{label}</p><p className="mt-1 font-semibold">{value || "Not recorded"}</p></div>; }
function Empty({ text = "Not recorded" }: { text?: string }) { return <p className="italic text-[var(--pw-document-muted)]">{text}</p>; }
function formatItemDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : "Date unknown"; }
function formatDate(value: string) { const date = new Date(`${value}T00:00:00Z`); return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }); }
