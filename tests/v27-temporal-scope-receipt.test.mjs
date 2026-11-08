import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessTemporalScopeReceipt as assess } from "../app/lib/ask-temporal-scope-receipt.ts";
import { claimWithRestoredAskOrigin } from "../app/lib/ask-restored-retry.ts";
const scope=()=>({role:"event_time",from:"2025-04-01T00:00:00Z",to:"2025-04-02T00:00:00Z",timeZone:"UTC",source:"client_user_confirmed"});
const identity=()=>({ownerId:"owner",petId:"pet",conversationId:"conversation",requestId:"request",messageId:"message",message:"Question"});
const scoped=()=>({...identity(),role:"user",temporalScopeState:"scoped",confirmedTemporalScope:scope()});
const expected=()=>({...identity(),confirmedTemporalScope:scope()});
test("exact owned readback matches scope without granting confirmation authority",()=>{
 assert.deepEqual(assess(expected(),scoped()),{status:"scope_match_unverified"});
});
test("legacy absence matches only explicitly marked legacy unscoped",()=>{
 const stored={...identity(),role:"user",temporalScopeState:"legacy_unscoped",confirmedTemporalScope:null};
 assert.deepEqual(assess(identity(),stored),{status:"legacy_match"});
 assert.deepEqual(assess(expected(),stored),{status:"mismatch"});
});
test("missing state or missing stored row never becomes an unscoped match",()=>{
 const row=scoped();delete row.temporalScopeState;
 assert.deepEqual(assess(expected(),row),{status:"unavailable"});
 delete row.confirmedTemporalScope;assert.deepEqual(assess(identity(),row),{status:"unavailable"});
 assert.deepEqual(assess(identity(),null),{status:"unavailable"});
});
test("owner, pet, turn, conversation, request, role and message tampering fail",()=>{
 for(const key of ["ownerId","petId","conversationId","requestId","messageId","message","role"]){
  const row=scoped();row[key]="different";assert.deepEqual(assess(expected(),row),{status:"mismatch"},key);
 }
});
test("scope omission, altered role, bounds, zone, provenance and extra keys fail",()=>{
 const variants=[null,undefined,{...scope(),role:"report_recorded_time"},{...scope(),from:"2025-03-31T00:00:00Z"},
  {...scope(),to:"2025-04-03T00:00:00Z"},{...scope(),timeZone:"Europe/London"},
  {...scope(),source:"model"},{...scope(),extra:true}];
 for(const value of variants){const row=scoped();row.confirmedTemporalScope=value;assert.deepEqual(assess(expected(),row),{status:"mismatch"});}
 assert.deepEqual(assess(identity(),scoped()),{status:"mismatch"});
});
test("matched unverified readback cannot lift existing scoped replay guard",async()=>{
 const stored=scoped(),want=expected();assert.equal(assess(want,stored).status,"scope_match_unverified");
 let calls=0;
 await assert.rejects(claimWithRestoredAskOrigin({payload:{conversationId:"conversation",locale:"en",petId:"pet",question:"Question",confirmedTemporalScope:scope()},persisted:{conversationId:"conversation",question:"Question",userSequence:1,confirmedTemporalScope:scope()},claim:async()=>{calls++;return{};}}),/ASK_TEMPORAL_SCOPE_DURABILITY_UNAVAILABLE/);
 assert.equal(calls,0);
});
test("schema proposal is inert and retains explicit deployment blocker",()=>{
 const sql=readFileSync(new URL("../docs/proposals/ask-temporal-scope-draft.sql",import.meta.url),"utf8");
 assert.match(sql,/RAISE EXCEPTION 'DRAFT_NOT_APPROVED/);assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)/i);
});
