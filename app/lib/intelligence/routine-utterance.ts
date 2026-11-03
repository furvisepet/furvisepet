function validRoutineDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("9999")) return false;
  const parsed = new Date(date + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
type Pet = { id: string; user_id: string; name: string; sex?: string | null };
/** Only this complete utterance, for one owned selected pet, can ask for a year. */
export function parseRoutineUtterance(text: string, pet: Pet, pets: readonly Pet[], owner: string): { issue: "missing_year" | "invalid_date" | null; date: string | null } | null {
  if (!pet.name || pet.name.length > 100 || pet.user_id !== owner) return null;
  const key = (s: string) => s.normalize("NFKC").toLocaleLowerCase("en");
  if (pets.filter(p => p.user_id === owner && key(p.name) === key(pet.name)).length !== 1) return null;
  const escaped = pet.name.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
  const months = "January|February|March|April|May|June|July|August|September|October|November|December";
  const grammar = new RegExp("^What did " + escaped + "['’]s (" + months + ") (\\d{1,2})(?:,? (\\d{4}))? care note say about (her|his|their|its) routine\\?$", "i");
  const m = grammar.exec(text.trim());
  if (!m) return null;
  const pronoun = m[4].toLowerCase();
  if (pronoun === "her" && pet.sex !== "female" || pronoun === "his" && pet.sex !== "male") return null;

  const month = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(m[1].toLowerCase()) + 1;
  // Leap year 2000 accepts February 29 while rejecting impossible month/day.
  const date = (m[3] || "2000") + "-" + String(month).padStart(2,"0") + "-" + m[2].padStart(2,"0");
  if (!validRoutineDate(date)) return { issue: "invalid_date", date: null };
  if (!m[3]) return { issue: "missing_year", date: null };
  return { issue: null, date };
}
