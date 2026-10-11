// Provider-facing typed JSON envelope. The model never chooses graph indices.
// Server reconstruction is the only path into the unchanged canonical codec.
import { RECURSIVE_TRANSPORT_LIMITS } from "./ask-wire-recursive.mjs";

const fail = code => { throw Error("ASK_DIRECT_" + code); };
const plain = v => v !== null && typeof v === "object" && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const DIRECT_ASK_FORMAT_VERSION = "ask-semantic-json.v1";

function boundedJsonTree(value, check, limits) {
  let total = 0, containers = 0, characters = 0;
  const visited = new WeakSet();
  function walk(node, depth) {
    check();
    if (depth > limits.maxDepth || ++total > limits.maxValues) fail("RESOURCE_LIMIT");
    if (node === null || typeof node === "boolean") { characters += JSON.stringify(node).length; return; }
    if (typeof node === "number" && Number.isFinite(node)) { characters += JSON.stringify(node).length; return; }
    if (typeof node === "string") {
      if (node.length > limits.maxStringUnits) fail("STRING_LIMIT");
      characters += JSON.stringify(node).length; return;
    }
    if (typeof node !== "object" || visited.has(node)) fail("NON_JSON_TREE");
    visited.add(node);
    if (++containers > limits.maxContainers) fail("RESOURCE_LIMIT");
    const keys = Reflect.ownKeys(node);
    if (keys.length > limits.maxContainerEntries + 1) fail("RESOURCE_LIMIT");
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype
        || keys.length !== node.length + 1
        || !keys.every(k => k === "length" || typeof k === "string"
          && /^(0|[1-9]\d*)$/.test(k) && Number(k) < node.length)) fail("NON_JSON_TREE");
      for (const item of node) walk(item, depth + 1);
    } else {
      if (!plain(node)) fail("NON_JSON_TREE");
      for (const key of keys) {
        if (typeof key !== "string") fail("NON_JSON_TREE");
        const desc = Object.getOwnPropertyDescriptor(node, key);
        if (!desc || !desc.enumerable || !Object.hasOwn(desc, "value")) fail("NON_JSON_TREE");
        characters += JSON.stringify(key).length;
        walk(desc.value, depth + 1);
      }
    }
    if (characters > limits.maxSerializedCharacters) fail("RESOURCE_LIMIT");
  }
  walk(value, 0);
  check();
}

export function createDirectSemanticAskWirePlan(wire, originalSemanticInstructions, requiredNames, checkCompilation = () => {}) {
  checkCompilation();
  if (typeof wire?.encode !== "function" || typeof wire?.decode !== "function"
    || typeof originalSemanticInstructions !== "string" || originalSemanticInstructions.length < 1000
    || !Array.isArray(requiredNames) || requiredNames.length < 10
    || !requiredNames.every(n => typeof n === "string" && /^[A-Za-z][A-Za-z]+$/.test(n))) fail("COMPILE_CONTRACT");
  const limits = RECURSIVE_TRANSPORT_LIMITS;
  const schema = {
    type: "object", additionalProperties: false, required: ["format", "requestJson"],
    properties: {
      format: { type: "string", enum: [DIRECT_ASK_FORMAT_VERSION] },
      requestJson: { type: "string", minLength: 2, maxLength: limits.maxSerializedCharacters },
    },
  };
  const lines = originalSemanticInstructions.split("\n");
  if (lines.length < 5 || !lines[0].includes("nodes: supporting postorder tree;")
    || !lines[1].startsWith("ROOT root.") || !lines[2].startsWith("FIELDS ")) fail("POLICY_LAYOUT");
  const instructions = [
    "Return format ask-semantic-json.v1 and requestJson string with the complete semantic contract as escaped JSON.",
    "Do not create graph nodes or indices; the server constructs and validates its own canonical graph.",
    "Use real field names from FIELDS (right of =), not the short POLICY aliases or packed tags.",
    "Required top-level fields for ask-request.v2:",
    requiredNames.join(", ") + ". Use null or [] where inactive, according to the policy.",
    "For catalog intents, follow the dedicated catalog contract in POLICY.",
    ...lines.slice(2),
  ].join("\n");

  function decode(value, checkRuntime) {
    if (typeof checkRuntime !== "function") fail("RUNTIME_CHECK_REQUIRED");
    checkRuntime();
    if (!plain(value) || Object.keys(value).length !== 2
      || value.format !== DIRECT_ASK_FORMAT_VERSION
      || typeof value.requestJson !== "string"
      || value.requestJson.length < 2
      || value.requestJson.length > limits.maxSerializedCharacters) fail("ENVELOPE");
    checkRuntime();
    let request;
    try { request = JSON.parse(value.requestJson); }
    catch { fail("JSON_SYNTAX"); }
    if (!plain(request)) fail("REQUEST_OBJECT");
    boundedJsonTree(request, checkRuntime, limits);
    checkRuntime();
    const encoded = wire.encode({ request });
    checkRuntime();
    const restored = wire.decode(encoded);
    checkRuntime();
    return restored;
  }
  function encode(value, checkRuntime) {
    if (typeof checkRuntime !== "function") fail("RUNTIME_CHECK_REQUIRED");
    checkRuntime();
    if (!plain(value) || Object.keys(value).length !== 1 || !plain(value.request)) fail("CANONICAL_ENVELOPE");
    boundedJsonTree(value.request, checkRuntime, limits);
    const raw = JSON.stringify(value.request);
    if (raw.length > limits.maxSerializedCharacters) fail("RESOURCE_LIMIT");
    const envelope = { format: DIRECT_ASK_FORMAT_VERSION, requestJson: raw };
    decode(envelope, checkRuntime);
    return envelope;
  }
  checkCompilation();
  return Object.freeze({ schema, instructions, decode, encode });
}
