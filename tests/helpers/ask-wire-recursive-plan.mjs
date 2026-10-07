// Test-only bridge. Never imported by production transport.
import assert from "node:assert/strict";
import { createRecursiveProviderPrototype } from "../../scripts/prototypes/ask-wire-recursive.mjs";
import { createAskProviderWireSchema } from "../../app/lib/intelligence/ask-wire-provider-schema.ts";
import { ASK_USER_SOURCE_INSTRUCTIONS, assertAskRequestInputBudget } from "../../app/lib/intelligence/ask-interpretation-sources.ts";

function splitGraph(graph) {
  assert.ok(graph && [Object.prototype, null].includes(Object.getPrototypeOf(graph))
    && Object.keys(graph).length === 1 && Object.hasOwn(graph, "nodes")
    && Array.isArray(graph.nodes) && graph.nodes.length > 0, "TEST_RAW_GRAPH_SHAPE");
  return { nodes: graph.nodes.slice(0, -1), root: graph.nodes.at(-1) };
}

export function createRecursiveAskPlanHarness(plan, checkCompilation) {
  assert.equal(typeof checkCompilation, "function");
  checkCompilation();
  // The plan is NOT a raw codec: its decoder consumes {nodes, root}. The
  // prototype only needs its existing node union/defs and compiled root.
  const rawBridge = {
    schema: plan.schema,
    rootSchema: plan.rootSchema,
    decode: graph => plan.decode(splitGraph(graph)),
  };
  const prototype = createRecursiveProviderPrototype(rawBridge, checkCompilation);
  const [header, rootLine, ...unchanged] = plan.instructions.split("\n");
  const indexedLayout = 'nodes: supporting postorder tree; root: required request wrapper after nodes; child objects {"@":index} refer to earlier nodes. No shared/unused/forward/cyclic nodes.';
  assert.equal(header.split(indexedLayout).length, 2, "TEST_TRANSPORT_HEADER_DRIFT");
  const match = /^ROOT root\.([A-Za-z]+) references the complete request node in nodes\. Omit the wrapper from nodes; root has implicit index nodes\.length\.$/.exec(rootLine);
  assert.ok(match, "TEST_ROOT_INSTRUCTION_DRIFT");
  const instructions = [
    header.replace(indexedLayout, "root: required request wrapper; embed child objects recursively. No indexed references or shared/cyclic objects."),
    "ROOT root." + match[1] + " embeds the complete request node. No nodes array.",
    ...unchanged,
  ].join("\n");
  checkCompilation();
  return Object.freeze({
    schema: prototype.schema, instructions,
    decode: (envelope, checkRuntime) => prototype.decode(envelope, checkRuntime),
    encode(value, checkRuntime) {
      assert.equal(typeof checkRuntime, "function"); checkRuntime();
      const envelope = plan.encode(value); checkRuntime();
      return prototype.fromGraph({ nodes: [...envelope.nodes, envelope.root] }, checkRuntime);
    },
    toPlanEnvelope(envelope, checkRuntime) {
      return splitGraph(prototype.toGraph(envelope, checkRuntime));
    },
    // Exposed only to test the bridge's original malformed-graph rejection.
    rawBridge,
  });
}

export function prepareRecursiveAskRequestHarness(prepared, checkCompilation) {
  checkCompilation();
  assert.equal(prepared.request.instructions, prepared.wire.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS);
  assert.deepEqual(prepared.request.text.format.schema, createAskProviderWireSchema(prepared.wire.schema, checkCompilation));
  const wire = createRecursiveAskPlanHarness(prepared.wire, checkCompilation);
  const request = {
    ...prepared.request,
    instructions: wire.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS,
    text: { ...prepared.request.text, format: { ...prepared.request.text.format,
      schema: createAskProviderWireSchema(wire.schema, checkCompilation) } },
  };
  checkCompilation();
  // Measure the FINAL envelope, including schema and adapted instructions.
  // Keep the production-selected source snapshot; never trim it to make a fit.
  assertAskRequestInputBudget(request);
  return { ...prepared, wire, request };
}
