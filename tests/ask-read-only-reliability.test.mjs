import test,{after} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {evaluateScenario} from "./helpers/ask-read-only-reliability.mjs";
const corpus=JSON.parse(readFileSync(new URL("./fixtures/ask-read-only-reliability-corpus.json",import.meta.url),"utf8"));
const evidence=[];
assert.ok(corpus.length>=40);
assert.equal(new Set(corpus.map(c=>c.question)).size,corpus.length);
for(const c of corpus)test("read-only reliability "+c.id+" "+c.category,async()=>{
 const result=await evaluateScenario(c);evidence.push(result);
 assert.equal(result.pass,true,JSON.stringify(result,null,2));
});
after(()=>{
 if(process.env.FURVISE_RELIABILITY_REPORT)writeFileSync(process.env.FURVISE_RELIABILITY_REPORT,JSON.stringify({schema:"AskReadOnlyReliability.v1",mode:"offline_scripted_provider_real_orchestrator_and_data_adapter",semanticModelQualityScored:false,total:evidence.length,pass:evidence.filter(x=>x.pass).length,fail:evidence.filter(x=>!x.pass).length,cases:evidence},null,2));
});
