type Schema = Record<string, unknown>;
const enumKeywords = new Set(["type", "enum", "description", "title", "minLength", "maxLength", "pattern"]);
const schemaMaps = new Set(["properties", "$defs", "definitions", "patternProperties", "dependentSchemas"]);
const schemaLists = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const schemaChildren = new Set(["items", "additionalProperties", "contains", "not", "if", "then", "else", "propertyNames"]);

/** Lossless wire-only factoring: identical scalar enum schemas share a definition.
 * Does not interpret inputs, relax constraints, or change the canonical plan.
 * Only schema positions are visited; enum/default/example data is never rewritten.
 */
export function factorProviderEnumSchemas(schema: Schema): Schema {
  const counts = new Map<string, number>();
  const definitions: Schema = { ...(schema.$defs as Schema | undefined) };
  const names = new Map<string, string>();
  const leafKey = (node: Schema) => Array.isArray(node.enum)
    && node.enum.every(value => value === null || ["string", "number", "boolean"].includes(typeof value))
    && Object.keys(node).every(key => enumKeywords.has(key)) ? JSON.stringify(node) : null;

  function visit(value: unknown, transform: (node: Schema) => Schema): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const node = value as Schema;
    const copy: Schema = {};
    for (const [key, child] of Object.entries(node)) {
      if (schemaMaps.has(key) && child && typeof child === "object" && !Array.isArray(child))
        copy[key] = Object.fromEntries(Object.entries(child).map(([name, item]) => [name, visit(item, transform)]));
      else if (schemaLists.has(key) && Array.isArray(child))
        copy[key] = child.map(item => visit(item, transform));
      else if (schemaChildren.has(key)) copy[key] = visit(child, transform);
      else copy[key] = child;
    }
    return transform(copy);
  }

  visit(schema, node => {
    const key = leafKey(node);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
    return node;
  });
  let sequence = 0;
  const result = visit(schema, node => {
    const key = leafKey(node);
    if (!key || (counts.get(key) || 0) < 2) return node;
    let name = names.get(key);
    if (!name) {
      do { name = "sharedEnum" + sequence++; } while (Object.hasOwn(definitions, name));
      names.set(key, name);
      definitions[name] = node;
    }
    return { $ref: "#/$defs/" + name };
  }) as Schema;
  if (names.size) result.$defs = { ...(result.$defs as Schema | undefined),
    ...Object.fromEntries([...names.values()].map(name => [name, definitions[name]])) };

  // Structured Outputs counts enum values across the entire wire schema.
  // Refuse an over-capacity contract before dispatch; never drop allowed values.
  let enumValues = 0;
  visit(result, node => { if (Array.isArray(node.enum)) enumValues += node.enum.length; return node; });
  if (enumValues > 1000) throw new Error("ASK_PROVIDER_SCHEMA_ENUM_CAPACITY");
  return result;
}
