import { vetBriefUrgencyText } from "./urgency.ts";
import type { VetBriefDocument, VetBriefSectionId } from "./types.ts";

export type BriefReportSection = { id: string; title: string; items: Array<{ date?: string; text: string; category?: string }> };

// One publication contract for screen, print, PDF and text sharing. Only exact
// duplicate facts are collapsed; attribution, dates, negation and amounts survive.
export function vetBriefReport(document: VetBriefDocument): BriefReportSection[] {
  const included = (id: VetBriefSectionId) => !document.excludedSections.includes(id);
  const seen = new Set<string>();
  const sections: BriefReportSection[] = [];
  const add = (id: string, title: string, items: BriefReportSection["items"]) => {
    const unique = items.filter(item => {
      if (!item.text.trim() || item.text === "Not recorded") return false;
      const key = `${item.date || ""}|${factText(item.text)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length) sections.push({ id, title, items: unique.map(item => ({ ...item, text: item.text.trim() })) });
  };
  if (document.urgency) add("urgency", "Care should not wait", [{ text: vetBriefUrgencyText(document.urgency) }]);
  if (included("visit-reason")) add("reason", "Owner-reported reason for visit", [{ text: document.reasonForVisit }]);
  if (included("visit-reason") && document.visitSummary) add("overview", "Visit overview", [{ text: document.visitSummary }]);
  if (included("timeline")) add("timeline", "Concern timeline · owner observations", [...document.concernTimeline].sort(byDate));
  if (included("changes-noticed")) {
    add("changes", "Other owner observations", [...document.ownerReportedChanges].sort(byDate));
    add("patterns", "Patterns reported by the owner", document.reportedPatterns.map(text => ({ text })));
  }
  if (included("medications")) add("medications", "Recorded medications and supplements", document.medicationsSupplements);
  if (included("food-products")) {
    add("food", "Reported food changes", document.foodChanges);
    add("products", "Recorded products", document.productsUsed);
  }
  if (included("questions")) add("questions", "Questions to discuss", document.questionsForVeterinarian.map(text => ({ text })));
  if (included("owner-notes")) add("notes", "Owner additions", [{ text: document.ownerNotes }]);
  const gaps = [...document.missingInformation];
  if (included("visit-reason") && (!document.reasonForVisit || document.reasonForVisit === "Not recorded")) gaps.unshift("Reason for visit not provided");
  add("gaps", "Not established in the available records", [...new Set(gaps)].map(text => ({ text })));
  if (included("care-history")) add("history", "Supporting care history", [...document.relevantCareHistory].sort(byDate));
  add("coverage", "History reviewed", (document.historyCoverage || []).map(text => ({ text })));
  return sections;
}

export function vetBriefDatedEntryCount(document: VetBriefDocument) {
  return vetBriefReport(document).reduce((count, section) => count + section.items.filter(item => Boolean(item.date)).length, 0);
}

function factText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function byDate(a: { date: string }, b: { date: string }) {
  return (a.date === "Date unknown" ? "9999" : a.date).localeCompare(b.date === "Date unknown" ? "9999" : b.date);
}

export function vetBriefProfileWeight(document: VetBriefDocument) {
  return document.pet.weight && document.pet.weight !== "Not recorded"
    ? `Profile weight (date not recorded): ${document.pet.weight}` : "";
}

export function vetBriefText(document: VetBriefDocument) {
  return [document.title, `${document.pet.name} | ${document.pet.species} | ${document.pet.breed} | Age: ${document.pet.age} ${vetBriefProfileWeight(document) ? ` | ${vetBriefProfileWeight(document)}` : ""}`,
    `Selected records: ${document.dateRange.from} to ${document.dateRange.to}. This is a preparation summary, not a complete medical record.`,
    ...vetBriefReport(document).map(section => `${section.title}\n${section.items.map(item => `${item.date ? `${item.date}: ` : ""}${item.category ? `${item.category} · ` : ""}${item.text}`).join("\n")}`), document.disclaimer].join("\n\n");
}

// Review exactly the owner-visible publication, including exclusions and exact
// deduplication, rather than a raw draft containing hidden or repeated fields.
export function vetBriefReviewPublication(document: VetBriefDocument) {
  return { title: document.title, pet: document.pet, generatedAt: document.generatedAt, dateRange: document.dateRange, sections: vetBriefReport(document), excludedSections: document.excludedSections, disclaimer: document.disclaimer };
}

// The model chooses relevance from candidates. Prefilled detail arrays otherwise
// incorrectly present all heuristic matches as already relevant evidence.
export function vetBriefGenerationTemplate(document: VetBriefDocument): VetBriefDocument {
  return { ...document, visitSummary: "", ownerReportedChanges: [], concernTimeline: [], foodChanges: [], productsUsed: [], medicationsSupplements: [], relevantCareHistory: [], reportedPatterns: [], questionsForVeterinarian: [], ownerNotes: "" };
}

/** Model review covers authored sections. Identity/profile/version/date metadata
 * is immutable server-owned data validated separately, not a generation defect
 * the model can repair by dropping historical evidence. */
export function vetBriefReviewContent(document: VetBriefDocument) {
  return { sections: vetBriefReport(document), excludedSections: document.excludedSections };
}
