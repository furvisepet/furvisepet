// Diagnostics only: never used to decide acceptance or repair input.
const details = new WeakMap();
export function readCanonicalSchemaDiagnostic(error) { return error && typeof error === "object" ? details.get(error) : undefined; }
export function canonicalSchemaError(schema, value, valid) {
  const error = new Error("ASK_WIRE_CANONICAL_SCHEMA");
  let visits = 0;
  const safe = key => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ? key : "<unknown>";
  const fail = (path, keyword) => ({path: path.length > 16 ? "/<bounded>" : "/" + path.join("/"), keyword});
  const walk = (s, v, path = [], depth = 0) => {
    if (++visits > 2048 || depth > 32) return fail([], "bounded");
    if (s.anyOf && !s.anyOf.some(n => valid(n, v))) return fail(path, "anyOf");
    if (s.enum && !valid({enum: s.enum}, v)) return fail(path, "enum");
    const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
    const kind = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    if (types.length && !types.some(t => t === kind || t === "integer" && kind === "number" && Number.isInteger(v))) return fail(path, "type");
    if (kind === "number") {
      if (!Number.isFinite(v)) return fail(path, "type");
      if (s.minimum !== undefined && v < s.minimum) return fail(path, "minimum");
      if (s.maximum !== undefined && v > s.maximum) return fail(path, "maximum");
    }
    if (kind === "string") {
      if (Array.from(v).length < (s.minLength ?? 0)) return fail(path, "minLength");
      if (Array.from(v).length > (s.maxLength ?? Infinity)) return fail(path, "maxLength");
      if (s.pattern && !new RegExp(s.pattern).test(v)) return fail(path, "pattern");
    }
    if (kind === "array") {
      if (v.length < (s.minItems ?? 0)) return fail(path, "minItems");
      if (v.length > (s.maxItems ?? Infinity)) return fail(path, "maxItems");
      for (const x of v) { const d = walk(s.items ?? {}, x, [...path, "*"], depth + 1); if (d) return d; }
    }
    if (kind === "object") {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v))) return fail(path, "type");
      for (const key of s.required ?? []) if (!Object.hasOwn(v, key)) return fail([...path, safe(key)], "required");
      for (const [key, x] of Object.entries(v)) {
        if (Object.hasOwn(s.properties ?? {}, key)) { const d = walk(s.properties[key], x, [...path, safe(key)], depth + 1); if (d) return d; }
        else if (s.additionalProperties === false) return fail([...path, "<unknown>"], "additionalProperties");
      }
    }
    return null;
  };
  try {
    const d = walk(schema, value);
    if (d) details.set(error, Object.freeze({path: d.path.length <= 256 ? d.path : "/<bounded>", keyword: d.keyword}));
  } catch { /* Diagnostics must never change the authoritative rejection. */ }
  return error;
}
