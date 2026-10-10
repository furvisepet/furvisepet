import { createHash } from "node:crypto";
import { types } from "node:util";

const MAX_SCHEMA_CHARACTERS = 200_000;
const MAX_VALUES = 40_000;
const MAX_DEPTH = 64;
const MAX_MESSAGE_CHARACTERS = 4096;
const MAX_PATH_CHARACTERS = 512;
type Rule = "unrecognized" | "any_of_first_key_collision" | "additional_properties_false_required" | "required_properties_mismatch" | "unsupported_schema_keyword";
type SchemaDiagnostic = Readonly<{ sha256: string; rule: Rule; path: string | null }>;
type Snapshot = { sha256: string; name: string; paths: Map<string, string> };
// Only this module can attach provenance. Provider-owned "schema" properties
// and copies of diagnostic-looking objects are never accepted as diagnostics.
const diagnostics = new WeakMap<object, SchemaDiagnostic>();
function object(value: unknown): value is object {
  return value !== null && typeof value === "object" && !types.isProxy(value);
}
function own(value: unknown, key: string): unknown {
  if (!object(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

// The final admitted request is server-owned. Still reject accessors, proxies,
// custom prototypes, serialization hooks and cycles before JSON.stringify.
// Traversal/size/depth bounds also apply to failing diagnostic inputs.
function plainJson(value: unknown): boolean {
  const active = new Set<object>();
  const stack: Array<{ value: unknown; depth: number; leave?: boolean }> = [{ value, depth: 0 }];
  let count = 0, characters = 0;
  if (Object.getOwnPropertyDescriptor(Object.prototype, "toJSON")
    || Object.getOwnPropertyDescriptor(Array.prototype, "toJSON")) return false;
  while (stack.length) {
    const entry = stack.pop()!;
    if (own(entry, "leave") === true) { active.delete(entry.value as object); continue; }
    if (++count > MAX_VALUES || entry.depth > MAX_DEPTH) return false;
    const current = entry.value;
    if (current === null || typeof current === "boolean") continue;
    if (typeof current === "number") { if (!Number.isFinite(current)) return false; continue; }
    if (typeof current === "string") { characters += current.length; if (characters > MAX_SCHEMA_CHARACTERS) return false; continue; }
    if (!object(current) || active.has(current)) return false;
    const proto = Object.getPrototypeOf(current), array = Array.isArray(current);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return false;
    const remaining = MAX_VALUES - count - stack.length;
    const length = array ? own(current, "length") : 0;
    // Array serialization visits every index, including holes and inherited
    // accessors. Check length BEFORE enumerating or serializing, then prove
    // every index is an enumerable own data property in the loop below.
    if (array && (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > remaining)) return false;
    const keys = Reflect.ownKeys(current);
    if (keys.length > remaining + (array ? 1 : 0)
      || array && keys.length !== (length as number) + 1
      || keys.some(key => typeof key !== "string" || key === "toJSON")) return false;
    active.add(current); stack.push({ value: current, depth: entry.depth, leave: true });
    for (const key of keys as string[]) {
      if (array && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key)!;
      if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) return false;
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= (length as number))) return false;
      characters += key.length;
      if (characters > MAX_SCHEMA_CHARACTERS) return false;
      stack.push({ value: descriptor.value, depth: entry.depth + 1 });
    }
  }
  return true;
}
function capture(request: unknown): Snapshot | undefined {
  try {
    const format = own(own(request, "text"), "format");
    if (own(format, "type") !== "json_schema") return undefined;
    const schema = own(format, "schema"), name = own(format, "name");
    if (!object(schema) || !plainJson(schema)) return undefined;
    // Do not canonicalize/sort: property insertion order is provider grammar.
    const serialized = JSON.stringify(schema);
    if (serialized.length > MAX_SCHEMA_CHARACTERS) return undefined;
    const paths = new Map<string, string>();
    const visit = (node: Record<string, unknown>, raw: string[], safe: string) => {
      if (!node || typeof node !== "object" || Array.isArray(node) || safe.length > MAX_PATH_CHARACTERS) return;
      paths.set(JSON.stringify(raw), safe);
      for (const keyword of ["properties", "$defs"]) {
        const children = own(node, keyword);
        if (children && typeof children === "object" && !Array.isArray(children))
          Object.entries(children).forEach(([key, child], index) => visit(child as Record<string, unknown>,
            [...raw, keyword, key], safe + "/" + keyword + "/[" + index + "]"));
      }
      const variants = own(node, "anyOf"), items = own(node, "items");
      if (Array.isArray(variants)) variants.forEach((child, index) => visit(child,
        [...raw, "anyOf", String(index)], safe + "/anyOf/" + index));
      if (items && typeof items === "object" && !Array.isArray(items))
        visit(items as Record<string, unknown>, [...raw, "items"], safe + "/items");
    };
    visit(JSON.parse(serialized), [], "#");
    return { sha256: createHash("sha256").update(serialized, "utf8").digest("hex"),
      name: typeof name === "string" && name.length <= 64 && /^[A-Za-z0-9_-]+$/.test(name) ? name : "", paths };
  } catch { return undefined; }
}
function contextPath(text: string, snapshot: Snapshot): string | null {
  if (text.length > MAX_PATH_CHARACTERS) return null;
  if (text === "") return "#";
  const parts = text.split(",").map(part => part.trim());
  if (parts.at(-1) === "") parts.pop();
  if (parts.length > 32) return null;
  const segments: string[] = [];
  for (const part of parts) {
    // No evaluation, escape decoding, coercion, arbitrary member lookup or
    // traversal into enum/const/default/description/required instance values.
    if (/^'[^'\\\r\n]{1,128}'$/.test(part)) segments.push(part.slice(1, -1));
    else if (/^(0|[1-9][0-9]{0,4})$/.test(part)) segments.push(part);
    else return null;
  }
  return snapshot.paths.get(JSON.stringify(segments)) ?? null;
}
function summarize(error: unknown, snapshot: Snapshot): SchemaDiagnostic | undefined {
  const detail = own(error, "error");
  if ((own(error, "code") ?? own(detail, "code")) !== "invalid_json_schema"
    || (own(error, "param") ?? own(detail, "param")) !== "text.format.schema") return undefined;
  const base: SchemaDiagnostic = { sha256: snapshot.sha256, rule: "unrecognized", path: null };
  const rawMessage = own(detail, "message") ?? own(error, "message");
  if (typeof rawMessage !== "string" || rawMessage.length > MAX_MESSAGE_CHARACTERS) return base;
  let message: string = rawMessage;
  const prefix = "Invalid schema for response_format '" + snapshot.name + "': ";
  if (snapshot.name && message.startsWith(prefix)) message = message.slice(prefix.length);
  const match = /^In context=\(([^)]*)\), ([^\r\n]+)$/.exec(message);
  if (!match) return base;
  const path = contextPath(match[1], snapshot);
  if (path === null) return base;
  const rules: ReadonlyArray<readonly [string, Rule]> = [
    ["Objects provided via 'anyOf' must not share identical first keys. Consider adding a discriminator key or rearranging the properties to ensure the first key is unique.", "any_of_first_key_collision"],
    ["'additionalProperties' is required to be supplied and to be false.", "additional_properties_false_required"],
    ["'required' is required to be supplied and to be an array including every key in properties.", "required_properties_mismatch"],
  ];
  const rule = rules.find(([text]) => text === match[2])?.[1]
    ?? (/^'(allOf|not|dependentRequired|dependentSchemas|if|then|else|patternProperties|unevaluatedProperties|uniqueItems)' is not permitted\.$/.test(match[2]) ? "unsupported_schema_keyword" : undefined);
  return rule ? { sha256: snapshot.sha256, rule, path } : base;
}
function remember(value: unknown, snapshot: Snapshot | undefined) {
  if (!object(value)) return;
  diagnostics.delete(value); // A reused fake/SDK error cannot inherit another request's fingerprint.
  if (!snapshot) return;
  try { const diagnostic = summarize(value, snapshot); if (diagnostic) diagnostics.set(value, Object.freeze(diagnostic)); } catch { /* Diagnostics never replace a provider result/error. */ }
}

/** Called inside the existing deadline, after admission, immediately at SDK IO. */
export async function withAskProviderSchemaDiagnostic<T>(request: unknown, invoke: () => PromiseLike<T>): Promise<T> {
  const snapshot = capture(request);
  try {
    const response = await invoke();
    remember(response, snapshot);
    return response;
  } catch (error) {
    remember(error, snapshot);
    throw error;
  }
}

/** Reprojection preserves only module-generated diagnostics, never provider fields. */
export function attachAskProviderSchemaDiagnostic<T extends object>(error: unknown, projection: T): T & { schema?: SchemaDiagnostic } {
  const diagnostic = object(error) ? diagnostics.get(error) : undefined;
  if (!diagnostic) return projection;
  const result = { ...projection, schema: diagnostic };
  diagnostics.set(result, diagnostic);
  return result;
}
