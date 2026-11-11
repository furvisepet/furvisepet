/** Structural decoding only. Diagnostics never include generated text or IDs. */
function fail(code,field){
 const error=new Error(code);error.code=code;
 error.answerDiagnostic={category:"provider_output",field};throw error;
}
export function readProviderText(response,allowEmpty=false){
 const top=typeof response.output_text==="string"?response.output_text:"";
 const chunks=response.output.flatMap(item=>item.type==="message"?(item.content??[]).filter(c=>c.type==="output_text"&&typeof c.text==="string").map(c=>c.text):[]);
 const text=top.trim()?top:chunks.join("");
 if(!allowEmpty&&!text.trim())fail("ASK_READ_OUTPUT_EMPTY","text");
 return text;
}
export function decodeProviderJson(response){
 if(response.output.some(item=>item.type==="function_call"))fail("ASK_READ_UNEXPECTED_TOOL","function_call");
 const text=readProviderText(response);
 try{return JSON.parse(text);}catch{fail("ASK_READ_OUTPUT_JSON","json");}
}
export function safeReadOutputDiagnostic(error){
 const codes=["ASK_READ_OUTPUT_EMPTY","ASK_READ_OUTPUT_JSON","ASK_READ_UNEXPECTED_TOOL","ASK_READ_CLINICAL_CONTRACT","ASK_READ_PROVIDER_INCOMPLETE"];
 const fields=["text","json","function_call","assessment_shape","assessment_enum","missing_context","scenario_urgency","selection_shape","selection_read"];
 const own=(value,key)=>{try{return value&&typeof value==="object"?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;}catch{return undefined;}};
 const code=own(error,"code"),message=own(error,"message"),field=own(own(error,"answerDiagnostic"),"field");
 if(!codes.includes(code)&&!codes.includes(message))return null;
 return {code:codes.includes(code)?code:message,field:fields.includes(field)?field:"envelope"};
}
