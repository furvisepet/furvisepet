import {test,assert,fixture,finish,parseHistoryNarrative,historyNarrativeSchema,rejects} from "./helpers/canonical-calculation-retirement.mjs";
import fs from "node:fs";
const root=new URL("../app/",import.meta.url);
function sources(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(new URL(e.name+"/",dir)):/\.(?:ts|tsx|mjs)$/.test(e.name)?[new URL(e.name,dir)]:[]);}
test("production has no legacy calculation executor parser schema or repair references",()=>{
 const forbidden=/HistoryCalculation|historyCalculationSchema|parseHistoryCalculations|verifiedCalculationQuantities|retainRepairCalculationBindings|attachDeterministicCalculationBindings|parseCalculationExpression|evaluateCalculationExpression/;
 for(const p of sources(root))assert.doesNotMatch(fs.readFileSync(p,"utf8"),forbidden,String(p));
});
test("dead provider calculation modules are deleted",()=>{
 for(const name of ["history-calculation","repair-calculation-bindings","historical-read-response","structured-history-json"])
  assert.equal(fs.existsSync(new URL("../app/lib/intelligence/"+name+".ts",import.meta.url)),false);
});
test("narrative compatibility cannot contain arithmetic metadata or expand sources",()=>{
 const sentence={text:"Compatibility text.",sourceIds:["care:first"]};
 assert.deepEqual(parseHistoryNarrative({sentences:[sentence]}),{sentences:[sentence]});
 for(const calculations of [[],[{value:3,operands:[{sourceId:"care:foreign"}]}]])
  assert.equal(parseHistoryNarrative({sentences:[{...sentence,calculations}]}),undefined);
 assert.equal(historyNarrativeSchema.properties.sentences.items.properties.calculations,undefined);
});
test("Brain cannot supply calculated values or expression programs",()=>{
 rejects(c=>c.value=3);rejects(c=>c.expression=[0,1,"add"]);rejects(c=>c.operator="expression");
});
test("legacy narrative and result carriers cannot override canonical calculation authority",async()=>{
 const f=await fixture();const {calculationPublicationFailure}=await import("../app/lib/intelligence/calculation-labs.ts");
 for(const field of ["historyNarrative","historicalResult"])
  assert.ok(calculationPublicationFailure({...f.response,[field]:{text:"Other fact",value:99}}));
 await finish(f);
});
