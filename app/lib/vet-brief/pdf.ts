import { rgb } from "pdf-lib";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { vetBriefReport, vetBriefProfileWeight } from "./report.ts";
import type { VetBriefDocument } from "./types.ts";

/* The Vet Brief uses the same approved palette as the application. */
export const PDF_THEME = {
  brand: rgb(18 / 255, 63 / 255, 39 / 255),
  accent: rgb(227 / 255, 243 / 255, 222 / 255),
  text: rgb(23 / 255, 48 / 255, 35 / 255),
  muted: rgb(64 / 255, 86 / 255, 72 / 255),
  border: rgb(205 / 255, 216 / 255, 206 / 255),
} as const;

const LETTER = { width: 612, height: 792 };
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const FOOTER_Y = 30;
const fontData = Promise.all([
  readFile(join(process.cwd(), "public/fonts/Inter-Regular.ttf")),
  readFile(join(process.cwd(), "public/fonts/Inter-Bold.ttf")),
]);

export class UnsupportedBriefPdfTextError extends Error {
  constructor() { super("Some characters in this brief need browser printing. Open Print and choose Save as PDF to preserve the full text."); }
}

export async function generateVetBriefPdf(document: VetBriefDocument, options: { pageSize?: "letter" | "a4" } = {}) {
  const normal = await renderVetBriefPdf(document, options, false);
  // Try smaller whitespace, never smaller body type or omitted facts, only when
  // a short trailing page would otherwise be published.
  if (normal.pdf.getPageCount() > 1 && normal.lastContentY > normal.pageHeight * 0.65) {
    const compact = await renderVetBriefPdf(document, options, true);
    if (compact.pdf.getPageCount() < normal.pdf.getPageCount()) return compact.pdf.save();
  }
  return normal.pdf.save();
}

async function renderVetBriefPdf(document: VetBriefDocument, options: { pageSize?: "letter" | "a4" }, compact: boolean) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularData, boldData] = await fontData;
  const regular = await pdf.embedFont(regularData, { subset: false });
  const bold = await pdf.embedFont(boldData, { subset: false });
  const logo = await pdf.embedPng(await readFile(join(process.cwd(), "app/lib/vet-brief/fonts/brand-print.png")));
  const dimensions = options.pageSize === "a4" ? A4 : LETTER;
  const state = { pdf, compact, logo, petName: document.pet.name, page: pdf.addPage([dimensions.width, dimensions.height]), y: dimensions.height - MARGIN, regular, bold, pageWidth: dimensions.width, pageHeight: dimensions.height, contentWidth: dimensions.width - (MARGIN * 2) };

  const logoHeight = 128 * logo.height / logo.width;
  state.page.drawImage(logo, { x: MARGIN, y: state.y - logoHeight, width: 128, height: logoHeight });
  state.page.drawText('APPOINTMENT BRIEF', { x: state.pageWidth - MARGIN - bold.widthOfTextAtSize('APPOINTMENT BRIEF', 8), y: state.y - 12, font: bold, size: 8, color: PDF_THEME.muted });
  state.y -= logoHeight + 28;
  drawText(state, document.title, { font: bold, size: 23, color: PDF_THEME.brand, spacingAfter: 7 });
  drawText(state, `Prepared ${formatDateTime(document.generatedAt)} | Covers ${formatDate(document.dateRange.from)} to ${formatDate(document.dateRange.to)}`, {
    font: regular,
    size: 9,
    color: PDF_THEME.muted,
    spacingAfter: compact ? 8 : 16,
  });

  drawRule(state);
  drawText(state, `${document.pet.name} | ${document.pet.species}`, { font: bold, size: 12, color: PDF_THEME.text, spacingAfter: 4 });
  drawText(state, `Breed: ${document.pet.breed} | Age: ${document.pet.age}${vetBriefProfileWeight(document) ? ` | ${vetBriefProfileWeight(document)}` : ""}`, { font: regular, size: 10, color: PDF_THEME.text, spacingAfter: 8 });
  const scopeNote = document.medicationsSupplements.length && !document.excludedSections.includes("medications")
    ? "Selected owner records, not a complete medical record. Medication entries describe recorded use; current use needs confirmation."
    : "Selected owner records, not a complete medical record.";
  drawText(state, scopeNote, { font: regular, size: 9, color: PDF_THEME.muted, spacingAfter: 14 });
  for (const section of vetBriefReport(document)) {
    drawSection(state, section.title, section.items);
  }

  const disclaimerHeight = 14 + wrapText(document.disclaimer, regular, 8, state.contentWidth).length * 10.8 + 4;
  ensureSpace(state, disclaimerHeight);
  drawRule(state);
  drawText(state, document.disclaimer, { font: regular, size: 8, color: PDF_THEME.muted, spacingAfter: 0 });

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`Furvise | ${document.pet.name} | Page ${index + 1} of ${pages.length}`, {
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
  return { pdf, lastContentY: state.y, pageHeight: state.pageHeight };
}

type PdfState = {
  compact: boolean;
  pdf: PDFDocument;
  logo: PDFImage;
  petName: string;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
};

function drawSection(state: PdfState, title: string, items: Array<{ date?: string; category?: string; text: string }>) {
  // Keep a heading with the first evidence lines, not an entire long section.
  const first = items[0];
  const firstHeight = first ? wrapText(first.text, state.regular, 10, state.contentWidth).length * 14 + (first.date || first.category ? 18 : 0) : 14;
  ensureSpace(state, Math.min(48 + firstHeight, state.pageHeight - MARGIN - FOOTER_Y - 90));
  drawRule(state);
  drawText(state, title, { font: state.bold, size: 11, color: PDF_THEME.brand, spacingAfter: 9 });
  items.forEach(item => {
    const label = [item.date ? formatItemDate(item.date) : '', item.category].filter(Boolean).join(' | ');
    const height = wrapText(item.text, state.regular, 10, state.contentWidth).length * 14 + (label ? 18 : 0) + 10;
    ensureSpace(state, Math.min(height, state.pageHeight - MARGIN - FOOTER_Y - 90));
    if (label) drawText(state, label, { font: state.bold, size: 8, color: PDF_THEME.muted, spacingAfter: 5 });
    drawText(state, item.text, { font: state.regular, size: 10, color: PDF_THEME.text, spacingAfter: 7 });
  });
  state.y -= 2;
}

function drawText(
  state: PdfState,
  text: string,
  options: { font: PDFFont; size: number; color: typeof PDF_THEME.text; spacingAfter: number },
) {
  const lineHeight = options.size * 1.4;
  const lines = wrapText(text || "Not recorded", options.font, options.size, state.contentWidth);
  for (const line of lines) {
    ensureSpace(state, lineHeight + 4);
    state.page.drawText(line, { x: MARGIN, y: state.y, font: options.font, size: options.size, color: options.color });
    state.y -= lineHeight;
  }
  state.y -= state.compact ? Math.min(options.spacingAfter, 3) : options.spacingAfter;
}

function drawRule(state: PdfState) {
  ensureSpace(state, 12);
  state.page.drawLine({ start: { x: MARGIN, y: state.y }, end: { x: state.pageWidth - MARGIN, y: state.y }, thickness: 0.7, color: PDF_THEME.border });
  state.y -= state.compact ? 9 : 14;
}

function ensureSpace(state: PdfState, required: number) {
  if (state.y - required > FOOTER_Y + 25) return;
  state.page = state.pdf.addPage([state.pageWidth, state.pageHeight]);
  state.y = state.pageHeight - MARGIN;
  state.page.drawImage(state.logo, { x: MARGIN, y: state.y - 16, width: 80, height: 80 * state.logo.height / state.logo.width });
  const continuation = `${state.petName} | Continued`;
  const heading = wrapText(continuation, state.regular, 8, state.contentWidth - 100)[0];
  state.page.drawText(heading, { x: MARGIN + 105, y: state.y - 12, font: state.regular, size: 8, color: PDF_THEME.muted });
  state.y -= 45;
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
