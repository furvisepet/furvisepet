import {bindResultSelection,resultSelectionSchema,type ResultSelection,type CalculationSource} from "./calculation-result-binding.ts";
import type { ReadTicket } from "./read-ticket.ts";
import { units } from "./calculation-units.ts";

export const CALCULATE_OPERATORS = ["sum","mean","difference","absolute_difference","ratio","percent_change","percent_of_sum","convert","elapsed_days","count_records"] as const;
export type CalculateOperator = typeof CALCULATE_OPERATORS[number];
export const CALCULATE_ROLES = ["target","reference","start","end","part","source","member"] as const;
export type CalculateRole = typeof CALCULATE_ROLES[number];
export const CALCULATION_ROLE_POLICY: Readonly<Record<CalculateOperator,{
 roles:Readonly<Partial<Record<CalculateRole,readonly [number,number]>>>;description:string;
}>> = {
 difference:{roles:{target:[1,1],reference:[1,1]},description:"difference: exactly one target and one reference; result = target - reference."},
 absolute_difference:{roles:{member:[2,2]},description:"absolute_difference: exactly two member operands; result = their absolute difference, independent of member order."},
 ratio:{roles:{target:[1,1],reference:[1,1]},description:"ratio: exactly one target and one reference; result = target / reference."},
 percent_change:{roles:{target:[1,1],reference:[1,1]},description:"percent_change: exactly one target and one reference; reference is the baseline; result = (target - reference) / reference * 100."},
 percent_of_sum:{roles:{part:[1,1],member:[1,63]},description:"percent_of_sum: exactly one part and one to 63 member operands; result = part / (part + sum(members)) * 100."},
 elapsed_days:{roles:{start:[1,1],end:[1,1]},description:"elapsed_days: exactly one start and one end event; result = (end - start) / 86400000 in instant days."},
 convert:{roles:{source:[1,1]},description:"convert: exactly one source operand; convert its value into resultUnit."},
 sum:{roles:{member:[1,64]},description:"sum: one to 64 member operands; sum every occurrence, including repeated operands."},
 mean:{roles:{member:[1,64]},description:"mean: one to 64 member operands; sum every occurrence divided by member count."},
 count_records:{roles:{},description:"count_records: no operands; result is the certified effective record count."}
};
export type MeasurementSelector = Readonly<{predicateIndexes:readonly number[]}>;
export type CalculateSlot = Readonly<{role:CalculateRole; subjectId:string; clause:number; item:number; field:"measurement"|"event_at"; unit:string|null; measurementSelector?:MeasurementSelector|null}>;
export type CalculateResultOperand=Readonly<{kind:"result";role:CalculateRole;calculationId:string}>;
export type CalculateOperand=CalculateSlot|CalculateResultOperand;
export const isResultOperand=(o:CalculateOperand):o is CalculateResultOperand=>"kind" in o&&o.kind==="result";
export const MAX_CALCULATION_DEPTH=8;
export const requiresCalculateBinding=(p:CalculatePlan|null|undefined):boolean=>!!p;
export type CalculatePlan = Readonly<{operation:"calculate"; resultSelection?:ResultSelection|null; calculations:readonly Readonly<{
  id:string; operator:CalculateOperator; operands:readonly CalculateOperand[]; resultUnit:string; precision:number|null;
}>[]}>;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).sort().join()===names.sort().join();
const fail=(reason:string):never=>{throw Error("ASK_CALCULATE_INVALID:"+reason);};
const unit=(v:unknown)=>typeof v==="string"&&Object.hasOwn(units,v)?units[v]:null;
export const calculatePlanSchema={anyOf:[{type:"null"},{
 type:"object",additionalProperties:false,required:["operation","calculations","resultSelection"],properties:{
 resultSelection:resultSelectionSchema,
 operation:{type:"string",enum:["calculate"]},
 calculations:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:false,
 required:["id","operator","operands","resultUnit","precision"],properties:{
 id:{type:"string",minLength:1,maxLength:80},operator:{type:"string",enum:CALCULATE_OPERATORS},
 operands:{type:"array",maxItems:64,items:{anyOf:[{type:"object",additionalProperties:false,
 required:["role","petName","clause","item","field","unit","measurementSelector"],properties:{
 role:{type:"string",enum:CALCULATE_ROLES},
 measurementSelector:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,required:["predicateIndexes"],properties:{predicateIndexes:{type:"array",minItems:1,maxItems:6,items:{type:"integer",minimum:0,maximum:5}}}}],description:"Indexes into this readTicket.predicates, never new text or source coordinates. All referenced text_any predicates must match the same structural segment of exactly one compatible measurement. Null requires a single compatible measurement in the entire certified record. Null for event_at."},
 petName:{type:"string",minLength:1,maxLength:100},clause:{type:"integer",minimum:0,maximum:7},
 item:{type:"integer",minimum:0,maximum:99},field:{type:"string",enum:["measurement","event_at"]},
 unit:{type:["string","null"],enum:[...Object.keys(units),null]}}},{type:"object",additionalProperties:false,required:["kind","role","calculationId"],properties:{role:{type:"string",enum:CALCULATE_ROLES},kind:{type:"string",enum:["result"]},calculationId:{type:"string",minLength:1,maxLength:80}}}]}},
 resultUnit:{type:"string",enum:[...Object.keys(units),"scalar","%","records"]},
 precision:{type:["integer","null"],minimum:0,maximum:10}
 }}}}}]};

/** Roles own operator meaning. Array order preserves serialization and multiplicity only.
 * Only backward semantic calculation IDs may connect nodes; no expressions, database IDs or raw wording. */
function bind(value:unknown,ticket:ReadTicket,resolve:(v:unknown)=>string,bound:boolean,source?:CalculationSource):CalculatePlan {
 if(!obj(value)||!keys(value,Object.hasOwn(value,"resultSelection")?["operation","calculations","resultSelection"]:["operation","calculations"])||value.operation!=="calculate"
  ||!Array.isArray(value.calculations)||!value.calculations.length||value.calculations.length>20) return fail("plan");
 if(!["read","read_since_event"].includes(ticket.operation)||ticket.episode||ticket.needs?.length
  ||ticket.outputs.strategy!=null||ticket.temporal.calendar)return fail("read_domain");
 const prior=new Map<string,{calculation:CalculatePlan["calculations"][number];depth:number}>();
 const calculations:CalculatePlan["calculations"][number][]=[];
 let chained=false;
 for(const c of value.calculations){
  if(!obj(c)||!keys(c,["id","operator","operands","resultUnit","precision"])
   ||typeof c.id!=="string"||!c.id.trim()||c.id.length>80||prior.has(c.id)
   ||!CALCULATE_OPERATORS.includes(c.operator as CalculateOperator)||!Array.isArray(c.operands)||c.operands.length>64
   ||!(c.precision===null||Number.isInteger(c.precision)&&Number(c.precision)>=0&&Number(c.precision)<=10)
   ||typeof c.resultUnit!=="string")return fail("calculation");
  const operator=c.operator as CalculateOperator,n=c.operands.length;
  const rolePolicy=CALCULATION_ROLE_POLICY[operator].roles;
  const roleRanges=Object.values(rolePolicy);
  const derived=c.operands.some(o=>obj(o)&&o.kind==="result");
  if(operator==="count_records"){
   if(n||ticket.selection||ticket.outputs.completeness!=="exhaustive"||ticket.outputs.limit!==null||c.resultUnit!=="records")return fail("exhaustive_count");
  }else{
   if(!ticket.selection||ticket.selection.groupBy.length!==1)return fail("selection_required");
   if(n<roleRanges.reduce((sum,range)=>sum+range[0],0)||n>roleRanges.reduce((sum,range)=>sum+range[1],0))return fail("arity");
  }
  for(const operand of c.operands){
   if(!obj(operand)||typeof operand.role!=="string"||!Object.hasOwn(rolePolicy,operand.role))return fail("operand_role");
  }
  for(const [role,[minimum,maximum]] of Object.entries(rolePolicy)){
   const count=c.operands.filter(o=>o.role===role).length;
   if(count<minimum||count>maximum)return fail("operand_role_cardinality");
  }
  let operands:CalculateOperand[],depth=1;
  if(derived){
   chained=true;
   if(operator==="elapsed_days"||operator==="count_records")return fail("derived_operator");
   const dependencies=c.operands.map(o=>{
    if(!obj(o)||!keys(o,["kind","role","calculationId"])||o.kind!=="result"||typeof o.calculationId!=="string")return fail("result_operand");
    const upstream=prior.get(o.calculationId);
    if(!upstream)return fail("backward_reference");
    if(upstream.calculation.operator==="count_records")return fail("count_dependency");
    return upstream;
   });
   depth=1+Math.max(...dependencies.map(d=>d.depth));
   if(depth>MAX_CALCULATION_DEPTH)return fail("dependency_depth");
   const inputUnit=dependencies[0].calculation.resultUnit;
   if(dependencies.some(d=>d.calculation.resultUnit!==inputUnit))return fail("derived_units");
   if(operator==="convert"){
    if(!unit(inputUnit)||!unit(c.resultUnit)||unit(inputUnit)!.dimension!==unit(c.resultUnit)!.dimension)return fail("derived_conversion");
   }else{
    const expected=operator==="ratio"?"scalar":["percent_change","percent_of_sum"].includes(operator)?"%":inputUnit;
    if(c.resultUnit!==expected)return fail("result_unit");
   }
   operands=c.operands.map(o=>Object.freeze({kind:"result" as const,role:(o as {role:CalculateRole}).role,calculationId:(o as {calculationId:string}).calculationId}));
  }else{
   const slots=c.operands.map(o=>{
    if(!obj(o)||!keys(o,["role",bound?"subjectId":"petName","clause","item","field","unit",...(Object.hasOwn(o,"measurementSelector")?["measurementSelector"]:[])]))return fail("slot");
    const subjectId=resolve(o[bound?"subjectId":"petName"]);
    if(!ticket.subjects.petIds.includes(subjectId))return fail("subject");
    if(!Number.isInteger(o.clause)||Number(o.clause)<0||!Number.isInteger(o.item)||Number(o.item)<0)return fail("position");
    const clause=ticket.selection?.union[Number(o.clause)];
    if(!clause||Number(o.item)>=clause.take.count)return fail("position");
    if(operator==="elapsed_days" ? o.field!=="event_at"||o.unit!==null
     :o.field!=="measurement"||!unit(o.unit))return fail("field_unit");
    let measurementSelector:MeasurementSelector|null=null;
    if(o.measurementSelector!=null){
     const selector=o.measurementSelector;
     if(o.field!=="measurement"||!obj(selector)||!keys(selector,["predicateIndexes"])
      ||!Array.isArray(selector.predicateIndexes)||!selector.predicateIndexes.length
      ||selector.predicateIndexes.length>ticket.predicates.length
      ||new Set(selector.predicateIndexes).size!==selector.predicateIndexes.length
      ||selector.predicateIndexes.some(i=>!Number.isInteger(i)||i<0||!ticket.predicates[i]||ticket.predicates[i].kind!=="text_any"))return fail("measurement_selector");
     measurementSelector=Object.freeze({predicateIndexes:Object.freeze([...selector.predicateIndexes] as number[])});
    }
    return Object.freeze({role:o.role as CalculateRole,subjectId,clause:Number(o.clause),item:Number(o.item),field:o.field as CalculateSlot["field"],unit:o.unit as string|null,
     ...(Object.hasOwn(o,"measurementSelector")?{measurementSelector}:{})});
   });
   const dimensions=slots.filter(o=>o.field==="measurement").map(o=>unit(o.unit)!.dimension);
   if(new Set(dimensions).size>1)return fail("dimensions");
   if(operator==="elapsed_days"){if(c.resultUnit!=="day")return fail("result_unit");}
   else if(operator==="ratio"){if(c.resultUnit!=="scalar")return fail("result_unit");}
   else if(operator==="percent_change"||operator==="percent_of_sum"){if(c.resultUnit!=="%")return fail("result_unit");}
   else if(operator!=="count_records"&&(!unit(c.resultUnit)||unit(c.resultUnit)!.dimension!==dimensions[0]))return fail("result_unit");
   operands=slots;
  }
  const calculation=Object.freeze({id:c.id,operator,operands:Object.freeze(operands),resultUnit:c.resultUnit,precision:c.precision as number|null});
  calculations.push(calculation);prior.set(c.id,{calculation,depth});
 }
 if(chained&&value.resultSelection!==null)return fail("dag_result_selection");
 const resultSelection=bindResultSelection(value.resultSelection,calculations,ticket.subjects.petIds,source,bound);
 return Object.freeze({operation:"calculate",calculations:Object.freeze(calculations),...(Object.hasOwn(value,"resultSelection")?{resultSelection}:{})});
}
export function bindCalculatePlan(value:unknown,ticket:ReadTicket,subjects:readonly {id:string;name:string|null}[],source?:CalculationSource):CalculatePlan {
 const plan=bind(value,ticket,name=>{
  if(typeof name!=="string")return fail("subject");
  const matches=subjects.filter(p=>p.name?.normalize("NFKC").toLowerCase()===name.normalize("NFKC").toLowerCase());
  if(matches.length!==1)return fail("subject");
  return matches[0].id;
 },false,source);
 remember(plan,ticket);return plan;
}
// Every plan snapshot protects roles, multiplicity, source slots and all derived semantics across in-process copies.
// A JSON clone needs its trusted original; a stale/untrusted JSON object cannot
// mint a source-bound threshold or change the comparator/cohort during rebind.
const bindings=new WeakMap<CalculatePlan,{plan:string;ticket:string}>();
const remember=(plan:CalculatePlan,ticket:ReadTicket)=>bindings.set(plan,{plan:JSON.stringify(plan),ticket:JSON.stringify(ticket)});
export function rebindCalculatePlan(value:unknown,ticket:ReadTicket,authority?:CalculatePlan):CalculatePlan{
 if(requiresCalculateBinding(value as CalculatePlan)||requiresCalculateBinding(authority)){
  const receipt=bindings.get(authority??value as CalculatePlan);
  if(!receipt||receipt.plan!==JSON.stringify(value)||receipt.ticket!==JSON.stringify(ticket))return fail("binding_snapshot");
 }
 const plan=bind(value,ticket,id=>typeof id==="string"&&ticket.subjects.petIds.includes(id)?id:fail("subject"),true);
 remember(plan,ticket);return plan;
}
export function carryCalculatePlan(source:CalculatePlan,target:CalculatePlan,ticket:ReadTicket):void{
 rebindCalculatePlan(target,ticket,source);remember(target,ticket);
}
