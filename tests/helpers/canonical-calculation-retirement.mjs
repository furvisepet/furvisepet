import {assert,fixture,finish,row,slot,clause,rawTicket,calculation,bindCalculatePlan,bindTypedReadTicket,pets} from "./calculation-fixture.mjs";
export * from "./calculation-fixture.mjs";
export {parseHistoryNarrative,historyNarrativeSchema} from "../../app/lib/intelligence/history-narrative.ts";
export {units} from "../../app/lib/furvise-brain/calculation-units.ts";
export async function measured(operator,texts,resultUnit,options={}){
 const unit=options.unit??"kg",ticket=rawTicket(operator==="count_records");
 if(ticket.selection)ticket.selection.union=[clause("asc",texts.length)];
 const operands=operator==="count_records"?[]:texts.map((_,i)=>slot(0,i,pets[0].name,operator==="elapsed_days"?"event_at":"measurement",operator==="elapsed_days"?null:unit));
 const c=calculation(operator,operands,resultUnit);c.precision=options.precision??null;
 const f=await fixture({calculations:[c],ticket,sourceRows:texts.map((text,i)=>row("source-"+i,text,(options.days??[])[i]??i+1)),...options.fixture});
 return f;
}
export async function certified(operator,texts,resultUnit,expected,options={}){
 const f=await measured(operator,texts,resultUnit,options);
 assert.equal(f.response.model,"server-calculation-labs");
 const r=f.response.calculationLabs.execution.results[0];
 assert.ok(Math.abs(r.value-expected)<1e-9);assert.equal(r.unit,resultUnit);
 assert.deepEqual(new Set(r.sourceIds),new Set(texts.map((_,i)=>"care:source-"+i)));
 await finish(f);return f;
}
export function rejects(patch){
 const c=calculation();patch(c);
 assert.throws(()=>bindCalculatePlan({operation:"calculate",calculations:[c],resultSelection:null},bindTypedReadTicket(rawTicket(),[pets[0].id]),pets),/ASK_CALCULATE_INVALID/);
}
export async function limitedFormat(format){
 const f=await fixture({format});assert.equal(f.response.model,"server-calculation-unavailable");
 assert.deepEqual(f.response.relevantContextIds,[]);assert.equal(f.response.calculationLabs,undefined);
 assert.equal((await finish(f)).assessment.outcome,"limited");return f;
}
