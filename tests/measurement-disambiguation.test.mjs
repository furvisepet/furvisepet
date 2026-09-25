import {assert,test,bindCalculatePlan,rebindCalculatePlan,calculatePlanSchema,bindTypedReadTicket,executeCalculatePlan,buildLabsList,calculationPublicationFailure,reviewHistoricalAnswer,validateGeneratedAnswer,pets,row,rawTicket,slot,calculation,proposal,fixture,finish} from "./helpers/calculation-fixture.mjs";
import {requiresCalculateBinding} from "../app/lib/furvise-brain/calculate-plan.ts";
import {measurementCandidates} from "../app/lib/furvise-brain/measurement-candidates.ts";
import {normalizeReadText,textMatchesReadPredicate} from "../app/lib/furvise-brain/read-text.ts";
import {readFile} from "node:fs/promises";

const predicate=(...terms)=>({kind:"text_any",terms});
const ticket=(predicates=[predicate("alpha","beta")])=>({...rawTicket(),predicates});
const selected=(indexes=[0],unit="kg",pet=pets[0])=>({...slot(0,0,pet.name,"measurement",unit),measurementSelector:indexes===null?null:{predicateIndexes:indexes}});
const bound=(predicates)=>bindTypedReadTicket(ticket(predicates),[pets[0].id]);
const plan=(operand=selected())=>proposal([calculation("convert",[operand],"kg")]);
const result=f=>f.response.calculationLabs.execution.results[0];
async function run(body,{predicates=[predicate("alpha","beta")],indexes=[0],unit="kg",...options}={}){
 return fixture({ticket:ticket(predicates),sourceRows:[row("chosen",body)],calculations:[calculation("convert",[selected(indexes,unit)],unit)],...options});
}
async function limited(body,reason,options={}){
 const f=await run(body,options);
 assert.equal(f.response.model,"server-calculation-unavailable");
 assert.deepEqual(f.response.relevantContextIds,[]);assert.equal(f.response.calculationLabs,undefined);
 const e=executeCalculatePlan(f.plan,buildLabsList(f.evidence,f.result.records,true));
 assert.equal(e.results[0].reason,reason);assert.equal((await finish(f)).assessment.outcome,"limited");
 return f;
}

test("selector is a closed predicate-index reference, never new semantic text",()=>{
 const t=bound(),p=bindCalculatePlan(plan(),t,pets),s=p.calculations[0].operands[0];
 assert.deepEqual(s.measurementSelector,{predicateIndexes:[0]});assert.equal(s.subjectId,pets[0].id);
 assert.ok(Object.isFrozen(s.measurementSelector));assert.ok(Object.isFrozen(s.measurementSelector.predicateIndexes));
 assert.equal(requiresCalculateBinding(p),true);
 const schema=calculatePlanSchema.anyOf[1].properties.calculations.items.properties.operands.items.anyOf[0].properties.measurementSelector.anyOf[1];
 assert.deepEqual(Object.keys(schema.properties),["predicateIndexes"]);assert.equal(schema.additionalProperties,false);
});
for(const [name,selector] of [
 ["empty",{predicateIndexes:[]}],["duplicate",{predicateIndexes:[0,0]}],["negative",{predicateIndexes:[-1]}],
 ["fraction",{predicateIndexes:[0.5]}],["missing",{predicateIndexes:[1]}],["string",{predicateIndexes:["0"]}],
 ["non-array",{predicateIndexes:0}],["extra semantic text",{predicateIndexes:[0],label:"alpha"}],
 ["offset",{predicateIndexes:[0],start:0}],["occurrence",{predicateIndexes:[0],occurrence:1}],["null index",{predicateIndexes:[null]}],
 ["missing indexes",{}],["array",[]],
])test("binder rejects selector "+name,()=>{
 const operand=selected();operand.measurementSelector=selector;
 assert.throws(()=>bindCalculatePlan(plan(operand),bound(),pets),/ASK_CALCULATE_INVALID/);
});
test("binder rejects a reference to any non-text predicate",()=>{
 const t=structuredClone(bound());t.predicates[0]={kind:"other",terms:["alpha"]};
 assert.throws(()=>bindCalculatePlan(plan(),t,pets),/measurement_selector/);
});
test("event_at forbids nonnull selector while null and omission preserve elapsed semantics",()=>{
 const t=bound(),a={...slot(0,0,pets[0].name,"event_at",null),measurementSelector:{predicateIndexes:[0]}},b=slot(1,0,pets[0].name,"event_at",null);
 const p=proposal([calculation("elapsed_days",[a,b],"day")]);
 assert.throws(()=>bindCalculatePlan(p,t,pets),/measurement_selector/);
 p.calculations[0].operands[0].measurementSelector=null;assert.doesNotThrow(()=>bindCalculatePlan(p,t,pets));
});
test("count_records cannot gain a selector or operand",()=>{
 const t=bindTypedReadTicket(rawTicket(true),[pets[0].id]),p=proposal([calculation("count_records",[],"records")]);
 p.calculations[0].measurementSelector={predicateIndexes:[0]};assert.throws(()=>bindCalculatePlan(p,t,pets),/calculation/);
 delete p.calculations[0].measurementSelector;p.calculations[0].operands=[selected()];assert.throws(()=>bindCalculatePlan(p,t,pets),/exhaustive_count/);
});
for(const [name,change] of [
 ["indexes",p=>p.calculations[0].operands[0].measurementSelector.predicateIndexes=[1]],
 ["removed",p=>delete p.calculations[0].operands[0].measurementSelector],
 ["null",p=>p.calculations[0].operands[0].measurementSelector=null],
 ["added conjunct",p=>p.calculations[0].operands[0].measurementSelector.predicateIndexes.push(1)],
])test("trusted serialized rebind rejects changed selector "+name,()=>{
 const t=bound([predicate("alpha"),predicate("beta")]),p=bindCalculatePlan(plan(),t,pets),copy=structuredClone(p);change(copy);
 assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);
});
test("trusted clone retains exact selector and predicate order",()=>{
 const t=bound([predicate("alpha"),predicate("beta")]),p=bindCalculatePlan(plan(),t,pets),copy=JSON.parse(JSON.stringify(p));
 assert.deepEqual(rebindCalculatePlan(copy,structuredClone(t),p),p);
 assert.throws(()=>rebindCalculatePlan(structuredClone(p),t),/binding_snapshot/);
 for(const edit of [x=>x.predicates.reverse(),x=>x.predicates[0].terms.push("other")]){
  const changed=structuredClone(t);edit(changed);assert.throws(()=>rebindCalculatePlan(p,changed),/binding_snapshot/);
 }
});
test("adding selector to a trusted no-selector plan fails rebind",()=>{
 const t=bound(),p=bindCalculatePlan(plan(slot()),t,pets),copy=structuredClone(p);
 copy.calculations[0].operands[0].measurementSelector={predicateIndexes:[0]};
 assert.throws(()=>rebindCalculatePlan(copy,t,p),/binding_snapshot/);
});

for(const [name,body,terms,unit,values,literals] of [
 ["mass","Body weight: 5.2 kg, carrier mass: 1.1 kg.",["body weight","carrier mass"],"kg",[5.2,1.1],["5.2 kg","1.1 kg"]],
 ["volume","Water: 250 ml; rinse solution: 40 ml.",["water","rinse solution"],"ml",[250,40],["250 ml","40 ml"]],
 ["length","strap length 40 cm, table height 80 cm",["strap length","table height"],"cm",[40,80],["40 cm","80 cm"]],
 ["identical literals","first concept: 5 kg, second concept: 5 kg",["first concept","second concept"],"kg",[5,5],["5 kg","5 kg"]],
])test(name+" uses one generic selector with exact occurrence identity",async()=>{
 const spans=[];
 for(let i=0;i<2;i++){
  const f=await run(body,{predicates:terms.map(t=>predicate(t)),indexes:[i],unit});
  assert.equal(f.response.model,"server-calculation-labs");const r=result(f),o=r.operands[0];
  assert.equal(r.value,values[i]);assert.equal(o.literal,literals[i]);assert.equal(o.recordId,"chosen");
  assert.equal(o.body.slice(o.sourceSpan.start,o.sourceSpan.end),literals[i]);assert.deepEqual(o.measurementSelector,{predicateIndexes:[i]});
  assert.deepEqual(o.slot.measurementSelector,{predicateIndexes:[i]});assert.equal(o.subjectId,pets[0].id);
  assert.match(f.response.answer.summary,/2024-01-01/);assert.ok(f.response.answer.summary.includes(literals[i]));
  assert.doesNotMatch(f.response.answer.summary,/predicateIndexes|sourceSpan|contextSpan|diagnosis|improvement|causation/);
  spans.push(o.sourceSpan);await finish(f);
 }
 assert.ok(spans[0].end<spans[1].start);
});
test("AND across selector indexes and OR within each predicate",async()=>{
 const f=await run("Alpha marked: 2 kg; alpha plain: 3 kg.",{predicates:[predicate("absent","alpha"),predicate("marked")],indexes:[0,1]});
 assert.equal(result(f).value,2);await finish(f);
});
for(const selector of [null,undefined])test("no selector preserves record-wide ambiguity "+String(selector),async()=>{
 const options=selector===undefined?{calculations:[calculation("convert",[slot()],"kg")]}:{indexes:null};
 await limited("alpha: 5 kg; beta: 1 kg","ambiguous_measurement",options);
});
test("numeric errors in an unselected occurrence do not override G1 ambiguity or a valid selector",async()=>{
 const body="alpha: 5 kg; beta: 10000000000001 kg";
 await limited(body,"ambiguous_measurement",{indexes:null});
 const f=await run(body,{predicates:[predicate("alpha")],indexes:[0]});assert.equal(result(f).value,5);await finish(f);
 await limited(body,"nonfinite_or_overflow",{predicates:[predicate("beta")]});
});
test("insufficient selector never chooses first or nearest",async()=>{await limited("alpha: 5 kg; alpha: 1 kg","measurement_selector_ambiguous");});
test("same undelimited context remains ambiguous",async()=>{await limited("alpha 5 kg and beta 1 kg","measurement_selector_ambiguous");});
test("global predicate match never rescues missing local context",async()=>{await limited("alpha. first 5 kg; second 1 kg","measurement_selector_no_match");});
test("dimension filter precedes selector matching",async()=>{await limited("alpha: 4 ml; beta: 3 kg","measurement_selector_no_match",{predicates:[predicate("alpha")]});});
test("mixed dimensions preserve single-compatible no-selector rule",async()=>{
 const f=await run("alpha: 4 ml; beta: 3 kg",{indexes:null});assert.equal(result(f).value,3);await finish(f);
});
test("unitless numbers cannot acquire physical authority from selector",async()=>{
 await limited("alpha: five; alpha score 8; alpha 10","measurement_selector_no_match");
});
test("selected ambiguity cannot seek an alternative record",async()=>{
 const f=await limited("alpha: 5 kg; beta: 4 kg","measurement_selector_ambiguous",{
  sourceRows:[row("chosen","alpha: 5 kg; beta: 4 kg"),row("later","alpha: 8 kg",2)]});
 assert.equal(f.result.records[0].id,"chosen");assert.deepEqual(f.response.relevantContextIds,[]);
});
for(const [body,unit,value] of [
 ["alpha: -1.25 kg; beta: 2 kg","kg",-1.25],
 ["alpha: \u22121.25 KG; beta: 2 kg","g",-1250],
 ["alpha: +1.25 kilograms; beta: 2 kg","kg",1.25],
 ["alpha: 2 lbs; beta: 3 lb","g",907.18474],
])test("existing sign decimal alias conversion "+body,async()=>{
 const f=await run(body,{predicates:[predicate("alpha")],unit});assert.equal(result(f).value,value);await finish(f);
});
for(const delimiter of [",",";","\n","\r\n","|",". ","! ","? "])test("structural separator "+JSON.stringify(delimiter)+" preserves colon label and decimals",()=>{
 const body="alpha: 1.25 kg"+delimiter+"beta: 2.75 kg",c=measurementCandidates(body,"mass");
 assert.equal(c.length,2);assert.equal(c[0].context,"alpha: 1.25 kg");assert.equal(c[1].context.trim(),"beta: 2.75 kg");
 assert.deepEqual(c[0].exact,{n:5n,d:4n});assert.equal(c[0].numericText,"1.25");
 for(const x of c)assert.equal(body.slice(x.sourceSpan.start,x.sourceSpan.end),x.literal);
});
test("UTF-16 source offsets identify occurrence after non-BMP source text",()=>{
 const body="🐾 alpha: 5 kg, beta: 5 kg",c=measurementCandidates(body,"mass");
 assert.equal(c[0].sourceSpan.start,body.indexOf("5 kg"));assert.equal(c[1].sourceSpan.start,body.lastIndexOf("5 kg"));
});

for(const [name,edit] of [
 ["span",l=>l.execution.results[0].operands[0].sourceSpan.start++],
 ["same-valued occurrence",l=>{const o=l.execution.results[0].operands[0];o.sourceSpan={start:o.body.lastIndexOf("5 kg"),end:o.body.lastIndexOf("5 kg")+4};}],
 ["context",l=>l.execution.results[0].operands[0].contextSpan.end++],
 ["numeric literal",l=>l.execution.results[0].operands[0].numericText="99"],
 ["literal",l=>l.execution.results[0].operands[0].literal="99 kg"],
 ["unit",l=>l.execution.results[0].operands[0].unit="lb"],
 ["value",l=>l.execution.results[0].operands[0].value=99],
 ["exact",l=>l.execution.results[0].exact.numerator="99"],
 ["operand exact",l=>l.execution.results[0].operands[0].measurementExact.numerator="99"],
 ["operand selector",l=>l.execution.results[0].operands[0].measurementSelector={predicateIndexes:[1]}],
 ["source",l=>l.execution.results[0].operands[0].sourceId="care:other"],
 ["subject",l=>l.execution.results[0].operands[0].subjectId=pets[1].id],
 ["date",l=>l.execution.results[0].operands[0].eventAt="2024-02-01T00:00:00Z"],
 ["body",l=>l.readLabs.records[0].body="beta: 5 kg; alpha: 5 kg"],
 ["structure",l=>l.readLabs.records[0].body=l.readLabs.records[0].body.replace(";"," and")],
 ["selector",l=>{l.calculatePlan=structuredClone(l.calculatePlan);l.calculatePlan.calculations[0].operands[0].measurementSelector.predicateIndexes=[1];}],
])test("reviewed Labs rejects tampered "+name,async()=>{
 const f=await run("alpha: 5 kg; beta: 5 kg",{predicates:[predicate("alpha"),predicate("beta")]});
 assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 edit(f.response.calculationLabs);assert.ok(calculationPublicationFailure(f.response));
 assert.equal(validateGeneratedAnswer(f.response,f.context,"routine",[pets[0].id]).valid,false);assert.equal(f.calls(),0);
});
test("DAG consumes exact disambiguated leaf with span provenance reachable through dependencies",async()=>{
 const f=await run("alpha: 1.25 kg; beta: 9 kg",{predicates:[predicate("alpha")],resultSelection:null,
  calculations:[calculation("convert",[selected()],"kg","a"),calculation("sum",[{kind:"result",calculationId:"a"},{kind:"result",calculationId:"a"}],"kg","b")]});
 const [a,b]=f.response.calculationLabs.execution.results;
 assert.deepEqual(a.operands[0].measurementExact,{numerator:"5",denominator:"4"});
 assert.deepEqual(b.exact,{numerator:"5",denominator:"2"});assert.deepEqual(b.transitiveCalculationIds,["a"]);
 assert.deepEqual(b.sourceIds,a.sourceIds);assert.equal(a.operands[0].body.slice(a.operands[0].sourceSpan.start,a.operands[0].sourceSpan.end),"1.25 kg");
 await finish(f);
});
for(const ambiguous of [false,true])test("G2 complete cohort "+(ambiguous?"fails if one selector is ambiguous":"ranks disambiguated candidates"),async()=>{
 const f=await run("unused",{subjects:pets,predicates:[predicate("alpha")],
  sourceRows:pets.map((p,i)=>row("r"+i,i&&ambiguous?"alpha 7 kg; alpha 9 kg":"alpha "+(i+1)+" kg; beta 10 kg",1,p.id)),
  calculations:pets.map((p,i)=>calculation("convert",[selected([0],"kg",p)],"kg","c"+i)),
  resultSelection:{filter:null,orderBy:{direction:"desc"},take:{count:1}}});
 if(ambiguous){assert.equal(f.response.model,"server-calculation-unavailable");assert.deepEqual(f.response.relevantContextIds,[]);}
 else{assert.deepEqual(f.response.calculationLabs.execution.resultSelection.selectedCalculationIds,["c1"]);assert.equal(f.response.calculationLabs.execution.resultSelection.complete,true);}
 await finish(f);
});
test("current emergency removes disambiguated calculation with zero provider calls or writes",async()=>{
 const f=await run("alpha 5 kg; beta 6 kg",{predicates:[predicate("alpha")]});
 assert.equal(f.response.model,"server-calculation-labs");f.context.currentMessage="My pet cannot breathe right now.";
 const v=await finish(f);assert.equal(v.response.model,"server-current-emergency");assert.equal(v.response.calculationLabs,undefined);
 assert.deepEqual(v.response.relevantContextIds,[]);
});
test("shared matcher preserves normalized literal semantics, including old punctuation edge behavior",()=>{
 const previous=s=>s.normalize("NFKC").toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu," ").trim();
 for(const text of ["ＡＬＰＨＡ: 2 kg","alpha-beta","alphabet","café sample","\n","\u03b1 Beta","first; second"])
 for(const terms of [["alpha"],["absent","beta"],["café"],["---"],["first second"],["α beta"]]){
  assert.equal(textMatchesReadPredicate(text,predicate(...terms)),terms.some(t=>(" "+previous(text)+" ").includes(" "+previous(t)+" ")));
  assert.equal(normalizeReadText(text),previous(text));
 }
});
test("retrieval still uses whole-record predicates independently of local selector",async()=>{
 const predicates=[predicate("alpha","beta"),predicate("sample")],t=ticket(predicates);
 const sourceRows=[row("a","SAMPLE alpha: 1 kg"),row("b","sample alphabet: 2 kg",2),row("c","sample; ＢＥＴＡ 3 kg",3),row("d","beta: 4 kg",4)];
 const f=await fixture({ticket:t,sourceRows,calculations:[calculation("convert",[slot()],"kg")]});
 assert.deepEqual(f.result.records.map(r=>r.id),["a","c"]);
 assert.ok(f.result.coverage.groups[0].clauses.every(c=>c.certified));await finish(f);
});
test("implementation has one shared lexical matcher and no new domain or raw-language authority",async()=>{
 const read=p=>readFile(new URL("../app/lib/furvise-brain/"+p,import.meta.url),"utf8");
 const [muscle,candidates,matcher,lungs,effective]=await Promise.all(["muscle.ts","measurement-candidates.ts","read-text.ts","lungs.ts","effective-selection.ts"].map(read));
 assert.match(muscle,/textMatchesReadPredicate/);assert.match(lungs,/textMatchesReadPredicate/);assert.match(effective,/textMatchesReadPredicate/);
 assert.doesNotMatch(lungs+effective,/\.normalize\("NFKC"\)/);
 assert.doesNotMatch(muscle+candidates,/\b(?:question|rawQuestion|currentMessage|requestText|sourceMessage|dialogue|conversation|client|model|semanticFrame)\b|responses\.create|supabase|fetch\(/);
 assert.doesNotMatch(muscle+candidates+matcher,/\b(?:weight|food|water|dose|temperature|carrier|height)\b/i);
 assert.doesNotMatch(candidates,/\b(?:bestMatch|firstMatch|lastMatch)\b/);
});
