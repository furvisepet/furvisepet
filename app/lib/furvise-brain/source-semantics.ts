/** Attributed source semantics, never an effective graph edge or factual certificate. */
export type CorrectionTarget =
  | Readonly<{ kind: "target_unknown" }>
  | Readonly<{ kind: "scope"; from: string | null; to: string | null; conceptKey: string | null }>
  | Readonly<{ kind: "source"; id: string }>
  | Readonly<{ kind: "claim"; id: string }>;
export type SourceSemantics = Readonly<{
  classification: "observation" | "attributed_correction" | "unknown";
  target: CorrectionTarget | null;
}>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).sort().join() === [...names].sort().join();
/** source-semantics-instant.v1: Gregorian years 0001..9999, explicit known
 * zone, seconds 00..59, optional 1..3 decimal digits, offsets up to 14:00.
 * No rollover, leap-second, 24:00, unknown -00:00 offset, or zone inference. */
export const SOURCE_SEMANTICS_INSTANT_PATTERN = "^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([.][0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$";
const instantPattern = new RegExp(SOURCE_SEMANTICS_INSTANT_PATTERN);
export function isSourceSemanticsInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = instantPattern.exec(value);
  // JS $ can precede a final newline. Require the entire original byte string.
  if (!m || m[0] !== value) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return false;
  const zone = m[8];
  if (zone !== "Z") {
    const zh = Number(zone.slice(1, 3)), zm = Number(zone.slice(4, 6));
    if (zone === "-00:00" || zh > 14 || zm > 59 || zh === 14 && zm !== 0) return false;
  }
  return Number.isFinite(Date.parse(value));
}
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;
/** Shape validation only. The writer/importer separately binds source and exact target ownership. */
export function readSourceSemantics(value: unknown): SourceSemantics | null {
  if (!object(value) || !keys(value, ["classification", "target"])
    || typeof value.classification !== "string" || !["observation", "attributed_correction", "unknown"].includes(value.classification)) return null;
  const t = value.target;
  if (value.classification !== "attributed_correction") return t === null ? value as SourceSemantics : null;
  if (!object(t)) return null;
  if (t.kind === "target_unknown") return keys(t, ["kind"]) ? value as SourceSemantics : null;
  if (t.kind === "source" || t.kind === "claim") return keys(t, ["kind", "id"]) && identity(t.id) ? value as SourceSemantics : null;
  if (t.kind !== "scope" || !keys(t, ["kind", "from", "to", "conceptKey"])
    || t.from !== null && !isSourceSemanticsInstant(t.from) || t.to !== null && !isSourceSemanticsInstant(t.to)
    || t.from && t.to && Date.parse(String(t.from)) >= Date.parse(String(t.to))
    || t.conceptKey !== null && (!identity(t.conceptKey) || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(t.conceptKey))) return null;
  return value as SourceSemantics;
}

/** New writes can propose a scoped/unknown attribution, never an unbound database target ID. */
export function readWriteSourceSemantics(value: unknown): SourceSemantics | null {
  const result = readSourceSemantics(value);
  return result && (!result.target || result.target.kind === "target_unknown"
    || result.target.kind === "scope" && result.target.conceptKey === null) ? result : null;
}
const attributionTargetSchema = {
  anyOf: [
    { type: "object", additionalProperties: false, required: ["kind"],
      properties: { kind: { type: "string", enum: ["target_unknown"] } } },
    { type: "object", additionalProperties: false, required: ["kind", "from", "to", "conceptKey"], properties: {
      kind: { type: "string", enum: ["scope"] }, from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
      conceptKey: { type: "null", description: "No canonical concept identity is supplied at this write boundary." },
    } },
  ],
};
export const sourceSemanticsSchema = {
  description: "Typed meaning of this exact USER record body, interpreted once here. observation for a factual report; attributed_correction if the body reports that earlier history is wrong; unknown when unclear. Attribution is not permission to supersede. Describe the referenced historical interval, never the time this correction was recorded. No invented target.",
  anyOf: [
    { type: "object", additionalProperties: false, required: ["classification", "target"], properties: {
      classification: { type: "string", enum: ["observation", "unknown"] },
      target: { type: "null", description: "Observations and unknown classifications carry no correction target." },
    } },
    { type: "object", additionalProperties: false, required: ["classification", "target"], properties: {
      classification: { type: "string", enum: ["attributed_correction"] },
      target: attributionTargetSchema,
    } },
  ],
};
