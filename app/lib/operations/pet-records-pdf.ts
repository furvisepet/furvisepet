import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFName, type PDFPage } from "pdf-lib";
import { PDF_THEME } from "../vet-brief/pdf.ts";
import { createBriefPdfText, UnsupportedBriefPdfTextError } from "../vet-brief/pdf-text.ts";

type Row = Record<string, unknown>;
const WIDTH = 612;
const HEIGHT = 792;
const MARGIN = 48;
const TEXT_WIDTH = WIDTH - 2 * MARGIN;
const fontData = () => Promise.all([
  readFile(join(process.cwd(), "public/fonts/Inter-Regular.ttf")),
  readFile(join(process.cwd(), "public/fonts/Inter-Bold.ttf")),
]);

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const label = (value: unknown) => text(value).replaceAll("_", " ").replace(/^[a-z]/, c => c.toUpperCase());
const quantity = (value: unknown, unit: unknown) =>
  typeof value === "number" && text(unit) ? value + " " + text(unit) : "";

function profileFields(pet: Row) {
  return [
    ["Species", label(pet.species)], ["Breed", text(pet.breed)], ["Sex", label(pet.sex)],
    ["Age on profile", quantity(pet.age_value, pet.age_unit)], ["Weight on profile", quantity(pet.weight_value, pet.weight_unit)],
    ["Current food", text(pet.current_food)], ["Main concern", label(pet.main_concern)], ["Wellness goal", label(pet.wellness_goal)],
    ["Avoid ingredients", Array.isArray(pet.avoid_ingredients) ? pet.avoid_ingredients.map(text).filter(Boolean).join(", ") : ""],
    ["Routine", text(pet.routine_note)],
  ].filter(([, value]) => Boolean(value));
}

export async function renderPetRecordsPdf(
  records: { pets: Row[]; entries: Row[] },
  { date, timeZone }: { date: Date; timeZone: string },
) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await fontData();
  // Only the fixed pet and care projections reach the renderer.
  const layout = await createBriefPdfText(pdf, JSON.stringify(records), regularBytes, boldBytes);
  const { regular, bold } = layout;
  const { brand, text: ink, muted, border, accent } = PDF_THEME;
  const dateLabel = new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "long" });
  const yearLabel = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" });

  // Preserve unfamiliar symbols in a readable form even when a local
  // font cannot print them. The original text remains in the JSON export.
  let fallbackUsed = false;
  const printable = new Map<string, string>();
  function supported(line: string) {
    if (/^[\u0020-\u007e\t\r]*$/.test(line)) return line;
    const cached = printable.get(line);
    if (cached !== undefined) return cached;
    try {
      layout.width(line || " ", regular, 10);
      return line;
    } catch (error) {
      if (!(error instanceof UnsupportedBriefPdfTextError)) throw error;
    }
    const normalized = [...line].map(char => {
      if (/[\u200c\u200d\ufe0e\ufe0f]/u.test(char)) return "";
      try {
        layout.width(char, regular, 10);
        return char;
      } catch (error) {
        if (!(error instanceof UnsupportedBriefPdfTextError)) throw error;
        fallbackUsed = true;
        return "[U+" + char.codePointAt(0)!.toString(16).toUpperCase() + "]";
      }
    }).join("");
    printable.set(line, normalized);
    return normalized;
  }

  let page: PDFPage;
  let y = 0;
  let section = "Pet index";
  function newPage() {
    page = pdf.addPage([WIDTH, HEIGHT]);
    page.drawText("FURVISE  /  PET CARE RECORDS", { x: MARGIN, y: HEIGHT - 32, font: bold, size: 8, color: brand });
    page.drawLine({ start: { x: MARGIN, y: HEIGHT - 43 }, end: { x: WIDTH - MARGIN, y: HEIGHT - 43 }, thickness: 0.65, color: border });
    y = HEIGHT - 69;
  }
  function reserve(height: number) {
    if (y - height >= 61) return;
    newPage();
    const heading = layout.wrap(supported(section), bold, 10, TEXT_WIDTH)[0];
    layout.draw(page, heading, bold, 10, MARGIN, y, TEXT_WIDTH, brand);
    y -= 23;
  }
  function write(value: string, options: { size?: number; strong?: boolean; color?: typeof ink; after?: number } = {}) {
    if (!value) return;
    const { size = 10, strong = false, color = ink, after = 5 } = options;
    const font = strong ? bold : regular;
    for (const paragraph of value.split("\n")) {
      for (const line of layout.wrap(supported(paragraph), font, size, TEXT_WIDTH)) {
        reserve(size * 1.4);
        layout.draw(page, line, font, size, MARGIN, y, TEXT_WIDTH, color);
        y -= size * 1.4;
      }
    }
    y -= after;
  }

  const groups = new Map<string, Row[]>();
  const pets = [...records.pets].sort((a, b) => text(a.name).localeCompare(text(b.name)));
  for (const pet of pets) groups.set(text(pet.id), []);
  const other: Row[] = [];
  for (const entry of records.entries) (groups.get(text(entry.pet_profile_id)) ?? other).push(entry);
  const sections = pets.map(pet => ({ name: text(pet.name) || "Unnamed pet", fields: profileFields(pet), entries: groups.get(text(pet.id))! }));
  if (other.length) sections.push({ name: "Entries without a pet profile", fields: [], entries: other });

  newPage();
  write("Pet care records", { size: 34, strong: true, color: brand, after: 12 });
  write(pets.length + " pet profiles  |  " + records.entries.length + " care entries  |  " + dateLabel.format(date), { color: muted, after: 13 });
  write("Select a pet to jump to its profile and dated care entries. Dates use " + timeZone + ".", { color: muted, after: 15 });
  write("PET INDEX", { size: 10, strong: true, color: brand });
  const links = sections.map(item => {
    reserve(27);
    const indexPage = page;
    const top = y + 10;
    page.drawRectangle({ x: MARGIN - 4, y: y - 13, width: TEXT_WIDTH + 8, height: 24, color: accent });
    const name = layout.wrap(supported(item.name), bold, 10, TEXT_WIDTH - 105)[0];
    layout.draw(page, name, bold, 10, MARGIN, y - 2, TEXT_WIDTH - 105, brand);
    page.drawText(String(item.entries.length) + " entries", { x: WIDTH - MARGIN - 83, y: y - 2, font: regular, size: 9, color: muted });
    y -= 27;
    return { indexPage, top };
  });
  if (!sections.length) write("No pet profiles or care entries were found.", { color: muted });
  write("Includes pet profiles and saved care entries.", { color: muted });

  sections.forEach((item, index) => {
    section = item.name;
    newPage();
    const { indexPage, top } = links[index];
    const link = pdf.context.obj({
      Type: "Annot", Subtype: "Link",
      Rect: [MARGIN - 4, top - 23, WIDTH - MARGIN + 4, top],
      Border: [0, 0, 0],
      Dest: [page.ref, PDFName.of("Fit")],
    });
    indexPage.node.addAnnot(pdf.context.register(link));
    write(item.name, { size: 28, strong: true, color: brand, after: 11 });
    for (const [field, value] of item.fields) write(field + ": " + value);
    y -= 12;
    write("CARE HISTORY", { strong: true, color: brand, after: 6 });
    if (!item.entries.length) write("No care entries recorded.", { color: muted });
    let lastYear = "";
    for (const entry of item.entries.sort((a, b) => text(b.occurred_at).localeCompare(text(a.occurred_at)))) {
      const when = new Date(text(entry.occurred_at));
      const validDate = Number.isFinite(when.getTime());
      const year = validDate ? yearLabel.format(when) : "Undated";
      reserve(year === lastYear ? 47 : 70);
      if (year !== lastYear) {
        write(year, { size: 14, strong: true, color: brand });
        lastYear = year;
      }
      write([validDate ? dateLabel.format(when) : "Date unknown", label(entry.category), label(entry.severity)].filter(Boolean).join("  |  "),
        { size: 8, strong: true, color: brand, after: 3 });
      write(text(entry.title), { strong: true, after: 2 });
      write(text(entry.note), { after: 9 });
    }
  });
  if (fallbackUsed) {
    section = "About this report";
    write("Some symbols are shown as Unicode codes. The full account download preserves the original text.", { color: muted });
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: WIDTH - MARGIN, y: 44 }, thickness: 0.65, color: border });
    item.drawText("Furvise  |  Page " + (index + 1) + " of " + pages.length, { x: MARGIN, y: 30, font: regular, size: 8, color: muted });
  });
  pdf.setTitle("Furvise Pet Care Records");
  pdf.setCreator("Furvise");
  return pdf.save();
}
