import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {publicAskSections,formatAskResponsePlainText} from "../app/lib/ask.mjs";
import {readCoverageMessages} from "../app/lib/ask-read-only/coverage.mjs";

test("old technical search sections stay out of the conversation and Copy",()=>{
 const response={title:"Furvise",summary:"The note mentions a blue blanket.",safetyNote:null,
  sections:[{heading:"Search coverage",items:["3 DB attempts; complete_set; model candidates"]},
   {heading:"Saved notes",items:["The cat preferred the blue blanket."]}]};
 assert.deepEqual(publicAskSections(response.sections),[response.sections[1]]);
 const copied=formatAskResponsePlainText(response);
 assert.match(copied,/The cat preferred the blue blanket/);
 assert.doesNotMatch(copied,/DB attempts|complete_set|model candidates|Search coverage/);
 const ui=readFileSync(new URL("../app/ask/page.tsx",import.meta.url),"utf8");
 assert.match(ui,/sections=\{publicAskSections\(response.sections\)\}/);
 assert.doesNotMatch(ui,/Search details|search-coverage-details/);
});

test("new coverage notices disclose meaningful limits without internal mechanics",()=>{
 const complete={scope:{pet:"Example Cat"},discovery:[{mode:"chronological",attempts:2,pages:1}],unmet:[],hasMore:false,hasPrevious:false,truncated:false};
 assert.deepEqual(readCoverageMessages([complete]),[]);
 const partial={...complete,omitted:4,hasMore:true};
 const notices=readCoverageMessages([partial]);
 assert.equal(notices.length,1);assert.match(notices[0],/part of the matching saved history/);
 assert.doesNotMatch(notices[0],/DB|database|model|query|complete_set|candidate/i);
 const changed=readCoverageMessages([{...complete,unmet:["referenced_source_changed_or_missing"]}]);
 assert.match(changed[0],/changed or is no longer available/);
});
