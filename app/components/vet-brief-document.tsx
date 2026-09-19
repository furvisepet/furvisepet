import type { VetBriefDocument } from "../lib/vet-brief/types";
import { vetBriefReport, vetBriefProfileWeight } from "../lib/vet-brief/report";
import { BrandMark } from "./brand-mark";
import { briefTextDirection, briefTextRuns } from "../lib/vet-brief/text-direction";

function BriefText({ text }: { text: string }) {
  const direction = briefTextDirection(text);
  return <span dir={direction} style={{ unicodeBidi: "isolate" }}>{direction === "rtl" ? briefTextRuns(text).map((run, index) => run.isolate ? <bdi dir="ltr" style={{ whiteSpace: "nowrap" }} key={index}>{run.text}</bdi> : run.text) : text}</span>;
}

export function VetBriefDocumentView({ document, version }: { document: VetBriefDocument; version?: number }) {
  const sections = vetBriefReport(document);
  return (
    <article className="vet-brief-document w-full bg-[var(--pw-document-paper)] px-6 py-8 font-sans text-[var(--pw-document-text)] sm:px-10 sm:py-10 print:max-w-none print:px-[0.65in] print:py-[0.55in]">
      <header className="border-b-2 border-[var(--pw-document-brand)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-4"><BrandMark size={32} /><p className="text-xs text-[var(--pw-document-muted)]">Appointment preparation{version ? ` · Version ${version}` : " · Draft"}</p></div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{document.title}</h1>
        <p className="mt-2 text-base">{[document.pet.name, document.pet.species, document.pet.breed, document.pet.age].filter(value => value && value !== "Not recorded").join(" · ")}</p>
        {vetBriefProfileWeight(document) ? <p className="mt-2 text-sm">{vetBriefProfileWeight(document)}</p> : null}
        <p className="mt-3 text-xs leading-5 text-[var(--pw-document-muted)]">Prepared {formatDate(document.generatedAt.slice(0, 10))}. Selected records: {formatDate(document.dateRange.from)}–{formatDate(document.dateRange.to)}.<br />Owner-recorded history; this is not a complete medical record.</p>
      </header>
      {sections.map(section => <section className={`border-b border-[var(--pw-border)] py-5 ${section.id === "overview" ? "border-l-2 border-l-[var(--pw-document-brand)] pl-4" : ""}`} key={section.id}>
        <h2 className="mb-3 break-after-avoid text-sm font-bold text-[var(--pw-document-brand)]">{section.title}</h2>
        <ul className="max-w-[85ch] space-y-3">{section.items.map((item, index) => <li className="break-inside-avoid text-base leading-7" key={index}>
          {item.date ? <p className="text-xs font-semibold text-[var(--pw-document-muted)]"><bdi dir="ltr">{formatDate(item.date)}</bdi>{item.category ? <> · <BriefText text={item.category} /></> : null}</p> : null}
          <p className="whitespace-pre-wrap" dir={briefTextDirection(item.text)} style={{ textAlign: "start" }}><BriefText text={item.text} /></p>
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
