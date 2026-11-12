/** Structural decoding only. Diagnostics never include generated text or IDs. */
function fail(code,field){
 const error=new Error(code);error.code=code;
 error.answerDiagnostic={category:"provider_output",field};throw error;
}
const messageText=item=>(item.content??[]).filter(c=>c.type==="output_text"&&typeof c.text==="string").map(c=>c.text).join("");
const eligible=item=>item.phase==null||item.phase==="final_answer";
/** output_text is an SDK aggregate, including commentary. It is not a JSON document.
 * Choose the first eligible message in provider order (the SDK parsed-output
 * convention). Multiple final messages are valid envelopes. Each selected
 * document still requires full downstream validation. Never combine
 * independent messages or salvage a JSON substring from surrounding prose.
 */
export function readProviderText(response,allowEmpty=false){
 const messages=response.output.filter(item=>item.type==="message");
 const candidates=messages.filter(eligible);
 const selected=candidates[0];
 if(selected?.status&&selected.status!=="completed")fail("ASK_READ_OUTPUT_INCOMPLETE","message_status");
 if(selected?.role&&selected.role!=="assistant")fail("ASK_READ_OUTPUT_AMBIGUOUS","role");
 const text=selected?messageText(selected):messages.length?"":typeof response.output_text==="string"?response.output_text:"";
 if(!allowEmpty&&!text.trim())fail("ASK_READ_OUTPUT_EMPTY","text");
 return text;
}
export function decodeProviderJson(response){
 if(response.output.some(item=>item.type==="function_call"))fail("ASK_READ_UNEXPECTED_TOOL","function_call");
 const text=readProviderText(response);
 try{return JSON.parse(text);}catch{fail("ASK_READ_OUTPUT_JSON","json");}
}
export function describeReadOutput(response){
 const messages=Array.isArray(response.output)?response.output.filter(item=>item.type==="message"):[];
 const validJson=text=>{try{JSON.parse(text);return true;}catch{return false;}};
 const count=values=>Math.min(values.length,64);
 const finals=messages.filter(item=>item.phase==="final_answer"),unphased=messages.filter(item=>item.phase==null);
 return {
  messages:count(messages),finalMessages:count(finals),unphasedMessages:count(unphased),
  commentaryMessages:count(messages.filter(item=>item.phase==="commentary")),
  otherPhaseMessages:count(messages.filter(item=>!eligible(item)&&item.phase!=="commentary")),
  parseableEligibleMessages:count(messages.filter(item=>eligible(item)&&validJson(messageText(item)))),
  aggregateJsonValid:typeof response.output_text==="string"&&validJson(response.output_text),
  selectedPhase:messages.find(eligible)?.phase==="final_answer"?"final_answer":messages.some(eligible)?"unphased":"none",
  selectionPolicy:"first_eligible",ignoredEligibleMessages:Math.max(0,count(messages.filter(eligible))-1)
 };
}
export function safeReadOutputDiagnostic(error){
 const codes=["ASK_READ_OUTPUT_EMPTY","ASK_READ_OUTPUT_JSON","ASK_READ_OUTPUT_AMBIGUOUS","ASK_READ_OUTPUT_INCOMPLETE","ASK_READ_UNEXPECTED_TOOL","ASK_READ_CLINICAL_CONTRACT","ASK_READ_PROVIDER_INCOMPLETE"];
 const fields=["text","json","message_count","message_status","role","function_call","assessment_shape","assessment_enum","missing_context","scenario_urgency","selection_shape","selection_read"];
 const own=(value,key)=>{try{return value&&typeof value==="object"?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;}catch{return undefined;}};
 const code=own(error,"code"),message=own(error,"message"),field=own(own(error,"answerDiagnostic"),"field");
 if(!codes.includes(code)&&!codes.includes(message))return null;
 return {code:codes.includes(code)?code:message,field:fields.includes(field)?field:"envelope"};
}
