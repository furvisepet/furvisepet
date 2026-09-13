import fontkit, { type Font } from "@pdf-lib/fontkit";
import { fullPdfFont } from "./pdf-font.ts";
import bidiFactory from "bidi-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, beginText, endText, pushGraphicsState, popGraphicsState, setFontAndSize, setTextMatrix, showText, setFillingRgbColor, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { briefTextDirection, briefTextRuns } from "./text-direction.ts";

const bidi = bidiFactory();
const fontFiles = new Map<string, Promise<Uint8Array>>();
const fontBytes = (path: string) => {
  if (!fontFiles.has(path)) fontFiles.set(path, readFile(join(process.cwd(), path)).then(fullPdfFont));
  return fontFiles.get(path)!;
};
export class UnsupportedBriefPdfTextError extends Error {
  constructor() { super("Some characters in this brief need browser printing. Open Print and choose Save as PDF to preserve the full text."); }
}
type Face = { pdf: PDFFont; shape: Font };
type Run = { text: string; face: Face; level: number; start: number; end: number };

/** Unicode bidi order, OpenType shaping/positioning, and searchable logical text.
 * The embedded fonts are pinned local dependencies; rendering makes no network calls. */
export async function createBriefPdfText(pdf: PDFDocument, allText: string, regularBytes: Uint8Array, boldBytes: Uint8Array) {
  const load = async (bytes: Uint8Array): Promise<Face> => ({ pdf: await pdf.embedFont(bytes, { subset: false }), shape: fontkit.create(bytes) });
  const regular = [await load(regularBytes)];
  const bold = [await load(boldBytes)];
  for (const [needed, family, subset] of [
    [/[\u0600-\u08ff]/u.test(allText), "noto-sans-arabic", "arabic"],
    [/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(allText), "noto-sans-jp", "japanese"],
  ] as const) {
    if (!needed) continue;
    for (const [weight, faces] of [[400, regular], [700, bold]] as const) {
      faces.push(await load(await fontBytes(`node_modules/@fontsource/${family}/files/${family}-${subset}-${weight}-normal.woff`)));
    }
  }
  const selectFaces = (font: PDFFont) => font === bold[0].pdf ? bold : regular;
  function runs(text: string, font: PDFFont) {
    const direction = briefTextDirection(text);
    const isolated = direction === "rtl" ? briefTextRuns(text).map(run => run.isolate ? `\u2066${run.text}\u2069` : run.text).join("") : text;
    const embedding = bidi.getEmbeddingLevels(isolated, direction);
    const mirrors = bidi.getMirroredCharactersMap(isolated, embedding);
    const faces = selectFaces(font);
    const logical: Run[] = [];
    let offset = 0;
    for (const character of isolated) {
      const index = offset; offset += character.length;
      if (/[\u2066-\u2069\u200e\u200f]/u.test(character)) continue;
      const displayed = mirrors.get(index) || character;
      const previous = logical.at(-1);
      const face = /\s/u.test(displayed) && previous ? previous.face : faces.find(f => f.shape.hasGlyphForCodePoint(displayed.codePointAt(0)!));
      if (!face) throw new UnsupportedBriefPdfTextError();
      const level = embedding.levels[index];
      if (previous && previous.face === face && previous.level === level && previous.end === index) {
        previous.text += displayed; previous.end = offset;
      } else logical.push({ text: displayed, face, level, start: index, end: offset });
    }
    const indices = Array.from({ length: isolated.length }, (_, index) => index);
    for (const [from, to] of bidi.getReorderSegments(isolated, embedding)) {
      const reversed = indices.slice(from, to + 1).reverse();
      indices.splice(from, reversed.length, ...reversed);
    }
    const rank = new Map(indices.map((index, position) => [index, position]));
    return logical.sort((a, b) => Math.min(rank.get(a.start)!, rank.get(a.end - 1)!) - Math.min(rank.get(b.start)!, rank.get(b.end - 1)!));
  }
  const width = (text: string, font: PDFFont, size: number) => runs(text, font).reduce((sum, run) => sum + run.face.shape.layout(run.text).positions.reduce((n, position) => n + position.xAdvance, 0) * size / run.face.shape.unitsPerEm, 0);
  function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
    const normalized = text.replace(/\s+/gu, " ").trim() || "Not recorded";
    const lines: string[] = [];
    let line = "";
    for (const token of normalized.match(/\S+\s*/gu) || []) {
      if (width((line + token).trimEnd(), font, size) <= maxWidth) { line += token; continue; }
      if (line.trim()) { lines.push(line.trimEnd()); line = ""; }
      if (width(token.trimEnd(), font, size) <= maxWidth) { line = token; continue; }
      // CJK and other long unspaced text break at grapheme boundaries, never
      // between a base character and its combining marks or by adding spaces.
      for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(token)) {
        if (line && width(line + segment, font, size) > maxWidth) { lines.push(line.trimEnd()); line = ""; }
        line += segment;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    return lines;
  }
  function draw(page: PDFPage, text: string, font: PDFFont, size: number, x: number, y: number, maxWidth: number, color: RGB) {
    let cursor = x + (briefTextDirection(text) === "rtl" ? maxWidth - width(text, font, size) : 0);
    page.pushOperators(pushGraphicsState(), setFillingRgbColor(color.red, color.green, color.blue),
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("Span"), pdf.context.obj({ ActualText: PDFHexString.fromText(text) }).toString()]));
    for (const run of runs(text, font)) {
      const shaped = run.face.shape.layout(run.text);
      const codes = run.face.pdf.encodeText(run.text).asString().match(/.{4}/g) || [];
      const positions = [...shaped.positions];
      if (Boolean(run.level & 1) !== (shaped.direction === "rtl")) { positions.reverse(); codes.reverse(); }
      if (codes.length !== positions.length) throw new Error("Vet Brief glyph layout mismatch");
      const name = page.node.newFontDictionary(run.face.pdf.name, run.face.pdf.ref);
      const scale = size / run.face.shape.unitsPerEm;
      page.pushOperators(beginText(), setFontAndSize(name, size));
      positions.forEach((position, index) => {
        page.pushOperators(setTextMatrix(1, 0, 0, 1, cursor + position.xOffset * scale, y + position.yOffset * scale), showText(PDFHexString.of(codes[index])));
        cursor += position.xAdvance * scale;
      });
      page.pushOperators(endText());
    }
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent), popGraphicsState());
  }
  return { regular: regular[0].pdf, bold: bold[0].pdf, width, wrap, draw };
}
