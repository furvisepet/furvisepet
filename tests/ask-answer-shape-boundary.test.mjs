import test from "node:test";
import assert from "node:assert/strict";
import {readOnlyAnswerSchemaForSources,validateReadOnlyAnswer} from "../app/lib/ask-read-only/core.mjs";
const sources=[{handle:"s1",kind:"history",body:"Private record wording.",eventAt:"2020-01-01T00:00:00Z",recordedAt:"2020-01-02T00:00:00Z"}];
test("wire schema restricts citations to saved components, including empty evidence",()=>{
 const variants=readOnlyAnswerSchemaForSources(sources).properties.components.items.anyOf;
 assert.deepEqual(variants.find(v=>v.properties.kind.enum.includes("saved")).properties.sources.items.enum,["s1"]);
 for(const variant of variants.filter(v=>!v.properties.kind.enum.includes("saved")))assert.equal(variant.properties.sources.maxItems,0);
 const empty=readOnlyAnswerSchemaForSources([]).properties.components.items.anyOf;
 assert.equal(empty.length,1);assert.ok(!empty[0].properties.kind.enum.includes("saved"));
});
test("rejected component diagnostics contain structural counts without private prose or unknown identifiers",()=>{
 const value={presentation:{sourceDates:[],contextRequired:false},components:[{kind:"general",text:"Private record wording.",sources:["s1"]}],sources:[],quotes:[],calculations:[],replyType:"answer"};
 assert.throws(()=>validateReadOnlyAnswer(value,sources),error=>{
  assert.equal(error.code,"ASK_READ_ANSWER_INVALID");
  assert.equal(error.answerDiagnostic.nonSavedComponentsWithSources,1);
  assert.ok(!JSON.stringify(error.answerDiagnostic).includes("Private"));
  assert.ok(!JSON.stringify(error.answerDiagnostic).includes("s1"));
  return true;
 });
});
