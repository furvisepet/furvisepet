import { bindUserSourceSpan, type UserSourceSpan } from "./append-job.ts";
import { units } from "./calculation-units.ts";
import { decimal, div, mul, factor, finite, exact, type Exact } from "./calculation-rational.ts";
export type CalculationSource={id:string;role:"user"|"furvise";text:string};
export type ResultSelection=Readonly<{
 filter:Readonly<{comparator:"gt"|"gte"|"lt"|"lte"|"eq";threshold:Readonly<{source:UserSourceSpan;exact:Exact;unit:string}>}>|null;
 orderBy:Readonly<{direction:"asc"|"desc"}>|null;take:Readonly<{count:number}>|null;
}>;
export const resultSelectionSchema={anyOf:[{type:"null"},{type:"object",additionalProperties:false,
 required:["filter","orderBy","take"],properties:{
 filter:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,required:["comparator","thresholdQuote"],properties:{
 comparator:{type:"string",enum:["gt","gte","lt","lte","eq"]},thresholdQuote:{type:"string",minLength:1,maxLength:1200}}}]},
 orderBy:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,required:["direction"],properties:{direction:{type:"string",enum:["asc","desc"]}}}]},
 take:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,required:["count"],properties:{count:{type:"integer",minimum:1,maximum:20}}}]}
}}]};
const fail=():never=>{throw Error("ASK_CALCULATE_INVALID:result_selection");};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const shape=(v:unknown,names:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).sort().join()===names.sort().join();
/** Only lexical numbers and explicit dimensional units are parsed. Comparator
 * meaning belongs to Brain; surrounding language never changes sign or order. */
function threshold(text:string,resultUnit:string):Exact{
 const tokens=[...text.matchAll(/[+\u2212-]?\d+(?:\.\d+)?/gu)];
 if(tokens.length!==1)return fail();
 const token=tokens[0],start=token.index!,end=start+token[0].length;
 if(start&&/[\p{L}\p{N}\p{Sc}_.,/+\u2212-]/u.test(text[start-1])||end<text.length&&/[\d.,/]/u.test(text[end]))return fail();
 let q=decimal(token[0].replace("\u2212","-"));finite(q);
 const suffix=text.slice(end).trim();
 if(resultUnit==="scalar"){if(suffix)return fail();}
 else if(resultUnit==="%"){if(!/^(?:%|percent)$/i.test(suffix))return fail();}
 else{
  const name=suffix.toLowerCase(),u=Object.hasOwn(units,name)?units[name]:null,target=units[resultUnit];
  if(!u||!target||u.dimension!==target.dimension)return fail();
  q=div(mul(q,factor(name)),factor(resultUnit));finite(q);
 }
 return exact(q);
}
type Candidate={operator:string;resultUnit:string;operands:readonly {subjectId:string}[]};
export function bindResultSelection(value:unknown,calculations:readonly Candidate[],subjects:readonly string[],source:CalculationSource|undefined,bound:boolean):ResultSelection|null{
 if(value==null)return null;
 if(!shape(value,["filter","orderBy","take"]))return fail();
 const cohort=calculations.map(c=>{
  const ids=[...new Set(c.operands.map(o=>o.subjectId))];
  if(c.operator==="count_records"||ids.length!==1)return fail();return ids[0];
 });
 if(new Set(cohort).size!==cohort.length||cohort.length!==subjects.length||subjects.some(id=>!cohort.includes(id))
  ||new Set(calculations.map(c=>c.resultUnit)).size!==1)return fail();
 const order=value.orderBy,take=value.take;
 if(order!==null&&(!shape(order,["direction"])||!["asc","desc"].includes(String(order.direction))))return fail();
 if(take!==null&&(!shape(take,["count"])||!order||!Number.isInteger(take.count)||Number(take.count)<1||Number(take.count)>cohort.length))return fail();
 let filter:ResultSelection["filter"]=null;
 if(value.filter!==null){
  const f=value.filter;
  if(!shape(f,["comparator",bound?"threshold":"thresholdQuote"])||!["gt","gte","lt","lte","eq"].includes(String(f.comparator)))return fail();
  let span:UserSourceSpan;
  if(bound){
   if(!shape(f.threshold,["source","exact","unit"])||f.threshold.unit!==calculations[0].resultUnit)return fail();
   const s=f.threshold.source;
   if(!shape(s,["id","sourceMessageId","start","end","text"])||typeof s.sourceMessageId!=="string"||!s.sourceMessageId
    ||typeof s.text!=="string"||!s.text.trim()||s.text.length>1200||!Number.isInteger(s.start)||Number(s.start)<0
    ||s.end!==Number(s.start)+s.text.length||s.id!==s.sourceMessageId+":"+s.start+":"+s.end)return fail();
   span=Object.freeze({...s}) as UserSourceSpan;
   if(JSON.stringify(threshold(span.text,calculations[0].resultUnit))!==JSON.stringify(f.threshold.exact))return fail();
  }else{
   if(!source?.id||source.role!=="user")return fail();
   span=bindUserSourceSpan(source,f.thresholdQuote);
   // Exact spans must not crop a sign, a digit, or an explicit unit token.
   // This is lexical grounding, not interpretation of comparator language.
   const token=/[+\u2212-]?\d+(?:\.\d+)?/u.exec(span.text);
   if(!token)return fail();
   const numericStart=span.start+token.index;
   if(numericStart>0&&/[\p{L}\p{N}\p{Sc}_.,/+\u2212-]/u.test(source.text[numericStart-1])
    ||/[\p{L}\p{N}_]/u.test(source.text[span.end]||""))return fail();
   if(calculations[0].resultUnit==="scalar"){
    const trailing=/^\s*(%|[A-Za-z]+)/.exec(source.text.slice(span.end))?.[1]?.toLowerCase();
    if(trailing&&(trailing==="%"||trailing==="percent"||Object.hasOwn(units,trailing)))return fail();
   }
  }
  filter=Object.freeze({comparator:f.comparator as NonNullable<ResultSelection["filter"]>["comparator"],
   threshold:Object.freeze({source:span,exact:Object.freeze(threshold(span.text,calculations[0].resultUnit)),unit:calculations[0].resultUnit})});
 }
 return Object.freeze({filter,orderBy:order?Object.freeze({direction:order.direction as "asc"|"desc"}):null,take:take?Object.freeze({count:Number(take.count)}):null});
}
