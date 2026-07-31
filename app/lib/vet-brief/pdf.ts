import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { VetBriefDocument } from "./types.ts";
import { PDF_THEME } from "./pdf-theme.ts";

const LETTER = { width: 612, height: 792 };
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;
const FOOTER_Y = 30;

export async function generateVetBriefPdf(document: VetBriefDocument, options: { pageSize?: "letter" | "a4" } = {}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dimensions = options.pageSize === "a4" ? A4 : LETTER;
  const state = { pdf, page: pdf.addPage([dimensions.width, dimensions.height]), y: dimensions.height - MARGIN, regular, bold, pageWidth: dimensions.width, pageHeight: dimensions.height, contentWidth: dimensions.width - (MARGIN * 2) };

  drawText(state, "FURVISE", { font: bold, size: 9, color: PDF_THEME.brand, spacingAfter: 8 });
  drawText(state, document.title, { font: bold, size: 22, color: PDF_THEME.text, spacingAfter: 7 });
  drawText(state, `Prepared ${formatDateTime(document.generatedAt)} | Covers ${formatDate(document.dateRange.from)} to ${formatDate(document.dateRange.to)}`, {
    font: regular,
    size: 9,
    color: PDF_THEME.muted,
    spacingAfter: 16,
  });

  drawRule(state);
  drawSection(state, "Pet", [
    `${document.pet.name} | ${document.pet.species}`,
    `Breed: ${document.pet.breed} | Age: ${document.pet.age} | Weight: ${document.pet.weight}`,
  ]);
  const included = (id: VetBriefDocument["excludedSections"][number]) => !document.excludedSections.includes(id);
  if (included("visit-reason")) drawSection(state, "Reason for visit", [document.reasonForVisit]);
  if (included("changes-noticed")) {
    drawDatedSection(state, "Owner-reported changes", document.ownerReportedChanges);
    drawSection(state, "Patterns the owner has reported", document.reportedPatterns, "Not recorded");
  }
  if (included("timeline")) drawDatedSection(state, "Symptom or concern timeline", document.concernTimeline);
  if (included("food-products")) {
    drawDatedSection(state, "Recent food changes", document.foodChanges);
    drawDatedSection(state, "Recent products used", document.productsUsed);
  }
  if (included("medications")) drawDatedSection(state, "Medications or supplements", document.medicationsSupplements, "Current medication not saved");
  if (included("care-history")) drawHistorySection(state, document.relevantCareHistory);
  if (included("questions")) drawSection(state, "Questions for the veterinarian", document.questionsForVeterinarian, "Not recorded");
  drawSection(state, "Useful information still missing", document.missingInformation, "None noted");
  if (included("owner-notes")) drawSection(state, "Owner notes", document.ownerNotes ? [document.ownerNotes] : [], "Not recorded");

  ensureSpace(state, 54);
  drawRule(state);
  drawText(state, document.disclaimer, { font: regular, size: 8, color: PDF_THEME.muted, spacingAfter: 0 });

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`Furvise Vet Visit Brief | Page ${index + 1} of ${pages.length}`, {
      x: MARGIN,
      y: FOOTER_Y,
      font: regular,
      size: 8,
      color: PDF_THEME.muted,
    });
  });
  pdf.setTitle(document.title);
  pdf.setSubject("Owner-prepared pet care summary");
  pdf.setCreator("Furvise");
  return pdf.save();
}

type PdfState = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
};

function drawSection(state: PdfState, title: string, items: string[], emptyText = "Not recorded") {
  const visible = items.length ? items : [emptyText];
  ensureSpace(state, estimateSectionHeight(title, visible, state));
  drawText(state, title, { font: state.bold, size: 12, color: PDF_THEME.text, spacingAfter: 6 });
  visible.forEach((item) => drawText(state, items.length > 1 ? `- ${item}` : item, { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 4 }));
  state.y -= 7;
}

function drawDatedSection(state: PdfState, title: string, items: Array<{ date: string; text: string }>, emptyText = "Not recorded") {
  const visibleText = items.length ? items.map((item) => `${formatItemDate(item.date)}: ${item.text}`) : [emptyText];
  ensureSpace(state, items.length <= 5 ? estimateSectionHeight(title, visibleText, state) : 48);
  drawText(state, title, { font: state.bold, size: 12, color: PDF_THEME.text, spacingAfter: 6 });
  if (!items.length) drawText(state, emptyText, { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 4 });
  items.forEach((item) => drawText(state, `${formatItemDate(item.date)}: ${item.text}`, { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 5 }));
  state.y -= 7;
}

function drawHistorySection(state: PdfState, items: Array<{ date: string; category: string; text: string }>) {
  const visibleText = items.length ? items.map((item) => `${formatItemDate(item.date)} | ${item.category}: ${item.text}`) : ["Not recorded"];
  ensureSpace(state, items.length <= 4 ? estimateSectionHeight("Relevant care history", visibleText, state) : 48);
  drawText(state, "Relevant care history", { font: state.bold, size: 12, color: PDF_THEME.text, spacingAfter: 6 });
  if (!items.length) drawText(state, "Not recorded", { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 4 });
  items.forEach((item) => drawText(state, `${formatItemDate(item.date)} | ${item.category}: ${item.text}`, { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 5 }));
  state.y -= 7;
}

function drawText(
  state: PdfState,
  text: string,
  options: { font: PDFFont; size: number; color: typeof PDF_THEME.text; spacingAfter: number },
) {
  const lineHeight = options.size * 1.35;
  const lines = wrapText(text || "Not recorded", options.font, options.size, state.contentWidth);
  for (const line of lines) {
    ensureSpace(state, lineHeight + 4);
    state.page.drawText(line, { x: MARGIN, y: state.y, font: options.font, size: options.size, color: options.color });
    state.y -= lineHeight;
  }
  state.y -= options.spacingAfter;
}

function drawRule(state: PdfState) {
  ensureSpace(state, 12);
  state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: state.pageWidth - MARGIN, y: state.y }, thickness: 0.7, color: PDF_THEME.border });
  state.y -= 14;
}

function ensureSpace(state: PdfState, required: number) {
  if (state.y - required > FOOTER_Y + 25) return;
  state.page = state.pdf.addPage([state.pageWidth, state.pageHeight]);
  state.y = state.pageHeight - MARGIN;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean).flatMap((word) => splitLongWord(word, font, size, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["Not recorded"];
}

function splitLongWord(word: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let part = "";
  for (const character of word) {
    const candidate = `${part}${character}`;
    if (part && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }
  if (part) parts.push(part);
  return parts;
}

function estimateSectionHeight(title: string, items: string[], state: PdfState) {
  const titleLines = wrapText(title, state.bold, 12, state.contentWidth).length;
  const itemLines = items.reduce((total, item) => total + wrapText(item, state.regular, 10, state.contentWidth).length, 0);
  return Math.min(620, (titleLines * 16.2) + 6 + (itemLines * 13.5) + (items.length * 4) + 7);
}

function sanitizePdfText(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unknown" : date.toLocaleDateString("en-CA", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" });
}

function formatItemDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : "Date unknown";
}
