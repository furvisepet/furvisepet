import "server-only";
import OpenAI from "openai";
import { executeAdmittedResponsesRequest, boundedProviderTimeout } from "../ai/usage-guard/provider-call-budget.ts";
import { AskPipelineError, type AskProviderEvent } from "../ai/ask-reasoning.ts";
import { ASK_MAX_OUTPUT_TOKENS } from "../ai/ask-provider.ts";

type ProviderResponse = { status?: string; output_text?: string; output?: Array<{type:string;id?:string;name?:string;call_id?:string;arguments?:string;content?:Array<{type:string;text?:string}>}>; usage?:{input_tokens?:number;output_tokens?:number}; incomplete_details?:{reason?:string} };
export function readOnlyProvider(model:string,onEvent:(event:AskProviderEvent)=>void, client = new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0})) {
 return async (input:Record<string,unknown>,phase:string) => {
  const selection=phase==="read_selection",stage=selection?"interpretation":"primary";
  const request:Record<string,unknown>={model,store:false,max_output_tokens:Math.min(2400,ASK_MAX_OUTPUT_TOKENS),
   instructions:input.instructions,input:[{role:"user",content:JSON.stringify(selection?input.context:{context:input.context,draft:input.draft,TOOL_DATA:input.TOOL_DATA})}],
   ...(selection?{tools:input.tools,parallel_tool_calls:true}:{text:{format:{type:"json_schema",name:"furvise_read_answer",strict:true,schema:input.schema}}})};
  const started=performance.now();
  try {
   const response=await executeAdmittedResponsesRequest({
    model,maxOutputTokens:request.max_output_tokens as number,request,
    stage:selection?"interpretation":"answer_generation",reserveMs:selection?12000:4000,
    invoke: async wire=>{
     onEvent({stage,outcome:"started",model,elapsedMs:0});
     return await client.responses.create(wire as never,{signal:AbortSignal.timeout(boundedProviderTimeout(60000,selection?12000:4000))}) as ProviderResponse;
    }
   });
   onEvent({stage,outcome:"succeeded",model,elapsedMs:Math.round(performance.now()-started),inputTokens:response.usage?.input_tokens,outputTokens:response.usage?.output_tokens,finishReason:response.status??null});
   if(response.status!=="completed"||!Array.isArray(response.output))throw new Error("ASK_READ_PROVIDER_INCOMPLETE");
   const text=response.output_text??response.output.flatMap(item=>item.type==="message"?(item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??""):[]).join("");
   if(selection)return {text,calls:response.output.filter(item=>item.type==="function_call").map(item=>({id:item.call_id,name:item.name,arguments:item.arguments}))};
   if(response.output.some(item=>item.type==="function_call"))throw new Error("ASK_READ_UNEXPECTED_TOOL");
   return JSON.parse(text);
  } catch(error) {
   const e=error as {status?:number;code?:string;name?:string};
   onEvent({stage,outcome:"failed",model,elapsedMs:Math.round(performance.now()-started),providerStatus:e.status??null,
    providerErrorCode:typeof e.code==="string"?e.code.slice(0,100):"ASK_READ_PROVIDER_FAILED",timedOut:e.name==="TimeoutError"||e.name==="AbortError"});
   throw new AskPipelineError("primary_provider_failed","The read-only answer could not be completed.",{model,elapsedMs:Math.round(performance.now()-started),providerStatus:e.status??null,providerErrorCode:e.code});
  }
 };
}
