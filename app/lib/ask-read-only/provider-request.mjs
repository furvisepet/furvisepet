/** Canonical wire assembly. Source bodies/provenance stay in SOURCE_CATALOG;
 * per-goal metadata references it without repeating measurements/timestamps. */
export function buildReadOnlyProviderRequest(model,input,phase,maxOutputTokens,policy){
 const selection=phase==="read_selection",strictSelection=selection&&!!input.selectionSchema;
 const context=input.context??{}, {dialogue=[],question,...wireContext}=context;
 const data=selection?wireContext:{context:wireContext,draft:input.draft,
  TOOL_DATA:input.TOOL_DATA?.map(row=>({...row,sources:row.sources.map(source=>({source:source.source}))})),
  SOURCE_CATALOG:input.SOURCE_CATALOG,CLINICAL_CONSTRAINTS:input.CLINICAL_CONSTRAINTS};
 const request={model,store:false,reasoning:{effort:"low"},max_output_tokens:maxOutputTokens,instructions:input.instructions,input:[{role:"user",content:JSON.stringify(data)},
   ...dialogue.map((turn,index)=>({role:turn.role==="user"?"user":"assistant",content:"Prior dialogue ["+index+"]:\n"+turn.text})),
   ...(typeof question==="string"&&question.length?[{role:"user",content:question}]:[])],
  ...(strictSelection?{text:{format:{type:"json_schema",name:"furvise_read_selection",strict:true,schema:input.selectionSchema}}}:selection?{tools:input.tools,parallel_tool_calls:true}:{text:{format:{type:"json_schema",name:"furvise_read_answer",strict:true,schema:input.schema}}})};
 const within=()=>{
  const chars=JSON.stringify(request).length;
  return chars<=policy.maxInputCharacters&&Math.ceil(chars/3)<=policy.maxInputTokens;
 };
 // A preliminary draft is advisory, never evidence. Prefer every admitted
 // source body, the real owner question and dialogue over a redundant draft.
 if(!selection&&!within()&&data.draft){data.draft="";request.input[0].content=JSON.stringify(data);}
 if(!within()){
  const error=new Error("ASK_READ_INPUT_BUDGET");error.code="ASK_READ_INPUT_BUDGET";
  error.requestSize=describeReadRequest(request);throw error;
 }
 return request;
}
export function describeReadRequest(request){const characters=JSON.stringify(request).length;return {requestCharacters:characters,estimatedInputTokens:Math.ceil(characters/3)};}
export function safeReadAdmissionDiagnostic(error){
 const own=key=>{try{return error&&typeof error==="object"?Object.getOwnPropertyDescriptor(error,key)?.value:undefined;}catch{return undefined;}};
 const code=own("code"),reason=own("reason");
 if(code==="ASK_READ_INPUT_BUDGET"){
  let size={};try{
   const value=own("requestSize"),characters=Object.getOwnPropertyDescriptor(value,"requestCharacters")?.value,estimate=Object.getOwnPropertyDescriptor(value,"estimatedInputTokens")?.value;
   if(Number.isSafeInteger(characters)&&characters>=0&&characters<=2000000&&Number.isSafeInteger(estimate)&&estimate>=0&&estimate<=2000000)size={requestCharacters:characters,estimatedInputTokens:estimate};
  }catch{size={};}
  return {category:"provider_request",reason:"feature_token_budget_exceeded",...size};
 }
 if(code!=="AI_PROVIDER_BUDGET_EXHAUSTED")return null;
 const allowed=["feature_token_budget_exceeded","provider_request_contract_mismatch","provider_deadline_exhausted","provider_call_budget_exhausted","provider_phase_out_of_order","catalog_phase_out_of_order","catalog_terminal","catalog_authority_wrong_phase","operation_call_limit"];
 return {category:"provider_admission",reason:allowed.includes(reason)?reason:"unclassified_budget_denial"};
}
