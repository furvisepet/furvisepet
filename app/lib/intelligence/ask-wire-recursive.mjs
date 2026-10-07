// Lossless recursive provider transport; the original strict codec remains authoritative.
import { canonical, expand } from "./ask-wire-codec.mjs";

const ensure = (ok, code) => { if (!ok) throw Error("ASK_RECURSIVE_" + code); };
const plain = value => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Additional adapter ceilings; these never replace admission or provider caps.
export const RECURSIVE_TRANSPORT_LIMITS = Object.freeze({
  maxDepth: 64, maxContainers: 4096, maxValues: 32768,
  maxContainerEntries: 4096, maxStringUnits: 65536, maxSerializedCharacters: 131072,
});

function boundedCopy(value, checkRuntime, limits) {
  ensure(typeof checkRuntime === "function", "RUNTIME_DEADLINE_REQUIRED");
  const seen = new WeakSet();
  let containers = 0, values = 0, characters = 0;
  const charge = n => {
    characters += n;
    ensure(characters <= limits.maxSerializedCharacters, "SERIALIZED_LIMIT");
  };
  function copy(v, depth) {
    checkRuntime();
    ensure(depth <= limits.maxDepth, "DEPTH");
    ensure(++values <= limits.maxValues, "VALUE_LIMIT");
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) {
      charge(JSON.stringify(v).length); return v;
    }
    if (typeof v === "string") {
      ensure(v.length <= limits.maxStringUnits, "STRING_LIMIT");
      charge(JSON.stringify(v).length); return v;
    }
    ensure(v !== null && typeof v === "object", "JSON_VALUE");
    ensure(!seen.has(v), "CYCLE_OR_REUSED_CONTAINER"); seen.add(v);
    ensure(++containers <= limits.maxContainers, "CONTAINER_LIMIT");
    const array = Array.isArray(v);
    ensure(array ? Object.getPrototypeOf(v) === Array.prototype : plain(v), "PLAIN_CONTAINER");
    const keys = Reflect.ownKeys(v);
    if (array) {
      ensure(v.length <= limits.maxContainerEntries, "ENTRY_LIMIT");
      ensure(keys.length === v.length + 1 && keys.every(k => k === "length"
        || (typeof k === "string" && /^(0|[1-9]\d*)$/.test(k) && Number(k) < v.length)), "ARRAY_SHAPE");
    } else ensure(keys.length <= limits.maxContainerEntries, "ENTRY_LIMIT");
    const entries = [];
    charge(2);
    for (const k of keys) {
      checkRuntime();
      if (array && k === "length") continue;
      ensure(typeof k === "string", "OWN_DATA_PROPERTY");
      const descriptor = Object.getOwnPropertyDescriptor(v, k);
      ensure(descriptor && Object.hasOwn(descriptor, "value") && descriptor.enumerable, "OWN_DATA_PROPERTY");
      if (entries.length) charge(1);
      if (!array) {
        ensure(k.length <= limits.maxStringUnits, "STRING_LIMIT");
        charge(JSON.stringify(k).length + 1);
      }
      entries.push([k, copy(descriptor.value, depth + 1)]);
    }
    return array ? entries.map(([, x]) => x) : Object.fromEntries(entries);
  }
  const copied = copy(value, 0);
  checkRuntime();
  return copied;
}

/**
 * Accept a trusted, already compiled graph codec. No policies, aliases, semantic
 * branches or authority rules are regenerated. Every returned graph is checked
 * by that exact codec's strict decoder.
 *
 * Each conversion requires its own current operation's runtime deadline check.
 * The compilation callback is used only while constructing this transport.
 */
export function createRecursiveProviderTransport(codec, checkCompilation = () => {}, lowerLimits = {}) {
  ensure(typeof checkCompilation === "function", "COMPILATION_DEADLINE");
  checkCompilation();
  ensure(typeof codec?.decode === "function" && codec.schema?.properties?.nodes?.items
    && codec.rootSchema, "COMPILED_CODEC");
  const limits = { ...RECURSIVE_TRANSPORT_LIMITS };
  for (const [key, value] of Object.entries(lowerLimits)) {
    ensure(Object.hasOwn(limits, key) && Number.isSafeInteger(value)
      && value >= 1 && value <= limits[key], "LIMIT_CONFIGURATION");
    limits[key] = value;
  }
  Object.freeze(limits);
  const compiled = codec.schema, defs = compiled.$defs ?? {};
  let nodeName = "recursiveNode";
  while (Object.hasOwn(defs, nodeName)) { checkCompilation(); nodeName += "_"; }
  const nodeRef = "#/$defs/" + nodeName;
  const edge = { type: "object", additionalProperties: false, required: ["@"],
    properties: { "@": { type: "integer", minimum: 0 } } };
  function schemaNode(n) {
    checkCompilation();
    ensure(plain(n), "SCHEMA_NODE");
    if (Object.hasOwn(n.properties ?? {}, "@")) {
      ensure(canonical(expand({ ...n, $defs: defs }, checkCompilation)) === canonical(edge), "EDGE_SCHEMA");
      return { $ref: nodeRef };
    }
    // Visit schema positions only; enum literals and descriptions stay opaque.
    const out = structuredClone(n);
    for (const key of ["properties", "$defs"]) if (n[key])
      out[key] = Object.fromEntries(Object.entries(n[key]).map(([k, s]) => [k, schemaNode(s)]));
    if (n.anyOf) out.anyOf = n.anyOf.map(schemaNode);
    if (n.items) out.items = schemaNode(n.items);
    return out;
  }
  const schema = {
    type: "object", additionalProperties: false, required: ["root"],
    properties: { root: schemaNode(codec.rootSchema) },
    $defs: {
      ...Object.fromEntries(Object.entries(defs).map(([k, s]) => [k, schemaNode(s)])),
      [nodeName]: schemaNode(compiled.properties.nodes.items),
    },
  };
  checkCompilation();
  const strictDecode = codec.decode;
  function checkedDecode(graph, checkRuntime) {
    checkRuntime();
    const value = strictDecode(graph);
    checkRuntime();
    return value;
  }
  function rebuild(envelope, checkRuntime) {
    const clean = boundedCopy(envelope, checkRuntime, limits);
    ensure(plain(clean) && Object.keys(clean).length === 1
      && Object.hasOwn(clean, "root") && plain(clean.root), "OWN_ROOT_ENVELOPE");
    const nodes = [];
    function visit(v) {
      checkRuntime();
      if (Array.isArray(v)) return v.map(visit);
      if (!plain(v)) return v;
      ensure(!Object.hasOwn(v, "@"), "INDEXED_REFERENCE");
      // Packing renames f to f~tag AFTER graph indexing. Traverse by the
      // original alias so a~tag precedes aa, as it did before packing.
      const keys = Object.keys(v).sort((a, b) => compare(a.split("~")[0], b.split("~")[0]) || compare(a, b));
      const node = Object.fromEntries(keys.map(k => [k, visit(v[k])]));
      const index = nodes.length;
      ensure(index < limits.maxContainers, "CONTAINER_LIMIT");
      nodes.push(node);
      return { "@": index };
    }
    visit(clean.root);
    checkRuntime();
    return { nodes };
  }
  function fromGraph(graph, checkRuntime) {
    const clean = boundedCopy(graph, checkRuntime, limits);
    // Refuse invalid captured graphs; never turn a bad edge into a guessed tree.
    checkedDecode(clean, checkRuntime);
    function node(index) {
      checkRuntime();
      function value(v) {
        checkRuntime();
        if (Array.isArray(v)) return v.map(value);
        return plain(v) ? node(v["@"]) : v;
      }
      return Object.fromEntries(Object.entries(clean.nodes[index]).map(([k, v]) => [k, value(v)]));
    }
    return boundedCopy({ root: node(clean.nodes.length - 1) }, checkRuntime, limits);
  }
  return Object.freeze({
    schema, limits, fromGraph,
    toGraph(envelope, checkRuntime) {
      const graph = rebuild(envelope, checkRuntime);
      checkedDecode(graph, checkRuntime);
      return graph;
    },
    decode(envelope, checkRuntime) {
      return checkedDecode(rebuild(envelope, checkRuntime), checkRuntime);
    },
  });
}

/** Adapt the reviewed plan envelope losslessly; its strict decoder stays authoritative. */
export function createRecursiveAskWirePlan(plan, checkCompilation) {
  ensure(typeof checkCompilation === "function", "COMPILATION_DEADLINE");
  checkCompilation();
  function splitGraph(graph) {
    ensure(plain(graph) && Object.keys(graph).length === 1 && Object.hasOwn(graph, "nodes")
      && Array.isArray(graph.nodes) && graph.nodes.length > 0, "RAW_GRAPH_SHAPE");
    return { nodes: graph.nodes.slice(0, -1), root: graph.nodes.at(-1) };
  }
  const transport = createRecursiveProviderTransport({
    schema: plan.schema, rootSchema: plan.rootSchema,
    decode: graph => plan.decode(splitGraph(graph)),
  }, checkCompilation);
  const [header, rootLine, ...unchanged] = plan.instructions.split("\n");
  const indexedLayout = 'nodes: supporting postorder tree; root: required request wrapper after nodes; child objects {"@":index} refer to earlier nodes. No shared/unused/forward/cyclic nodes.';
  ensure(header.split(indexedLayout).length === 2, "TRANSPORT_HEADER_DRIFT");
  const match = /^ROOT root\.([A-Za-z]+) references the complete request node in nodes\. Omit the wrapper from nodes; root has implicit index nodes\.length\.$/.exec(rootLine);
  ensure(match, "ROOT_INSTRUCTION_DRIFT");
  const instructions = [
    header.replace(indexedLayout, "root: required request wrapper; embed child objects recursively. No indexed references or shared/cyclic objects."),
    "ROOT root." + match[1] + " embeds the complete request node. No nodes array.",
    ...unchanged,
  ].join("\n");
  checkCompilation();
  return Object.freeze({
    schema: transport.schema, instructions,
    decode: (envelope, checkRuntime) => transport.decode(envelope, checkRuntime),
    encode(value, checkRuntime) {
      ensure(typeof checkRuntime === "function", "RUNTIME_DEADLINE_REQUIRED"); checkRuntime();
      const envelope = plan.encode(value); checkRuntime();
      return transport.fromGraph({ nodes: [...envelope.nodes, envelope.root] }, checkRuntime);
    },
  });
}
