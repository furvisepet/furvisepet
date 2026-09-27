import {assert,test,bindCalculatePlan,rebindCalculatePlan,calculatePlanSchema,executeCalculatePlan,bindTypedReadTicket,buildLabsList,calculationPublicationFailure,reviewHistoricalAnswer,validateGeneratedAnswer,pets,row,rows,rawTicket,slot,calculation,fixture,finish} from "./helpers/calculation-fixture.mjs";
import {requiresCalculateBinding,MAX_CALCULATION_DEPTH} from "../app/lib/furvise-brain/calculate-plan.ts";
const {serializeCalculationLabs}=await import("../app/lib/intelligence/calculation-labs.ts");
const ref=calculationId=>({kind:"result",calculationId});
const leaf=(id="a",pet=pets[0])=>calculation("difference",[slot(1,0,pet.name),slot(0,0,pet.name)],"kg",id);
const derived=(id="b",operator="convert",ids=["a"],unit="g")=>calculation(operator,ids.map(ref),unit,id);
const chain=()=>[leaf(),derived()];
const plan=calculations=>({operation:"calculate",calculations,resultSelection:null});
const ticket=()=>bindTypedReadTicket(rawTicket(),[pets[0].id]);
const bind=calculations=>bindCalculatePlan(plan(calculations),ticket(),pets);
const dag=options=>fixture({calculations:chain(),resultSelection:null,...options});
const result=(f,id)=>f.response.calculationLabs.execution.results.find(r=>r.id===id);

test("DAG binds a closed semantic result union; trusted JSON transport preserves it",()=>{
 const p=bind(chain()),t=ticket();assert.equal(requiresCalculateBinding(p),true);
 assert.deepEqual(p.calculations[1].operands,[{...ref("a"),role:"source"}]);assert.ok(Object.isFrozen(p.calculations[1].operands[0]));
 const copy=JSON.parse(JSON.stringify(p));assert.deepEqual(rebindCalculatePlan(copy,t,p),p);
 assert.throws(()=>rebindCalculatePlan(copy,t),/binding_snapshot/);
});
for(const [label,edit] of [
 ["self",c=>c[1].operands=[{...ref("b"),role:"source"}]],
 ["forward",c=>{c[1].operands=[{...ref("c"),role:"source"}];c.push(derived("c"));}],
 ["unknown",c=>c[1].operands=[{...ref("absent"),role:"source"}]],
 ["missing ID",c=>c[1].operands=[{kind:"result",role:"source"}]],
 ["duplicate ID",c=>c[1].id="a"],
 ["numeric value",c=>c[1].operands[0].value=3],
 ["source ID",c=>c[1].operands[0].sourceId="care:first"],
 ["overridden unit",c=>c[1].operands[0].unit="kg"],
 ["read/result mixing",c=>{c[1].operator="sum";c[1].operands[0].role="member";c[1].operands.push({...slot(),role:"member"});c[1].resultUnit="kg";}],
 ["derived elapsed",c=>{c[1]=derived("b","elapsed_days",["a","a"],"day");}],
 ["unknown operand kind",c=>c[1].operands[0].kind="expression"],
 ["empty derived operands",c=>c[1].operands=[]],
 ["foreign leaf",c=>c[0].operands[0].petName="Not owned"],
 ["expression field",c=>c[1].expression="a*2"],
 ["duplicate plan output field",c=>c[1].visible=true],
])test("Binder rejects "+label,()=>{const c=chain();edit(c);assert.throws(()=>bind(c),/ASK_CALCULATE_INVALID/);});
for(const selection of [undefined,{filter:null,orderBy:{direction:"desc"},take:null}])test("DAG requires explicit null resultSelection "+String(selection),()=>{
 const p=plan(chain());if(selection===undefined)delete p.resultSelection;else p.resultSelection=selection;
 assert.throws(()=>bindCalculatePlan(p,ticket(),pets),/dag_result_selection/);
});
test("count records cannot become a dependency",()=>{
 const t=bindTypedReadTicket(rawTicket(true),[pets[0].id]);
 assert.throws(()=>bindCalculatePlan(plan([calculation("count_records",[],"records","a"),derived()]),t,pets),/ASK_CALCULATE_INVALID/);
});
const depth=n=>[leaf(),...Array.from({length:n-1},(_,i)=>derived("n"+i,"sum",[i?"n"+(i-1):"a"],"kg"))];
test("eight calculation levels are accepted and nine rejected",()=>{
 assert.equal(MAX_CALCULATION_DEPTH,8);assert.equal(bind(depth(8)).calculations.length,8);
 assert.throws(()=>bind(depth(9)),/dependency_depth/);
});
test("total calculation and operand resource limits remain bounded",()=>{
 assert.throws(()=>bind(Array.from({length:21},(_,i)=>leaf("n"+i))),/plan/);
 assert.throws(()=>bind([leaf(),derived("b","sum",Array(65).fill("a"),"kg")]),/calculation/);
});
for(const [u1,u2,operator,out] of [
 ["kg","lb","sum","kg"],["kg","%","sum","kg"],["scalar","%","difference","scalar"],
 ["kg","lb","percent_change","%"],["kg","g","ratio","scalar"],["kg","kilograms","mean","kg"]
])test("derived units reject "+[u1,u2,operator].join("/"),()=>{
 const make=(id,u)=>u==="%"?calculation("percent_change",[slot(0),slot(1)],u,id):u==="scalar"?calculation("ratio",[slot(0),slot(1)],u,id):calculation("convert",[slot(0)],u,id);
 assert.throws(()=>bind([make("a",u1),make("b",u2),derived("c",operator,["a","b"],out)]),/derived_units/);
});
for(const [unit,target] of [["%","kg"],["scalar","kg"],["kg","%"],["kg","ml"]])test("derived conversion rejects "+unit+" to "+target,()=>{
 const a=unit==="%"?calculation("percent_change",[slot(0),slot(1)],unit,"a"):unit==="scalar"?calculation("ratio",[slot(0),slot(1)],unit,"a"):leaf();
 assert.throws(()=>bind([a,derived("b","convert",["a"],target)]),/derived_conversion/);
});
test("derived arithmetic cannot implicitly change its output unit",()=>{
 assert.throws(()=>bind([leaf(),derived("b","sum",["a"],"g")]),/result_unit/);
});

test("chained conversion uses exact upstream rational, retains sources and publishes only terminal",async()=>{
 const f=await dag({calculations:[leaf(),derived("b","convert",["a"],"lb")]});
 assert.equal(f.response.model,"server-calculation-labs");
 const a=result(f,"a"),b=result(f,"b");
 assert.deepEqual(a.exact,{numerator:"3",denominator:"10"});
 assert.deepEqual(b.exact,{numerator:"30000000",denominator:"45359237"});
 assert.deepEqual(b.dependencyCalculationIds,["a"]);assert.deepEqual(b.transitiveCalculationIds,["a"]);
 assert.deepEqual(b.sourceIds,a.sourceIds);assert.deepEqual(b.subjectIds,a.subjectIds);
 assert.deepEqual(b.upstreamResults,[{role:"source",calculationId:"a",operator:"difference",unit:"kg",exact:a.exact}]);
 assert.deepEqual(f.response.calculationLabs.execution.terminalCalculationIds,["b"]);
 assert.doesNotMatch(f.response.answer.summary,/Difference/);
 assert.match(f.response.answer.summary,/Converted measurement/);
 const reads=f.reads.length;executeCalculatePlan(f.plan,f.response.calculationLabs.readLabs);assert.equal(f.reads.length,reads);
 await finish(f);
});
test("two-subject changes feed mean and third-level conversion with complete provenance",async()=>{
 const f=await dag({subjects:pets,sourceRows:[...rows(),row("other-first","sample 2 kg",1,pets[1].id),row("other-last","sample 2.7 kg",3,pets[1].id)],
 calculations:[leaf("a"),leaf("b",pets[1]),derived("c","mean",["a","b"],"kg"),derived("d","convert",["c"],"g")]});
 const c=result(f,"c"),d=result(f,"d");
 assert.deepEqual(c.exact,{numerator:"1",denominator:"2"});assert.equal(d.value,500);
 assert.deepEqual(c.dependencyCalculationIds,["a","b"]);assert.deepEqual(d.transitiveCalculationIds,["a","b","c"]);
 assert.deepEqual(d.sourceIds,["care:last","care:first","care:other-last","care:other-first"]);
 assert.deepEqual(d.subjectIds,pets.map(p=>p.id));assert.deepEqual(d.upstreamResults[0].exact,c.exact);
 assert.deepEqual(f.response.calculationLabs.execution.terminalCalculationIds,["d"]);
 assert.doesNotMatch(f.response.answer.summary,/Difference|Mean:/);await finish(f);
});
test("shared dependency is computed once and terminal order follows program order",async()=>{
 const f=await dag({calculations:[leaf("a"),calculation("convert",[slot(0)],"kg","other"),derived("b","convert",["a"],"g"),derived("c","difference",["a","other"],"kg")]});
 const e=f.response.calculationLabs.execution;
 assert.deepEqual(e.results.map(r=>r.id),["a","other","b","c"]);assert.equal(e.results.filter(r=>r.id==="a").length,1);
 assert.deepEqual(e.terminalCalculationIds,["b","c"]);
 assert.deepEqual(result(f,"b").upstreamResults[0].exact,result(f,"c").upstreamResults[0].exact);
 assert.deepEqual(result(f,"a").dependencyCalculationIds,[]);assert.deepEqual(result(f,"a").transitiveCalculationIds,[]);
 assert.ok(f.response.answer.summary.indexOf("Converted")<f.response.answer.summary.indexOf("Difference"));
 assert.equal(result(f,"c").value,-4.5);await finish(f);
});
test("independent leaf remains terminal beside a derived result",async()=>{
 const f=await dag({calculations:[leaf(),calculation("convert",[slot(0)],"kg","independent"),derived()]});
 assert.deepEqual(f.response.calculationLabs.execution.terminalCalculationIds,["independent","b"]);await finish(f);
});
test("exact thirds survive upstream presentation precision",async()=>{
 const a=calculation("ratio",[slot(0),slot(1)],"scalar","a");a.precision=2;
 const f=await dag({sourceRows:[row("first","sample 3 kg"),row("last","sample 1 kg",3)],calculations:[a,derived("b","sum",["a","a","a"],"scalar")]});
 assert.deepEqual(result(f,"a").exact,{numerator:"1",denominator:"3"});assert.equal(result(f,"a").value.toFixed(2),"0.33");
 assert.deepEqual(result(f,"b").exact,{numerator:"1",denominator:"1"});assert.equal(result(f,"b").upstreamResults.length,3);
 assert.deepEqual(result(f,"b").dependencyCalculationIds,["a"]);await finish(f);
});
for(const [operator,value,out] of [["sum",.6,"kg"],["mean",.3,"kg"],["difference",0,"kg"],["absolute_difference",0,"kg"],["ratio",1,"scalar"],["percent_change",0,"%"],["percent_of_sum",50,"%"]])
 test("derived "+operator+" follows G1 ordered arithmetic",async()=>{
 const f=await dag({calculations:[leaf(),derived("b",operator,["a","a"],out)]});
 assert.equal(result(f,"b").value,value);await finish(f);
});
for(const u of ["scalar","%"])for(const op of ["sum","mean","difference","absolute_difference","ratio","percent_change","percent_of_sum"])
 test("identical "+u+" permits derived "+op,async()=>{
 const a=calculation(u==="%"?"percent_change":"ratio",[slot(0),slot(1)],u,"a");
 const out=op==="ratio"?"scalar":op.startsWith("percent")?"%":u;
 const f=await dag({calculations:[a,derived("b",op,["a","a"],out)]});
 assert.equal(result(f,"b").unit,out);await finish(f);
});
test("explicit conversion permits later same-unit arithmetic",async()=>{
 const f=await dag({calculations:[leaf(),derived("b","convert",["a"],"g"),derived("c","sum",["b","b"],"g")]});
 assert.deepEqual(result(f,"c").exact,{numerator:"600",denominator:"1"});await finish(f);
});
test("elapsed days remains a leaf whose day result can feed explicit conversion",async()=>{
 const a=calculation("elapsed_days",[slot(0,0,pets[0].name,"event_at",null),slot(1,0,pets[0].name,"event_at",null)],"day","a");
 const f=await dag({calculations:[a,derived("b","convert",["a"],"hour")]});assert.equal(result(f,"b").value,48);await finish(f);
});
test("ambiguous leaf propagates limited dependency and no partial DAG publishes",async()=>{
 const f=await dag({sourceRows:[row("first","sample 4 kg and 5 kg"),row("last","sample 6 kg",3)]});
 const read=buildLabsList(f.evidence,f.result.records,true),e=executeCalculatePlan(f.plan,read);
 assert.equal(e.results[0].status,"limited");assert.equal(e.results[0].reason,"ambiguous_measurement");
 assert.deepEqual(e.results[1],{id:"b",status:"limited",reason:"dependency_not_certified"});
 assert.equal(e.complete,false);assert.equal(f.response.model,"server-calculation-unavailable");
 assert.deepEqual(f.response.relevantContextIds,[]);assert.equal(f.response.calculationLabs,undefined);await finish(f);
});
test("independent failed node prevents publication of otherwise certified terminal",async()=>{
 const f=await dag({calculations:[leaf(),derived(),calculation("convert",[slot(0,0,pets[0].name,"measurement","ml")],"ml","bad")]});
 const e=executeCalculatePlan(f.plan,buildLabsList(f.evidence,f.result.records,true));
 assert.equal(e.results[1].status,"certified");assert.equal(e.results[2].status,"limited");
 assert.equal(f.response.model,"server-calculation-unavailable");await finish(f);
});
test("zero denominator in a derived result propagates without partial publication",async()=>{
 const f=await dag({calculations:[leaf(),derived("zero","difference",["a","a"],"kg"),derived("bad","ratio",["zero","a"],"scalar"),derived("last","sum",["bad"],"scalar")]});
 const e=executeCalculatePlan(f.plan,buildLabsList(f.evidence,f.result.records,true));
 assert.equal(e.results[2].status,"limited");assert.equal(e.results[3].reason,"dependency_not_certified");await finish(f);
});
for(const [label,edit] of [
 ["reference",p=>p.calculations[2].operands[0].calculationId="other"],
 ["order",p=>p.calculations.reverse()],
 ["hidden dependency",p=>p.calculations[2].operands.push(ref("other"))],
 ["removed dependency",p=>p.calculations[2].operands=[]],
 ["upstream operator",p=>p.calculations[0].operator="absolute_difference"],
 ["upstream unit",p=>p.calculations[0].resultUnit="g"],
 ["terminal structure",p=>p.calculations.push(derived("new","sum",["b"],"g"))],
])test("trusted rebinding rejects changed "+label,()=>{
 const p=bind([leaf(),leaf("other"),derived()]),copy=structuredClone(p);edit(copy);
 assert.throws(()=>rebindCalculatePlan(copy,ticket(),p),/binding_snapshot/);
});
for(const [label,edit] of [
 ["exact result",l=>l.execution.results[0].exact.numerator="999"],
 ["display value",l=>l.execution.results[0].value=999],
 ["result unit",l=>l.execution.results[0].unit="lb"],
 ["operator",l=>l.execution.results[0].operator="mean"],
 ["direct edge",l=>l.execution.results[1].dependencyCalculationIds=[]],
 ["transitive edge",l=>l.execution.results[1].transitiveCalculationIds=[]],
 ["source",l=>l.execution.results[1].sourceIds.push("care:foreign")],
 ["subject",l=>l.execution.results[1].subjectIds.push("foreign")],
 ["upstream exact",l=>l.execution.results[1].upstreamResults[0].exact.denominator="0"],
 ["terminal list",l=>l.execution.terminalCalculationIds.unshift("a")],
 ["source snapshot",l=>l.readLabs.records[0].body="sample 99 kg"],
])test("post-review Labs rejects tampered "+label,async()=>{
 const f=await dag();assert.equal(await reviewHistoricalAnswer({result:f.response,client:f.client}),true);
 const reviewed=f.response;edit(reviewed.calculationLabs);
 assert.ok(calculationPublicationFailure(reviewed));
 const v=validateGeneratedAnswer(reviewed,f.context,"routine",[pets[0].id]);
 assert.equal(v.valid,false);assert.equal(f.calls(),0);
});
test("unregistered serialized Labs cannot mint execution authority",async()=>{
 const f=await dag();const clone=structuredClone(f.response);
 assert.ok(calculationPublicationFailure(clone));assert.equal(f.calls(),0);
});
for(const format of ["prose","bullets","table"])test("terminal "+format+" is deterministic and read-only",async()=>{
 const f=await dag({format});assert.equal(f.response.answer.summary,serializeCalculationLabs(f.response.calculationLabs));
 assert.doesNotMatch(f.response.answer.summary,/Difference/);
 if(format==="table")assert.match(f.response.answer.summary,/^\| Calculation \|/);
 if(format==="bullets")assert.match(f.response.answer.summary,/^- /);
 await finish(f);
});
test("emergency removes terminal and intermediate output without provider or writes",async()=>{
 const f=await dag();f.context.currentMessage="My pet cannot breathe right now.";
 const v=await finish(f);assert.equal(v.response.model,"server-current-emergency");assert.equal(v.response.calculationLabs,undefined);
 assert.deepEqual(v.response.relevantContextIds,[]);assert.equal(v.assessment.outcome,"limited");
});
test("closed result schema and derived execution have no raw-language or external input",async()=>{
 const resultSchema=calculatePlanSchema.anyOf[1].properties.calculations.items.properties.operands.items.anyOf.find(variant => variant.properties?.calculationId);
 assert.deepEqual(resultSchema.required,["kind","role","calculationId"]);assert.equal(resultSchema.additionalProperties,false);
 assert.deepEqual(Object.keys(resultSchema.properties),["role","kind","calculationId"]);
 const fs=await import("node:fs/promises"),source=await fs.readFile(new URL("../app/lib/furvise-brain/muscle.ts",import.meta.url),"utf8");
 const stage=source.slice(source.indexOf("if(derived){"),source.indexOf("}else{",source.indexOf("if(derived){")));
 assert.match(stage,/rational\(r.exact\)/);assert.doesNotMatch(stage,/r\.value|\.body|read\.records|retrieve|supabase|currentMessage|question|responses/);
 assert.doesNotMatch(source,/currentMessage|requestText|question|responses[.]create|supabase|eval[(]/);
});

test("maximum-depth execution retains every intermediate and only final terminal",async()=>{
 const f=await dag({calculations:depth(8)}),e=f.response.calculationLabs.execution;
 assert.equal(e.results.length,8);assert.deepEqual(e.terminalCalculationIds,["n6"]);
 assert.deepEqual(e.results.at(-1).exact,{numerator:"3",denominator:"10"});
 assert.deepEqual(e.results.at(-1).transitiveCalculationIds,["a","n0","n1","n2","n3","n4","n5"]);
 assert.deepEqual(e.results.at(-1).sourceIds,["care:last","care:first"]);await finish(f);
});
test("semantic node IDs never become provider-authored factual presentation labels",async()=>{
 const id="provider label claiming an untyped diagnosis";
 const f=await dag({calculations:[leaf(id),derived("terminal","convert",[id],"g")]});
 assert.doesNotMatch(f.response.answer.summary,/provider label|diagnosis/);await finish(f);
});
