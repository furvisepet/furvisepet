import {bindResultSelection,resultSelectionSchema,type ResultSelection,type CalculationSource} from "./calculation-result-binding.ts";
import type { ReadTicket } from "./read-ticket.ts";
import { units } from "./calculation-units.ts";
import { bindUserSourceSpan, type UserSourceSpan } from "./append-job.ts";
import { decimal, div, mul, factor, finite, exact, type Exact } from "./calculation-rational.ts";

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
export type CalculatePremiseOperand=Readonly<{kind:"premise";role:CalculateRole;source:UserSourceSpan;exact:Exact;unit:string}>;
export type CalculateOperand=CalculateSlot|CalculatePremiseOperand|CalculateResultOperand;
export const isResultOperand=(o:CalculateOperand):o is CalculateResultOperand=>"kind" in o&&o.kind==="result";
export const isPremiseOperand=(o:CalculateOperand):o is CalculatePremiseOperand=>"kind" in o&&o.kind==="premise";
export const MAX_CALCULATION_DEPTH=8;
export const requiresCalculateBinding=(p:CalculatePlan|null|undefined):boolean=>!!p;
export type CalculatePlan = Readonly<{operation:"calculate"; resultSelection?:ResultSelection|null; calculations:readonly Readonly<{
  id:string; operator:CalculateOperator; operands:readonly CalculateOperand[]; resultUnit:string; precision:number|null;
}>[]}>;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).sort().join()===names.sort().join();
const fail=(reason:string):never=>{throw Error("ASK_CALCULATE_INVALID:"+reason);};
const unit=(v:unknown)=>typeof v==="string"&&Object.hasOwn(units,v)?units[v]:null;
export const DIRECT_CALCULATION_OPERAND_DESCRIPTION = "Consumes a factual measurement or event instant selected by ReadTicket. Use the direct clause/item slot whenever the required factual value is available there; the semantic role identifies its function in this operation.";
export const CALCULATION_PREMISE_LITERAL_PATTERN = String.raw`^\s*([+\u2212-]?\d+(?:\.\d+)?)\s*([A-Za-z]+)?\s*$`;
export const PREMISE_CALCULATION_OPERAND_DESCRIPTION = "Consumes one exact numeric premise from USER text. quote is an exact contiguous USER span and sourceTurnId is null for the current USER turn or an explicitly referenced prior USER turn. The server binds the source span and exact rational value; never provide a numeric value separately.";
export const RESULT_CALCULATION_OPERAND_DESCRIPTION = "Consumes only the certified arithmetic output of an EARLIER calculation node already emitted in this same calculations array. It is not a selected-record name, read-slot alias, premise alias or undeclared variable. No implicit producer exists.";
export const CALCULATION_INPUT_OWNERSHIP = "A root calculation uses exactly one factual source domain: certified ReadTicket slots or exact USER premise spans. Use kind:result only when the requested derivation depends on an EARLIER arithmetic node already present in calculations. Every calculationId must equal an actual prior producer id. ReadTicket slots and USER spans are not calculation IDs. Never provide computed values or source IDs; the server binds factual inputs.";
export const calculatePlanSchema={anyOf:[{type:"null"},{
 type:"object",additionalProperties:false,required:["operation","calculations","resultSelection"],properties:{
 resultSelection:resultSelectionSchema,
 operation:{type:"string",enum:["calculate"]},
 calculations:{type:"array",minItems:1,maxItems:20,items:{type:"object",additionalProperties:false,
 required:["id","operator","operands","resultUnit","precision"],properties:{
 id:{type:"string",minLength:1,maxLength:80},operator:{type:"string",enum:CALCULATE_OPERATORS},
 operands:{type:"array",maxItems:64,items:{anyOf:[{type:"object",description:DIRECT_CALCULATION_OPERAND_DESCRIPTION,additionalProperties:false,
 required:["role","petName","clause","item","field","unit","measurementSelector"],properties:{
 role:{type:"string",enum:CALCULATE_ROLES},
 measurementSelector:{anyOf:[{type:"null"},{type:"object",additionalProperties:false,required:["predicateIndexes"],properties:{predicateIndexes:{type:"array",minItems:1,maxItems:6,items:{type:"integer",minimum:0,maximum:5}}}}],description:"Indexes into this readTicket.predicates, never new text or source coordinates. All referenced text_any predicates must match the same structural segment of exactly one compatible measurement. Null requires a single compatible measurement in the entire certified record. Null for event_at."},
 petName:{type:"string",minLength:1,maxLength:100},clause:{type:"integer",minimum:0,maximum:7},
 item:{type:"integer",minimum:0,maximum:99},field:{type:"string",enum:["measurement","event_at"]},
 unit:{type:["string","null"],enum:[...Object.keys(units),null]}}},
 {type:"object",description:PREMISE_CALCULATION_OPERAND_DESCRIPTION,additionalProperties:false,required:["kind","role","sourceTurnId","quote","unit"],properties:{
 role:{type:"string",enum:CALCULATE_ROLES},kind:{type:"string",enum:["premise"]},
 sourceTurnId:{type:["string","null"],maxLength:160},quote:{type:"string",minLength:1,maxLength:1200,pattern:CALCULATION_PREMISE_LITERAL_PATTERN},
 unit:{type:"string",enum:[...Object.keys(units),"scalar"]}}},
 {type:"object",description:RESULT_CALCULATION_OPERAND_DESCRIPTION,additionalProperties:false,required:["kind","role","calculationId"],properties:{role:{type:"string",enum:CALCULATE_ROLES},kind:{type:"string",enum:["result"]},calculationId:{type:"string",minLength:1,maxLength:80,description:"Exact id of an actual EARLIER calculation in this same calculations array. Emit that producer before referencing it. No implicit producer exists; ReadTicket slots and USER spans are not calculation IDs."}}}]}},
 resultUnit:{type:"string",enum:[...Object.keys(units),"scalar","%","records"]},
 precision:{type:["integer","null"],minimum:0,maximum:10}
 }}}}}]};

function premiseExact(text:string,targetUnit:string):Exact {
 const match=new RegExp(CALCULATION_PREMISE_LITERAL_PATTERN,"u").exec(text);
 if(!match)return fail("premise_literal");
 let q=decimal(match[1].replace("\u2212","-"));finite(q);
 const supplied=(match[2]||"").toLowerCase();
 if(targetUnit==="scalar"){if(supplied)return fail("premise_unit");return Object.freeze(exact(q));}
 const sourceUnit=Object.hasOwn(units,supplied)?units[supplied]:null;
 const target=Object.hasOwn(units,targetUnit)?units[targetUnit]:null;
 if(!sourceUnit||!target||sourceUnit.dimension!==target.dimension)return fail("premise_unit");
 q=div(mul(q,factor(supplied)),factor(targetUnit));finite(q);return Object.freeze(exact(q));
}
function calculationSources(source?:CalculationSource|readonly CalculationSource[]):readonly CalculationSource[]{
 if(!source)return [];
 return Array.isArray(source)?source as readonly CalculationSource[]:[source as CalculationSource];
}
function validBoundPremiseSpan(value:unknown):value is UserSourceSpan {
 return obj(value)&&keys(value,["id","sourceMessageId","start","end","text"])
  &&typeof value.id==="string"&&typeof value.sourceMessageId==="string"&&typeof value.text==="string"
  &&Number.isInteger(value.start)&&Number(value.start)>=0&&value.end===Number(value.start)+value.text.length
  &&value.id===value.sourceMessageId+":"+value.start+":"+value.end;
}
/** Roles own operator meaning. Array order preserves serialization and multiplicity only.
 * Only backward semantic calculation IDs may connect nodes; no expressions, database IDs or raw wording. */
function bind(value:unknown,ticket:ReadTicket|null,resolve:(v:unknown)=>string,bound:boolean,source?:CalculationSource|readonly CalculationSource[]):CalculatePlan {
 if(!obj(value)||!keys(value,Object.hasOwn(value,"resultSelection")?["operation","calculations","resultSelection"]:["operation","calculations"])||value.operation!=="calculate"
  ||!Array.isArray(value.calculations)||!value.calculations.length||value.calculations.length>20) return fail("plan");
 const validTicket=!!ticket&&["read","read_since_event"].includes(ticket.operation)&&!ticket.episode&&!ticket.needs?.length
  &&ticket.outputs.strategy==null&&!ticket.temporal.calendar;
 const sources=calculationSources(source);
 let rootDomain:"read"|"premise"|null=null;
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
  const resultCount=c.operands.filter(o=>obj(o)&&o.kind==="result").length;
  const premiseCount=c.operands.filter(o=>obj(o)&&o.kind==="premise").length;
  const derived=resultCount>0,premise=premiseCount>0;
  if(derived&&resultCount!==n||premise&&premiseCount!==n)return fail("mixed_operands");
  if(operator==="count_records"){
   if(!validTicket||!ticket||n||ticket.selection||ticket.outputs.completeness!=="exhaustive"||ticket.outputs.limit!==null||c.resultUnit!=="records")return fail("exhaustive_count");
   if(rootDomain&&rootDomain!=="read")return fail("mixed_source_domains");rootDomain="read";
  }else{
   if(premise){
    if(operator==="elapsed_days")return fail("premise_operator");
    if(rootDomain&&rootDomain!=="premise")return fail("mixed_source_domains");rootDomain="premise";
   }else if(!derived){
    if(!validTicket||!ticket?.selection||ticket.selection.groupBy.length!==1)return fail("selection_required");
    if(rootDomain&&rootDomain!=="read")return fail("mixed_source_domains");rootDomain="read";
   }
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
  }else if(premise){
   const premiseInputs=c.operands.map(o=>{
    if(!obj(o)||o.kind!=="premise")return fail("premise_operand");
    let span:UserSourceSpan,unitName:string,exactValue:Exact;
    if(bound){
     if(!keys(o,["kind","role","source","exact","unit"])||!validBoundPremiseSpan(o.source)||typeof o.unit!=="string")return fail("premise_operand");
     span=Object.freeze({...o.source});unitName=o.unit;exactValue=premiseExact(span.text,unitName);
     if(!obj(o.exact)||!keys(o.exact,["numerator","denominator"])||JSON.stringify(o.exact)!==JSON.stringify(exactValue))return fail("premise_exact");
    }else{
     if(!keys(o,["kind","role","sourceTurnId","quote","unit"])||typeof o.unit!=="string"
      ||!(o.sourceTurnId===null||typeof o.sourceTurnId==="string"))return fail("premise_operand");
     const candidate=o.sourceTurnId===null?sources[0]:sources.find(item=>item.id===o.sourceTurnId);
     if(!candidate||candidate.role!=="user")return fail("premise_source");
     span=bindUserSourceSpan(candidate,o.quote);unitName=o.unit;exactValue=premiseExact(span.text,unitName);
    }
    if(unitName!=="scalar"&&!unit(unitName))return fail("premise_unit");
    return Object.freeze({kind:"premise" as const,role:o.role as CalculateRole,source:span,exact:exactValue,unit:unitName});
   });
   const dimensions=premiseInputs.map(o=>o.unit==="scalar"?"scalar":unit(o.unit)!.dimension);
   if(new Set(dimensions).size>1)return fail("dimensions");
   if(operator==="ratio"){if(c.resultUnit!=="scalar")return fail("result_unit");}
   else if(operator==="percent_change"||operator==="percent_of_sum"){if(c.resultUnit!=="%")return fail("result_unit");}
   else if(operator==="convert"){
    if(premiseInputs[0].unit==="scalar"||!unit(c.resultUnit)||unit(premiseInputs[0].unit)!.dimension!==unit(c.resultUnit)!.dimension)return fail("result_unit");
   }else{
    const target=c.resultUnit==="scalar"?{dimension:"scalar"}:unit(c.resultUnit);
    if(!target||target.dimension!==dimensions[0])return fail("result_unit");
   }
   operands=premiseInputs;
  }else{
   if(!ticket)return fail("read_domain");
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
 if(rootDomain==="premise"&&value.resultSelection!==null&&value.resultSelection!==undefined)return fail("premise_result_selection");
 const resultSelection=bindResultSelection(value.resultSelection,calculations,ticket?.subjects.petIds??[],sources[0],bound);
 return Object.freeze({operation:"calculate",calculations:Object.freeze(calculations),...(Object.hasOwn(value,"resultSelection")?{resultSelection}:{})});
}
export function bindCalculatePlan(value:unknown,ticket:ReadTicket|null,subjects:readonly {id:string;name:string|null}[],source?:CalculationSource|readonly CalculationSource[]):CalculatePlan {
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
const remember=(plan:CalculatePlan,ticket:ReadTicket|null)=>bindings.set(plan,{plan:JSON.stringify(plan),ticket:JSON.stringify(ticket)});
export function rebindCalculatePlan(value:unknown,ticket:ReadTicket|null,authority?:CalculatePlan):CalculatePlan{
 if(requiresCalculateBinding(value as CalculatePlan)||requiresCalculateBinding(authority)){
  const receipt=bindings.get(authority??value as CalculatePlan);
  if(!receipt||receipt.plan!==JSON.stringify(value)||receipt.ticket!==JSON.stringify(ticket))return fail("binding_snapshot");
 }
 const plan=bind(value,ticket,id=>typeof id==="string"&&ticket?.subjects.petIds.includes(id)?id:fail("subject"),true);
 remember(plan,ticket);return plan;
}
export function carryCalculatePlan(source:CalculatePlan,target:CalculatePlan,ticket:ReadTicket|null):void{
 rebindCalculatePlan(target,ticket,source);remember(target,ticket);
}
