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
const instant = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const identity = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;
/** Shape validation only. The writer/importer separately binds source and exact target ownership. */
export function readSourceSemantics(value: unknown): SourceSemantics | null {
  if (!object(value) || !keys(value, ["classification", "target"])
    || !["observation", "attributed_correction", "unknown"].includes(String(value.classification))) return null;
  const t = value.target;
  if (value.classification !== "attributed_correction") return t === null ? value as SourceSemantics : null;
  if (!object(t)) return null;
  if (t.kind === "target_unknown") return keys(t, ["kind"]) ? value as SourceSemantics : null;
  if (t.kind === "source" || t.kind === "claim") return keys(t, ["kind", "id"]) && identity(t.id) ? value as SourceSemantics : null;
  if (t.kind !== "scope" || !keys(t, ["kind", "from", "to", "conceptKey"])
    || t.from !== null && !instant(t.from) || t.to !== null && !instant(t.to)
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
export const sourceSemanticsSchema = {
  type: "object", additionalProperties: false, required: ["classification", "target"],
  description: "Typed meaning of this exact USER record body, interpreted once here. observation for a factual report; attributed_correction if the body reports that earlier history is wrong; unknown when unclear. Attribution is not permission to supersede. Describe the referenced historical interval, never the time this correction was recorded. No invented target.",
  properties: {
    classification: { type: "string", enum: ["observation", "attributed_correction", "unknown"] },
    target: { anyOf: [
      { type: "null" },
      { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { type: "string", enum: ["target_unknown"] } } },
      { type: "object", additionalProperties: false, required: ["kind", "from", "to", "conceptKey"], properties: {
        kind: { type: "string", enum: ["scope"] }, from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
        conceptKey: { type: "null", description: "No canonical concept identity is supplied at this write boundary." },
      } },
    ] },
  },
};
