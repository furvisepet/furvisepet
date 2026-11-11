import test from "node:test";
import assert from "node:assert/strict";
import {readSourceMeasurements,calculateReadSources} from "../app/lib/ask-read-only/calculations.mjs";
const source=(id,body,event,recorded=event,pet="fir")=>({kind:"history",handle:id,id,petId:pet,petName:"Fir",body,eventAt:event,recordedAt:recorded});
const a=source("s1","Fir weighed 5 kg and ate 200 g.","2025-01-01T00:00:00Z","2025-03-02T00:00:00Z");
const b=source("s2","Fir body weight: 4500 g.","2025-02-01T00:00:00Z","2025-03-01T00:00:00Z");
test("measurement meaning distinguishes body weight, food and unlabeled mass",()=>{
 assert.deepEqual(readSourceMeasurements(a.body,"s1","history","Fir").map(v=>v.metric),["body_weight","food_mass"]);
 assert.equal(readSourceMeasurements("Amount 5 kg.","s1")[0].metric,null);
});
test("decreasing compatible body weights retain sign and event endpoints",()=>{
 const [r]=calculateReadSources([{operation:"difference",operands:["s1:m1","s2:m1"]}],[a,b]);
 assert.equal(r.value,-.5);assert.equal(r.metric,"body_weight");assert.match(r.text,/2025-01-01T00:00:00.000Z: 5 kg/);
});
test("recorded time is an explicit independent calculation axis",()=>{
 const [r]=calculateReadSources([{operation:"difference",timeBasis:"recorded",operands:["s1:m1","s2:m1"]}],[a,b]);
 assert.equal(r.value,.5);assert.match(r.text,/recorded dates/);
});
test("food and body mass do not become comparable by unit conversion",()=>{
 const [r]=calculateReadSources([{operation:"sum",operands:["s1:m1","s1:m2"]}],[a]);assert.equal(r.available,false);
});
test("unknown meaning and duplicate aliased operands are unavailable",()=>{
 const unknown=source("s3","Amount 5 kg.","2025-01-01T00:00:00Z");
 assert.equal(calculateReadSources([{operation:"sum",operands:["s1:m1","s3:m1"]}],[a,unknown])[0].available,false);
 const alias={...a,handle:"s4"};
 assert.equal(calculateReadSources([{operation:"sum",operands:["s1:m1","s4:m1"]}],[a,alias])[0].available,false);
});
test("cross-pet temporal change still cannot publish",()=>{
 assert.equal(calculateReadSources([{operation:"percent_change",operands:["s1:m1","s2:m1"]}],[a,{...b,petId:"ash"}])[0].available,false);
});

test("an unrelated weighed object does not become the pet's body weight",()=>{
 assert.equal(readSourceMeasurements("The bag weighed 5 kg.","s1","history","Fir")[0].metric,null);
 assert.equal(readSourceMeasurements("Weight: 5 kg.","s1","history","Fir")[0].metric,"body_weight");
});
