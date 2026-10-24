import assert from "node:assert/strict";
import { createAskWirePlan } from "../../app/lib/intelligence/ask-wire-policy.mjs";
import { createDirectSemanticAskWirePlan } from "../../app/lib/intelligence/ask-wire-direct.mjs";

// Bounded test-only compilation cache. Every request still has its exact
// selected source window, native schema and instructions compared below.
const plans = new Map();

export async function inspectAskWireContract(request, context) {
 const { projectAskInterpretationContext } = await import("../../app/lib/intelligence/interpret-ask.ts");
 const { askSourceWindows, askUserSourceInput, ASK_USER_SOURCE_INSTRUCTIONS } = await import("../../app/lib/intelligence/ask-interpretation-sources.ts");
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
 assert.equal(input.timeZone, selected.timeZone || "UTC", "server-derived timezone differs");
 assert.equal(input.selectedPet, selected.pet.name, "server-derived selected pet differs");
 assert.deepEqual(input.ownedPets, JSON.parse(JSON.stringify(selected.eligiblePets
   .filter(pet => pet.user_id === selected.owner.userId)
   .map(pet => ({name:pet.name,species:pet.species,sex:pet.sex,lifecycleState:null})))), "server-derived owned pets differ");
 const canonicalSchema = askRequestProviderSchema(proposedSemanticFrameJsonSchema, selected);
 const decoderSchema = askRequestSchema(proposedSemanticFrameJsonSchema, selected);
 const providerSchema = factorProviderCompoundSchemas(factorProviderEnumSchemas(canonicalSchema));
 const key = JSON.stringify([providerSchema, decoderSchema, ASK_REQUEST_INSTRUCTIONS, selected.timeZone ?? "UTC"]);
 if (!plans.has(key)) {
   const deadline = performance.now() + 24000;
   const check = () => { if (performance.now() >= deadline) throw Error("TEST_NATIVE_CONTRACT_COMPILATION_DEADLINE"); };
   const wire = createAskWirePlan(providerSchema, ASK_REQUEST_INSTRUCTIONS, undefined, check);
   const transport = createDirectSemanticAskWirePlan(wire, wire.instructions, decoderSchema, check, canonicalSchema, selected.timeZone ?? "UTC");
   if (plans.size >= 16) plans.delete(plans.keys().next().value);
   plans.set(key, transport);
 }
 const transport = plans.get(key);
 // Admission serializes the schema; JS null prototypes are not wire bytes.
 assert.equal(JSON.stringify(request.text.format.schema), JSON.stringify(transport.schema), "actual native schema differs from the source-window compiler");
 assert.equal(request.instructions, transport.instructions + "\n" + ASK_USER_SOURCE_INSTRUCTIONS, "actual policy differs from pinned policy and source adapter");
 return { canonicalSchema, providerSchema, transport, sourceInstructions: ASK_REQUEST_INSTRUCTIONS };
}
