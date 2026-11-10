import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import * as persistence from "../app/lib/intelligence/persist-learnings.ts";

test("retired automatic learning persistence cannot execute, claim a receipt or fall back to care writes",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.equal(persistence.persistIntelligenceLearnings,undefined);
 assert.doesNotMatch(read("app/lib/intelligence/persist-learnings.ts"),/\.rpc\(|\.from\(|persistCanonicalCareAction|persistCanonicalSemanticEvents/);
 const route=read("app/api/ask/route.ts");
 assert.doesNotMatch(route,/await persistIntelligenceLearnings\(/);
 assert.match(route,/runReadOnlyAsk/);
 assert.doesNotMatch(route,/prepareAppendTurn|persistCanonicalSuggestions|executeActionCapability/);
 assert.match(read("app/lib/application-actions/capabilities.ts"),/confirmFurviseWriteReceipt/);
 const ownerLearning={subjectType:"owner",subjectId:null,category:"communication_preference",
  factKey:"preferred_language",factValue:"French",sourceExcerpt:"Answer in French.",
  confidence:1,importance:"high",durability:"durable",action:"update"};
 assert.deepEqual(persistence.prepareAskMemoryAuthorityLearnings({authorizedPetIds:["pet"],
  currentMessage:ownerLearning.sourceExcerpt,learnings:[ownerLearning]}),[]);
});
