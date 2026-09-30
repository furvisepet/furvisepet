import assert from "node:assert/strict";
import { createAskWirePlan } from "../../app/lib/intelligence/ask-wire-policy.mjs";

// Compare the dispatched contract before exposing its pinned canonical source
// to existing semantic assertions. This does not substitute for decoder tests.
export async function inspectAskWireContract(request,context){
 const {ASK_REQUEST_INSTRUCTIONS,askRequestProviderSchema}=await import("../../app/lib/intelligence/ask-request-contract.ts");
 const {proposedSemanticFrameJsonSchema}=await import("../../app/lib/intelligence/semantic-frame/schema.ts");
 const {factorProviderEnumSchemas}=await import("../../app/lib/ai/provider-enum-schema.ts");
 const {factorProviderCompoundSchemas}=await import("../../app/lib/ai/provider-compound-schema.ts");
 const canonicalSchema=askRequestProviderSchema(proposedSemanticFrameJsonSchema,context);
 const providerSchema=factorProviderCompoundSchemas(factorProviderEnumSchemas(canonicalSchema));
 const plan=createAskWirePlan(providerSchema,ASK_REQUEST_INSTRUCTIONS);
 assert.deepEqual(request.text.format.schema,plan.schema,"actual wire schema differs from canonical contract compiler");
 assert.equal(request.instructions,plan.instructions,"actual generated policy differs from pinned source policy");
 return {canonicalSchema,providerSchema,sourceInstructions:ASK_REQUEST_INSTRUCTIONS};
}
