import type { ReadTicket } from "./read-ticket.ts";
import { units } from "./calculation-units.ts";

export const CALCULATE_OPERATORS = ["sum","mean","difference","absolute_difference","ratio","percent_change","percent_of_sum","convert","elapsed_days","count_records"] as const;
export type CalculateOperator = typeof CALCULATE_OPERATORS[number];
export type CalculateSlot = Readonly<{subjectId:string; clause:number; item:number; field:"measurement"|"event_at"; unit:string|null}>;
export type CalculatePlan = Readonly<{operation:"calculate"; calculations:readonly Readonly<{
  id:string; operator:CalculateOperator; operands:readonly CalculateSlot[]; resultUnit:string; precision:number|null;
}>[]}>;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).sort().join()===names.sort().join();
const fail=(reason:string):never=>{throw Error("ASK_CALCULATE_INVALID:"+reason);};
const unit=(v:unknown)=>typeof v==="string"&&Object.hasOwn(units,v)?units[v]:null;
export const calculatePlanSchema={anyOf:[{type:"null"},{
 type:"object",additionalProperties:false,required:["operation","calculations"],properties:{
 operation:{type:"string",enum:["calculate"]},
 calculations:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:false,
 required:["id","operator","operands","resultUnit","precision"],properties:{
 id:{type:"string",minLength:1,maxLength:80},operator:{type:"string",enum:CALCULATE_OPERATORS},
 operands:{type:"array",maxItems:64,items:{type:"object",additionalProperties:false,
 required:["petName","clause","item","field","unit"],properties:{
 petName:{type:"string",minLength:1,maxLength:100},clause:{type:"integer",minimum:0,maximum:7},
 item:{type:"integer",minimum:0,maximum:99},field:{type:"string",enum:["measurement","event_at"]},
 unit:{type:["string","null"],enum:[...Object.keys(units),null]}}}},
 resultUnit:{type:"string",enum:[...Object.keys(units),"scalar","%","records"]},
 precision:{type:["integer","null"],minimum:0,maximum:10}
 }}}}}]};

/** All order is explicit: difference = 0 - 1; ratio = 1 / 0;
 * percent_change = (1 - 0) / 0 * 100; percent_of_sum = 0 / sum * 100.
 * elapsed_days = (timestamp 1 - timestamp 0) / 86,400,000 (instant days).
 * No derived-result references, expressions, IDs or raw wording are accepted. */
function bind(value:unknown,ticket:ReadTicket,resolve:(v:unknown)=>string,bound:boolean):CalculatePlan {
 if(!obj(value)||!keys(value,["operation","calculations"])||value.operation!=="calculate"
  ||!Array.isArray(value.calculations)||!value.calculations.length||value.calculations.length>20) return fail("plan");
 if(!["read","read_since_event"].includes(ticket.operation)||ticket.episode||ticket.needs?.length
  ||ticket.outputs.strategy!=null||ticket.temporal.calendar)return fail("read_domain");
 const ids=new Set<string>();
 const calculations=value.calculations.map(c=>{
  if(!obj(c)||!keys(c,["id","operator","operands","resultUnit","precision"])
   ||typeof c.id!=="string"||!c.id.trim()||c.id.length>80||ids.has(c.id)
   ||!CALCULATE_OPERATORS.includes(c.operator as CalculateOperator)||!Array.isArray(c.operands)||c.operands.length>64
   ||!(c.precision===null||Number.isInteger(c.precision)&&Number(c.precision)>=0&&Number(c.precision)<=10)
   ||typeof c.resultUnit!=="string")return fail("calculation");
  ids.add(c.id);
  const operator=c.operator as CalculateOperator,n=c.operands.length;
  if(operator==="count_records"){
   if(n||ticket.selection||ticket.outputs.completeness!=="exhaustive"||ticket.outputs.limit!==null||c.resultUnit!=="records")return fail("exhaustive_count");
  }else{
   if(!ticket.selection||ticket.selection.groupBy.length!==1)return fail("selection_required");
   if(operator==="convert"?n!==1:["sum","mean"].includes(operator)?n<1:operator==="percent_of_sum"?n<2:n!==2)return fail("arity");
  }
  const operands=c.operands.map(o=>{
   if(!obj(o)||!keys(o,[bound?"subjectId":"petName","clause","item","field","unit"]))return fail("slot");
   const subjectId=resolve(o[bound?"subjectId":"petName"]);
   if(!ticket.subjects.petIds.includes(subjectId))return fail("subject");
   if(!Number.isInteger(o.clause)||Number(o.clause)<0||!Number.isInteger(o.item)||Number(o.item)<0)return fail("position");
   const clause=ticket.selection?.union[Number(o.clause)];
   if(!clause||Number(o.item)>=clause.take.count)return fail("position");
   if(operator==="elapsed_days" ? o.field!=="event_at"||o.unit!==null
    :o.field!=="measurement"||!unit(o.unit))return fail("field_unit");
   return Object.freeze({subjectId,clause:Number(o.clause),item:Number(o.item),field:o.field as CalculateSlot["field"],unit:o.unit as string|null});
  });
  const dimensions=operands.filter(o=>o.field==="measurement").map(o=>unit(o.unit)!.dimension);
  if(new Set(dimensions).size>1)return fail("dimensions");
  if(operator==="elapsed_days"){if(c.resultUnit!=="day")return fail("result_unit");}
  else if(operator==="ratio"){if(c.resultUnit!=="scalar")return fail("result_unit");}
  else if(operator==="percent_change"||operator==="percent_of_sum"){if(c.resultUnit!=="%")return fail("result_unit");}
  else if(operator!=="count_records"&&(!unit(c.resultUnit)||unit(c.resultUnit)!.dimension!==dimensions[0]))return fail("result_unit");
  return Object.freeze({id:c.id,operator,operands:Object.freeze(operands),resultUnit:c.resultUnit,precision:c.precision as number|null});
 });
 return Object.freeze({operation:"calculate",calculations:Object.freeze(calculations)});
}
export function bindCalculatePlan(value:unknown,ticket:ReadTicket,subjects:readonly {id:string;name:string|null}[]):CalculatePlan {
 return bind(value,ticket,name=>{
  if(typeof name!=="string")return fail("subject");
  const matches=subjects.filter(p=>p.name?.normalize("NFKC").toLowerCase()===name.normalize("NFKC").toLowerCase());
  if(matches.length!==1)return fail("subject");
  return matches[0].id;
 },false);
}
/** Revalidation after trusted JSON transport preserves semantics, never selects. */
export function rebindCalculatePlan(value:unknown,ticket:ReadTicket):CalculatePlan {
 return bind(value,ticket,id=>typeof id==="string"&&ticket.subjects.petIds.includes(id)?id:fail("subject"),true);
}
