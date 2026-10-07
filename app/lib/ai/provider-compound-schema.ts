type Schema = Record<string, unknown>;
const maps = new Set(["properties", "$defs"]);
const lists = new Set(["anyOf", "oneOf", "allOf"]);
const children = new Set(["items", "additionalProperties"]);
const annotations = new Set(["description", "title", "default", "examples", "$comment"]);
const scalar = new Set(["type", "enum", "const", "required", "minItems", "maxItems",
  "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "uniqueItems", "$ref"]);

/** Exact wire-only sharing. Unsupported reference scopes are left unchanged.
 * Canonical plans, annotations, field/branch order and Binder authority are untouched.
 */
export function factorProviderCompoundSchemas(schema: Schema, checkBudget: () => void = () => {}): Schema {
  checkBudget();
  const original = structuredClone(schema);
  function visit(value: unknown, fn: (node: Schema, root: boolean) => Schema, root = false): unknown {
    checkBudget();
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const node = value as Schema;
    const copy = Object.fromEntries(Object.entries(node).map(([key, child]) => [
      key, maps.has(key) && child && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(Object.entries(child).map(([name, item]) => [name, visit(item, fn)]))
        : lists.has(key) && Array.isArray(child) ? child.map(item => visit(item, fn))
        : children.has(key) ? visit(child, fn) : child,
    ]));
    return fn(copy, root);
  }
  const definitions = (original.$defs || {}) as Schema;
  let safe = true;
  const references = new Set<string>();
  visit(original, (node, root) => {
    if ((!root && Object.hasOwn(node, "$defs")) || Object.keys(node).some(key =>
      !maps.has(key) && !lists.has(key) && !children.has(key) && !annotations.has(key) && !scalar.has(key))) safe = false;
    if (Object.hasOwn(node, "$ref")) {
      const ref = node.$ref;
      if (typeof ref !== "string" || !ref.startsWith("#/$defs/") || ref.slice(8).includes("/")) safe = false;
      else {
        const name = ref.slice(8).replace(/~1/g, "/").replace(/~0/g, "~");
        if (!Object.hasOwn(definitions, name)) safe = false;
        references.add(name);
      }
    }
    return node;
  }, true);
  // Relocation must not alter dynamic scope or turn an existing recursive graph into aliases.
  const done = new Set<string>(), active = new Set<string>();
  function acyclic(name: string): void {
    if (active.has(name)) { safe = false; return; }
    if (done.has(name)) return;
    active.add(name);
    visit(definitions[name], node => {
      if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/"))
        acyclic(node.$ref.slice(8).replace(/~1/g, "/").replace(/~0/g, "~"));
      return node;
    });
    active.delete(name); done.add(name);
  }
  if (safe) for (const name of references) acyclic(name);
  if (!safe) return original;

  const counts = new Map<string, number>();
  const compound = (node: Schema) => !Object.hasOwn(node, "$ref")
    && (Object.hasOwn(node, "properties") || Object.hasOwn(node, "items")
      || [...lists].some(key => Object.hasOwn(node, key)));
  visit(original, (node, root) => {
    if (!root && compound(node)) {
      const key = JSON.stringify(node);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return node;
  }, true);
  const names = new Map<string, string>(), added: Schema = {};
  let sequence = 0;
  // Child-first sharing reaches a fixed point in one pass, including nested duplicates.
  function transform(value: unknown, root = false): unknown {
    checkBudget();
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const node = value as Schema, key = JSON.stringify(node);
    const copy = Object.fromEntries(Object.entries(node).map(([field, child]) => [
      field, maps.has(field) && child && typeof child === "object" && !Array.isArray(child)
        ? Object.fromEntries(Object.entries(child).map(([name, item]) => [name, transform(item)]))
        : lists.has(field) && Array.isArray(child) ? child.map(item => transform(item))
        : children.has(field) ? transform(child) : child,
    ]));
    if (root || !compound(node) || (counts.get(key) || 0) < 2) return copy;
    let name = names.get(key);
    if (!name) {
      do { name = "sharedSchema" + sequence++; } while (Object.hasOwn(definitions, name));
      names.set(key, name); added[name] = copy;
    }
    return { $ref: "#/$defs/" + name };
  }
  const result = transform(original, true) as Schema;
  if (names.size) result.$defs = { ...(result.$defs as Schema | undefined), ...added };
  return result;
}
