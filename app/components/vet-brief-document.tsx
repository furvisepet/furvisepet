import type { VetBriefDocument } from "../lib/vet-brief/types";
import { vetBriefReport } from "../lib/vet-brief/report";

export function VetBriefDocumentView({ document, version }: { document: VetBriefDocument; version?: number }) {
  const sections = vetBriefReport(document);
  return (
    <article className="vet-brief-document mx-auto w-full max-w-[8.5in] bg-[var(--pw-document-paper)] px-6 py-8 text-[var(--pw-document-text)] sm:px-10 sm:py-8 print:max-w-none print:px-[0.65in] print:py-[0.55in]">
      <header className="border-b-2 border-[var(--pw-document-brand)] pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--pw-document-brand)]">Furvise · Appointment preparation{version ? ` · Version ${version}` : " · Draft"}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{document.title}</h1>
        <p className="mt-2 text-base">{[document.pet.name, document.pet.species, document.pet.breed, document.pet.age].filter(value => value && value !== "Not recorded").join(" · ")}</p>
        <p className="mt-2 text-sm">Profile weight: {document.pet.weight}</p>
        <p className="mt-3 text-xs leading-5 text-[var(--pw-document-muted)]">Prepared {formatDate(document.generatedAt.slice(0, 10))}. Selected records: {formatDate(document.dateRange.from)}–{formatDate(document.dateRange.to)}.<br />Owner-recorded history; this is not a complete medical record.</p>
      </header>
      {sections.map(section => <section className={`border-b border-[var(--pw-document-border-soft)] py-4 ${section.id === "overview" ? "border-l-2 border-l-[var(--pw-document-brand)] pl-4" : ""}`} key={section.id}>
        <h2 className="mb-3 break-after-avoid text-sm font-bold text-[var(--pw-document-brand)]">{section.title}</h2>
        <ul className="space-y-3">{section.items.map((item, index) => <li className="break-inside-avoid text-[0.95rem] leading-6" key={index}>
          {item.date ? <p className="text-xs font-semibold text-[var(--pw-document-muted)]">{formatDate(item.date)}{item.category ? ` · ${item.category}` : ""}</p> : null}
          <p className="whitespace-pre-wrap">{item.text}</p>
        </li>)}</ul>
        {section.id === "medications" ? <p className="mt-3 text-xs text-[var(--pw-document-muted)]">Recorded use does not establish current use. Confirm names, doses and schedule with the owner.</p> : null}
      </section>)}
      <footer className="mt-6 text-xs leading-5 text-[var(--pw-document-muted)]">{document.disclaimer}</footer>
    </article>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
}
