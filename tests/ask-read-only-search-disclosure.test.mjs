import test from "node:test";
import assert from "node:assert/strict";
import {readCoverageMessages} from "../app/lib/ask-read-only/coverage.mjs";
const row=(extra={})=>({scope:{pet:"Juniper",kind:"history",from:null,to:null,query:"weight"},returned:16,total:123,hasMore:true,hasPrevious:false,truncated:false,searchRelaxed:true,matchedTotal:0,...extra});
test("broadened partial search distinguishes candidates from literal matches",()=>{
 const [text]=readCoverageMessages([row()]);
 assert.match(text,/literal search returned no notes/i);
 assert.match(text,/16 of 123 broader saved notes/i);
 assert.match(text,/More candidate notes remain/);
 assert.doesNotMatch(text,/matching notes/);
 assert.match(text,/partial view/);
});
test("broadened complete search discloses relaxation without claiming partial coverage",()=>{
 const [text]=readCoverageMessages([row({returned:1,total:1,hasMore:false})]);
 assert.equal(typeof text,"string");assert.match(text,/literal search returned no notes/i);
 assert.match(text,/1 of 1 broader saved notes/);assert.doesNotMatch(text,/partial view|matching notes/);
});
test("broadened empty search discloses candidates without inventing a note",()=>{
 const [text]=readCoverageMessages([row({returned:0,total:0,hasMore:false})]);
 assert.equal(typeof text,"string");assert.match(text,/0 of 0 broader saved notes/);
 assert.match(text,/literal search returned no notes/i);assert.doesNotMatch(text,/partial view/);
});
test("broadened unknown count never invents an exact total",()=>{
 const [text]=readCoverageMessages([row({returned:1,total:null,hasMore:false})]);
 assert.equal(typeof text,"string");assert.match(text,/1 broader saved notes/);
 assert.doesNotMatch(text,/of (?:null|undefined|0)|matching notes/);
});
test("ordinary complete search stays quiet",()=>{
 assert.deepEqual(readCoverageMessages([row({searchRelaxed:false,hasMore:false,returned:1,total:1})]),[]);
});
test("ordinary bounded search retains matching and previous-page disclosure",()=>{
 const [text]=readCoverageMessages([row({searchRelaxed:false,hasPrevious:true})]);
 assert.match(text,/16 of 123 matching notes/);assert.match(text,/Results before this page were not inspected/);
 assert.match(text,/More matching notes remain/);assert.match(text,/partial view/);
});
test("broader date-scoped candidates keep pet/date labels and omit internal query handles",()=>{
 const [text]=readCoverageMessages([row({scope:{pet:"Juniper",from:"2026-10-01",to:"2026-10-31",query:"internal-query-marker"}})]);
 assert.match(text,/Juniper \(2026-10-01 to 2026-10-31\)/);
 assert.ok(!text.includes("internal-query-marker"));
});
