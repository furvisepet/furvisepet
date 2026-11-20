import test from "node:test";
import assert from "node:assert/strict";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){return s==="server-only"?{url:"data:text/javascript,export {};",format:"module",shortCircuit:true}:next(s,c);}});
const {guardVerifiedSourceText}=await import("../app/lib/ask-read-only/publication.ts");

test("server-verified dated history remains intact while generated write claims are still rejected",()=>{
 const verified="Here’s what I found in the saved notes:\n• QA Saffron 20Y  -  event 2011-05-14: “Saffron changed to rabbit food; no turkey food switch was recorded.”";
 const answer="These notes describe different situations.\n\n"+verified;
 const retained=guardVerifiedSourceText(answer,verified);
 assert.equal(retained.checked,answer);
 assert.equal(retained.stateRejected,false);
 const unsafe=guardVerifiedSourceText("I updated Saffron's saved note.\n\n"+verified,verified);
 assert.equal(unsafe.stateRejected,true);
 assert.match(unsafe.checked,/Saffron changed to rabbit food/);
});
