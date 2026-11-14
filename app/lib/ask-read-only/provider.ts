import { randomUUID } from "node:crypto";
import { buildReadOnlyProviderRequest, describeReadRequest, safeReadAdmissionDiagnostic } from "./provider-request.mjs";
import { getAiFeaturePolicy } from "../ai/usage-guard/features.ts";
import { decodeComponentSelection } from "./task-components.mjs";
import { decodeClinicalSelection as decodePolicySelection } from "./clinical-policy.mjs";
import { readProviderText, decodeProviderJson, safeReadOutputDiagnostic, describeReadOutput } from "./provider-output.mjs";
import { decodeClinicalSelection } from "./clinical.mjs";
import "server-only";
import { withProviderDeadline } from "../ai/execution-deadline.ts";
import { ASK_READ_ONLY_MAX_OUTPUT_TOKENS } from "./limits.ts";
import OpenAI from "openai";
import { executeAdmittedResponsesRequest, boundedProviderTimeout } from "../ai/usage-guard/provider-call-budget.ts";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { ASK_MAX_OUTPUT_TOKENS, structuredProviderEnvelopeDiagnostic } from "../ai/ask-provider.ts";
import { safeAskProviderErrorDiagnostic } from "../ai/ask-provider-error-diagnostic.ts";

type ProviderResponse = { error?:{code?:string|null;message?:string|null}|null; status?: string; output_text?: string; output?: Array<{type:string;id?:string;name?:string;call_id?:string;arguments?:string;content?:Array<{type:string;text?:string}>}>; usage?:{input_tokens?:number;output_tokens?:number}; incomplete_details?:{reason?:string} };
export function readOnlyProvider(model:string,onEvent:(event:AskProviderEvent)=>void, client = new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0})) {
 return async (input:Record<string,unknown>,phase:string) => {
  const selection=phase==="read_selection",stage=selection?"interpretation":"primary",strictSelection=selection&&!!input.selectionSchema;
  let request:Record<string,unknown>={};
  let clientRequestId:string|undefined;
  const started=performance.now();
  let providerEnvelope:ReturnType<typeof structuredProviderEnvelopeDiagnostic>|undefined;
  let outputLayout:ReturnType<typeof describeReadOutput>|undefined;
  try {
   request=buildReadOnlyProviderRequest(model,input,phase,Math.min(ASK_READ_ONLY_MAX_OUTPUT_TOKENS,ASK_MAX_OUTPUT_TOKENS),getAiFeaturePolicy("ask"));
   const response=await executeAdmittedResponsesRequest({
    model,maxOutputTokens:request.max_output_tokens as number,request,
    stage:selection?"interpretation":"answer_generation",reserveMs:selection?12000:4000,
    invoke: async wire=>{
     clientRequestId=randomUUID();
     onEvent({stage,outcome:"started",model,elapsedMs:0,validationDetails:JSON.stringify({clientRequestId,...describeReadRequest(request)})});
     return await withProviderDeadline(signal=>client.responses.create(wire as never,{signal,headers:{"X-Client-Request-Id":clientRequestId}}),boundedProviderTimeout(60000,selection?12000:4000,selection?"interpretation":"answer_generation")) as ProviderResponse;
    }
   });
   providerEnvelope=structuredProviderEnvelopeDiagnostic(response);
   outputLayout=describeReadOutput(response);
   if(response.status!=="completed"||response.error||!Array.isArray(response.output)||providerEnvelope.hasMessageRefusal)throw Object.assign(new Error("ASK_READ_PROVIDER_INCOMPLETE"),{code:"ASK_READ_PROVIDER_INCOMPLETE"});
   const text=strictSelection||!selection?"":readProviderText(response,true);
   let value;
   if(strictSelection){
     const schemaProperties=(input.selectionSchema as {properties?:Record<string,unknown>})?.properties;
     const decoder=schemaProperties?.historyIntent?decodePolicySelection:decodeClinicalSelection;
     const decoded=decodeProviderJson(response),context=input.context&&typeof input.context==="object"?input.context:{};
     value=schemaProperties?.taskPlan?decodeComponentSelection(decoded,input.tools,context,decoder):decoder(decoded,input.tools,context);
    }else if(selection){
     const calls=response.output.filter(item=>item.type==="function_call").map(item=>({id:item.call_id,name:item.name,arguments:item.arguments}));
    if(typeof text!=="string"||(!calls.length&&!text.trim()))throw Object.assign(new Error("ASK_READ_PROVIDER_INCOMPLETE"),{code:"ASK_READ_PROVIDER_INCOMPLETE"});
    value={text,calls};
   }else{
    value=decodeProviderJson(response);
   }
   onEvent({stage,outcome:"succeeded",validationDetails:JSON.stringify({outputLayout,clientRequestId,...describeReadRequest(request)}),model,elapsedMs:Math.round(performance.now()-started),inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens,finishReason:response.status??null,providerEnvelope});
   return value;
  } catch(error) {
   const providerError=safeAskProviderErrorDiagnostic(error);
   const timedOut=["TimeoutError","AbortError","APIUserAbortError","APIConnectionTimeoutError"].includes(providerError.type??"");
   const outputDiagnostic=safeReadOutputDiagnostic(error);
   const admissionDiagnostic=safeReadAdmissionDiagnostic(error);
   const validationDetails=outputDiagnostic||admissionDiagnostic||Object.keys(request).length?JSON.stringify({...outputDiagnostic,...admissionDiagnostic,phase:selection?"read_selection":"read_answer",outputLayout,clientRequestId,...(Object.keys(request).length?describeReadRequest(request):{})}):undefined;
   const providerErrorCode=outputDiagnostic?.code??(admissionDiagnostic?"ASK_READ_ADMISSION_DENIED":null)??providerError.code??(timedOut?"ASK_READ_PROVIDER_TIMEOUT":"ASK_READ_PROVIDER_FAILED");
   onEvent({stage,outcome:"failed",model,elapsedMs:Math.round(performance.now()-started),providerStatus:providerError.status,
    providerErrorCode,providerError,providerEnvelope,timedOut,validationDetails});
   throw new AskPipelineError(timedOut?"primary_timeout":outputDiagnostic?"primary_invalid_output":"primary_provider_failed","The read-only answer could not be completed.",{model,elapsedMs:Math.round(performance.now()-started),providerStatus:providerError.status,providerErrorCode,providerError,providerEnvelope,validationDetails});
  }
 };
}
