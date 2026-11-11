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
  const selection=phase==="read_selection",stage=selection?"interpretation":"primary";
  const request:Record<string,unknown>={model,store:false,reasoning:{effort:"low"},max_output_tokens:Math.min(ASK_READ_ONLY_MAX_OUTPUT_TOKENS,ASK_MAX_OUTPUT_TOKENS),
   instructions:input.instructions,input:[{role:"user",content:JSON.stringify(selection?input.context:{context:input.context,draft:input.draft,TOOL_DATA:input.TOOL_DATA,SOURCE_CATALOG:input.SOURCE_CATALOG})}],
   ...(selection?{tools:input.tools,parallel_tool_calls:true}:{text:{format:{type:"json_schema",name:"furvise_read_answer",strict:true,schema:input.schema}}})};
  const started=performance.now();
  let providerEnvelope:ReturnType<typeof structuredProviderEnvelopeDiagnostic>|undefined;
  try {
   const response=await executeAdmittedResponsesRequest({
    model,maxOutputTokens:request.max_output_tokens as number,request,
    stage:selection?"interpretation":"answer_generation",reserveMs:selection?12000:4000,
    invoke: async wire=>{
     onEvent({stage,outcome:"started",model,elapsedMs:0});
     return await withProviderDeadline(signal=>client.responses.create(wire as never,{signal}),boundedProviderTimeout(60000,selection?12000:4000,selection?"interpretation":"answer_generation")) as ProviderResponse;
    }
   });
   providerEnvelope=structuredProviderEnvelopeDiagnostic(response);
   if(response.status!=="completed"||response.error||!Array.isArray(response.output)||providerEnvelope.hasMessageRefusal)throw new Error("ASK_READ_PROVIDER_INCOMPLETE");
   const text=response.output_text??response.output.flatMap(item=>item.type==="message"?(item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??""):[]).join("");
   let value;
   if(selection){
    const calls=response.output.filter(item=>item.type==="function_call").map(item=>({id:item.call_id,name:item.name,arguments:item.arguments}));
    if(typeof text!=="string"||(!calls.length&&!text.trim()))throw new Error("ASK_READ_PROVIDER_INCOMPLETE");
    value={text,calls};
   }else{
    if(response.output.some(item=>item.type==="function_call"))throw new Error("ASK_READ_UNEXPECTED_TOOL");
    value=JSON.parse(text);
   }
   onEvent({stage,outcome:"succeeded",model,elapsedMs:Math.round(performance.now()-started),inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens,finishReason:response.status??null,providerEnvelope});
   return value;
  } catch(error) {
   const providerError=safeAskProviderErrorDiagnostic(error);
   const timedOut=["TimeoutError","AbortError","APIUserAbortError","APIConnectionTimeoutError"].includes(providerError.type??"");
   const providerErrorCode=providerError.code??(timedOut?"ASK_READ_PROVIDER_TIMEOUT":"ASK_READ_PROVIDER_FAILED");
   onEvent({stage,outcome:"failed",model,elapsedMs:Math.round(performance.now()-started),providerStatus:providerError.status,
    providerErrorCode,providerError,providerEnvelope,timedOut});
   throw new AskPipelineError(timedOut?"primary_timeout":"primary_provider_failed","The read-only answer could not be completed.",{model,elapsedMs:Math.round(performance.now()-started),providerStatus:providerError.status,providerErrorCode,providerError,providerEnvelope});
  }
 };
}
