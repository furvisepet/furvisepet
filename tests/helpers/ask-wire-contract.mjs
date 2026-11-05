import { createDirectSemanticAskWirePlan } from "../../app/lib/intelligence/ask-wire-direct.mjs";
import assert from "node:assert/strict";
import { createAskWirePlan } from "../../app/lib/intelligence/ask-wire-policy.mjs";

// Test-only cache of exact schema compilations. Each dispatched schema, policy
// and source snapshot is still compared; decoder rejection tests are separate.
const plans = new Map();
export async function inspectAskWireContract(request, context) {
 const { projectAskInterpretationContext } = await import("../../app/lib/intelligence/interpret-ask.ts");
 const { askSourceWindows, askUserSourceInput, ASK_USER_SOURCE_INSTRUCTIONS } = await import("../../app/lib/intelligence/ask-interpretation-sources.ts");
 const { createAskProviderWireSchema } = await import("../../app/lib/intelligence/ask-wire-provider-schema.ts");
 const { ASK_REQUEST_INSTRUCTIONS, askRequestProviderSchema, askRequestSchema } = await import("../../app/lib/intelligence/ask-request-contract.ts");
 const { proposedSemanticFrameJsonSchema } = await import("../../app/lib/intelligence/semantic-frame/schema.ts");
 const { factorProviderEnumSchemas } = await import("../../app/lib/ai/provider-enum-schema.ts");
 const { factorProviderCompoundSchemas } = await import("../../app/lib/ai/provider-compound-schema.ts");
 const input = JSON.parse(request.input);
 const selected = [...askSourceWindows(projectAskInterpretationContext(context))]
   .find(candidate => JSON.stringify(candidate.planningSourceWindow) === JSON.stringify(input.sourceWindow));
 assert.ok(selected, "dispatched source window must be a whole-turn candidate");
 for (const [key, value] of Object.entries(askUserSourceInput(selected)))
   assert.deepEqual(input[key], value, "dispatched source field differs: " + key);
 const canonicalSchema = askRequestProviderSchema(proposedSemanticFrameJsonSchema, selected);
 const providerSchema = factorProviderCompoundSchemas(factorProviderEnumSchemas(canonicalSchema));
 const key = JSON.stringify(providerSchema);
 if (!plans.has(key)) {
   if (plans.size >= 16) plans.delete(plans.keys().next().value);
   plans.set(key, createAskWirePlan(providerSchema, ASK_REQUEST_INSTRUCTIONS));
 }
 const wire = plans.get(key);
 const plan = createDirectSemanticAskWirePlan(wire, wire.instructions, askRequestSchema(proposedSemanticFrameJsonSchema, selected), () => {});
 assert.deepEqual(request.text.format.schema, factorProviderCompoundSchemas(factorProviderEnumSchemas(createAskProviderWireSchema(plan.schema))), "actual wire schema differs from the source-window compiler");
 assert.equal(request.instructions, plan.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS, "actual policy differs from pinned policy and source adapter");
 return { canonicalSchema, providerSchema, sourceInstructions: ASK_REQUEST_INSTRUCTIONS };
}
