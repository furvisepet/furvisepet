import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
registerHooks({ resolve(s, c, next) {
  if (s === "server-only") return {url:"data:text/javascript,export {}",shortCircuit:true};
  if (s.startsWith(".") && c.parentURL?.startsWith("file:")) {
    for (const suffix of [".ts", "/index.ts"]) {
      const url = new URL(s + suffix, c.parentURL);
      if (existsSync(url)) return next(url.href, c);
    }
  }
  return next(s, c);
}});
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw Error("PRIVACY_REGRESSION_FORBIDS_NETWORK"); };
const {recoverAskInterpretation, AskInterpretationValidationError} =
  await import("../app/lib/intelligence/interpret-ask.ts");
const pet = {id:"JQ_SYNTHETIC_PET",name:"SyntheticPetJQ",user_id:"JQ_SYNTHETIC_OWNER",species:"cat"};
const ticket = () => ({operation:"read_since_event",subjectScope:"named",
  temporal:{from:null,to:null,anchor:{concept:"dental",relation:"from"},calendar:null},
  predicates:[{kind:"text_any",terms:["food"]}],searchHints:null,episode:null,needs:null,
  outputs:{completeness:"exhaustive",ordering:"asc",limit:null,strategy:"chronological"}});
function fixture(marker="ordinary") {
  const question = "SyntheticPetJQ show saved food notes from the dental visit. " + marker;
  const context = {owner:{userId:"JQ_SYNTHETIC_OWNER"},pet,eligiblePets:[pet],currentMessage:question,
    currentTurn:{id:"source-"+marker,role:"user",text:question},conversationTurns:[],timeZone:"UTC"};
  const proposal = {version:"ask-request.v2",mode:"read",question,requirements:[],referenceTurnIds:[],
    scope:"named",petNames:["SyntheticPetJQ"],operation:"recall",selection:"summary",quantity:"records",
    topic:"food",terms:["food"],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
    evidenceBasis:"saved_history",premiseQuotes:[],readTicket:ticket()};
  return {context,proposal};
}
function captureConsole(t) {
  const calls=[];
  for (const method of ["warn","info","error","log"])
    t.mock.method(console,method,(...args)=>calls.push({method,args}));
  return calls;
}
function assertSafe(calls, expected, marker) {
  assert.equal(JSON.stringify(calls).includes(marker), false, "private diagnostic content reached console");
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,"warn");
  assert.equal(calls[0].args.length,2);
  assert.equal(calls[0].args[0],"[Ask Brain] rejected read ticket");
  assert.deepEqual(JSON.parse(calls[0].args[1]),{errorCode:expected});
}
for (const environment of ["production","preview"]) {
  for (const kind of ["read_ticket","read_ticket_required","read_needs"]) {
    test("rejected-ticket privacy: "+environment+"/"+kind,t=>{
      const marker="JQ_SYNTHETIC_PRIVATE_question_source_answer_secret_987654321";
      const {context,proposal}=fixture(marker);
      if(kind==="read_ticket"){
        proposal.readTicket.temporal.anchor=null;
        proposal.readTicket.searchHints=[marker];
        proposal.readTicket.predicates[0].terms=[marker];
      } else if(kind==="read_ticket_required") {
        delete proposal.readTicket;
      } else {
        proposal.readTicket.operation="read";
        proposal.readTicket.temporal.anchor=null;
        proposal.readTicket.needs={nested:[{answer:marker,numeric:987654321,secret:marker}]};
      }
      const before=structuredClone(proposal),calls=captureConsole(t);
      const prior=process.env.VERCEL_ENV;process.env.VERCEL_ENV=environment;
      t.after(()=>{if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;});
      const expected="ASK_REQUEST_CONTRACT_"+kind.toUpperCase();
      assert.throws(()=>recoverAskInterpretation(proposal,context),e=>
        e instanceof AskInterpretationValidationError && e.category==="semantic" && e.reason===expected);
      assert.deepEqual(proposal,before,"diagnostics must not rewrite the rejected proposal");
      assertSafe(calls,expected,marker);
    });
  }
}
for(const shape of ["toJSON","cycle","bigint"]) {
  test("rejected-ticket diagnostics do not serialize malformed caller data: "+shape,t=>{
    const marker="JQ_SYNTHETIC_PRIVATE_alternate_serialization";
    const {context,proposal}=fixture(marker),calls=captureConsole(t);
    let serialized=0;
    if(shape==="toJSON")proposal.readTicket.toJSON=()=>{serialized++;return {secret:marker};};
    if(shape==="cycle")proposal.readTicket.privateCopy=proposal.readTicket;
    if(shape==="bigint")proposal.readTicket.privateCopy=987654321n;
    assert.throws(()=>recoverAskInterpretation(proposal,context),e=>
      e instanceof AskInterpretationValidationError && e.reason==="ASK_REQUEST_CONTRACT_READ_TICKET");
    assert.equal(serialized,0,"diagnostics must not invoke proposal serialization hooks");
    assertSafe(calls,"ASK_REQUEST_CONTRACT_READ_TICKET",marker);
  });
}
test("valid read binding is unchanged and does not emit rejected-ticket diagnostics",t=>{
  const {context,proposal}=fixture(),calls=captureConsole(t);
  const result=recoverAskInterpretation(proposal,context);
  assert.equal(result.readOnly,true);
  assert.equal(result.request.readTicket.operation,"read_since_event");
  assert.deepEqual(result.request.readTicket.temporal.anchor,{concept:"dental",relation:"from"});
  assert.deepEqual(result.request.readTicket.subjects.petIds,[pet.id]);
  assert.equal(result.request.writeJob,null);
  assert.deepEqual(calls,[]);
});

test("invalid version preserves schema rejection without diagnostics",t=>{
 const {context,proposal}=fixture(),calls=captureConsole(t);proposal.version="invalid";
 assert.throws(()=>recoverAskInterpretation(proposal,context),e=>
  e instanceof AskInterpretationValidationError && e.reason==="ASK_REQUEST_CONTRACT_VERSION" && e.category==="schema");
 assert.deepEqual(calls,[]);
});
test("invalid scope preserves contract rejection without diagnostics",t=>{
 const {context,proposal}=fixture(),calls=captureConsole(t);proposal.scope="invalid";
 assert.throws(()=>recoverAskInterpretation(proposal,context),e=>
  e instanceof AskInterpretationValidationError && e.reason==="ASK_REQUEST_CONTRACT_SCHEMA" && e.category==="semantic");
 assert.deepEqual(calls,[]);
});

test("privacy fixtures made no network requests",()=>assert.equal(networkAttempts,0));
