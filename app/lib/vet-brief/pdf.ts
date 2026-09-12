import { rgb } from "pdf-lib";
import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vetBriefReport } from "./report.ts";
import type { VetBriefDocument } from "./types.ts";

/* The Vet Brief uses the same approved palette as the application. */
export const PDF_THEME = {
  brand: rgb(57 / 255, 56 / 255, 49 / 255),
  accent: rgb(198 / 255, 201 / 255, 210 / 255),
  text: rgb(57 / 255, 56 / 255, 49 / 255),
  muted: rgb(57 / 255, 56 / 255, 49 / 255),
  border: rgb(184 / 255, 174 / 255, 168 / 255),
} as const;

const LETTER = { width: 612, height: 792 };
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;
const FOOTER_Y = 30;
const fontData = Promise.all([
  readFile(join(process.cwd(), "app/lib/vet-brief/fonts/DejaVuSans.ttf")),
  readFile(join(process.cwd(), "app/lib/vet-brief/fonts/DejaVuSans-Bold.ttf")),
]);

export class UnsupportedBriefPdfTextError extends Error {
  constructor() { super("Some characters in this brief need browser printing. Open Print and choose Save as PDF to preserve the full text."); }
}

export async function generateVetBriefPdf(document: VetBriefDocument, options: { pageSize?: "letter" | "a4" } = {}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularData, boldData] = await fontData;
  const regular = await pdf.embedFont(regularData, { subset: true });
  const bold = await pdf.embedFont(boldData, { subset: true });
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
  drawText(state, `${document.pet.name} | ${document.pet.species}`, { font: bold, size: 12, color: PDF_THEME.text, spacingAfter: 4 });
  drawText(state, `Breed: ${document.pet.breed} | Age: ${document.pet.age} | Profile weight: ${document.pet.weight}`, { font: regular, size: 10, color: PDF_THEME.text, spacingAfter: 8 });
  const scopeNote = document.medicationsSupplements.length && !document.excludedSections.includes("medications")
    ? "Selected owner records, not a complete medical record. Medication entries describe recorded use; current use needs confirmation."
    : "Selected owner records, not a complete medical record.";
  drawText(state, scopeNote, { font: regular, size: 9, color: PDF_THEME.muted, spacingAfter: 14 });
  for (const section of vetBriefReport(document)) {
    drawSection(state, section.title, section.items.map(item => `${item.date ? `${formatItemDate(item.date)} | ` : ""}${item.category ? `${item.category}: ` : ""}${item.text}`));
  }

  const disclaimerHeight = 14 + wrapText(document.disclaimer, regular, 8, state.contentWidth).length * 10.8 + 4;
  ensureSpace(state, disclaimerHeight);
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
  const normalized = sanitizePdfText(text);
  const supported = new Set(font.getCharacterSet());
  if ([...normalized].some(character => !supported.has(character.codePointAt(0)!))) throw new UnsupportedBriefPdfTextError();
  const words = normalized.split(/\s+/).filter(Boolean).flatMap((word) => splitLongWord(word, font, size, maxWidth));
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
