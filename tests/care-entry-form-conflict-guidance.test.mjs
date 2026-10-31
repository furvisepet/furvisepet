import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";

// Actual form/event code with PO's isolated hook renderer. No browser, API or DB.
const root=fileURLToPath(new URL("../",import.meta.url));
const req=createRequire(path.join(root,"package.json"));
let networkAttempts=0;
const deny=()=>{networkAttempts++;throw new Error("PQ_NETWORK_DISABLED");};
globalThis.fetch=deny;
for(const name of ["node:http","node:https","node:net","node:tls","node:dns","node:dgram"]){
 const mod=req(name);
 for(const key of ["request","get","connect","createConnection","lookup","resolve","resolve4","resolve6","createSocket"])if(typeof mod[key]==="function")mod[key]=deny;
}
const ts=req("typescript");
const care=await import(pathToFileURL(path.join(root,"app/lib/care-log.mjs")).href);
function compile(relative,imports){
 const source=fs.readFileSync(path.join(root,relative),"utf8");
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const compiledModule={exports:{}};
 new Function("require","module","exports","process",code)(name=>{
  assert.ok(Object.hasOwn(imports,name),"unreviewed import: "+name);return imports[name];
 },compiledModule,compiledModule.exports,{env:{NODE_ENV:"production"}});
 return compiledModule.exports;
}
const conflict=compile("app/lib/care-entry-conflict.ts",{});
let slots=[],cursor=0;
const hooks={useId:()=>"pq-form",useMemo:fn=>fn(),useState:initial=>{
 const i=cursor++;if(!(i in slots))slots[i]=typeof initial==="function"?initial():initial;
 return[slots[i],value=>{slots[i]=typeof value==="function"?value(slots[i]):value;}];
}};
const jsx=(type,props)=>({type,props:props??{}});
const {CareEntryForm}=compile("app/components/care-entry-form.tsx",{
 react:hooks,"react/jsx-runtime":{jsx,jsxs:jsx,Fragment:Symbol.for("fragment")},
 "../lib/care-log.mjs":care,"../lib/care-entry-conflict":conflict,
 "../lib/petwise":{formatPetDisplayName:name=>name??"Synthetic pet",formatSpecies:species=>species??"dog"}
});
function nodes(tree,all=[]){
 if(Array.isArray(tree)){tree.forEach(child=>nodes(child,all));return all;}
 if(tree&&typeof tree==="object"){all.push(tree);nodes(tree.props?.children,all);}
 return all;
}
function text(tree){
 if(Array.isArray(tree))return tree.map(text).join(" ");
 if(typeof tree==="string"||typeof tree==="number")return String(tree);
 return tree&&typeof tree==="object"?text(tree.props?.children):"";
}
const draft="PQ synthetic retained draft",unsafe="PQ_UNSAFE_BACKEND_PAYLOAD";
function harness({creating=false,submit}={}){
 slots=[];cursor=0;let submits=0,saves=0,cancels=0,submitted,saved;
 const entry={id:"91000000-0000-4000-8000-000000000001",user_id:"91000000-0000-4000-8000-000000000002",pet_profile_id:"91000000-0000-4000-8000-000000000003",category:"general",note:"PQ synthetic original",title:"Synthetic",severity:null,occurred_at:"2026-01-01T12:00:00.000Z",updated_at:"2026-01-01T12:00:00.000Z"};
 const original=structuredClone(entry);
 const props={initialEntry:creating?null:entry,pets:[{id:entry.pet_profile_id,name:"PQ synthetic",species:"dog"}],onSubmit:async input=>{
  submits++;submitted=structuredClone(input);return submit?submit(input):{...entry,...input,note:input.note,updated_at:"2026-01-02T12:00:00.000Z"};
 },onSaved:value=>{saves++;saved=value;},onCancel:()=>cancels++};
 let tree;
 const render=()=>{cursor=0;tree=CareEntryForm(props);return tree;};
 render();
 if(creating){
  const category=nodes(tree).find(node=>node.type==="select"&&nodes(node).some(child=>child.type==="option"&&child.props.value==="general"));
  assert.ok(category);category.props.onChange({target:{value:"general"}});render();
 }
 nodes(tree).find(node=>node.type==="textarea").props.onChange({target:{value:draft}});render();
 return{
  render,tree:()=>tree,visible:()=>text(tree),textarea:()=>nodes(tree).find(node=>node.type==="textarea"),
  submit:()=>tree.props.onSubmit({preventDefault(){}}),
  cancel:()=>nodes(tree).find(node=>node.type==="button"&&text(node).trim()==="Cancel").props.onClick(),
  counts:()=>({submits,saves,cancels}),entry,original,
  submitted:()=>submitted,saved:()=>saved,
  assertPreserved(){assert.equal(this.textarea().props.value,draft);assert.deepEqual(entry,original);assert.equal(submitted.petProfileId,entry.pet_profile_id);}
 };
}
async function reject(error,{creating=false}={}){
 const h=harness({creating,submit:async()=>{throw error;}});
 await h.submit();h.render();
 assert.deepEqual(h.counts(),{submits:1,saves:0,cancels:0});h.assertPreserved();
 assert.doesNotMatch(h.visible(),new RegExp(unsafe));
 assert.doesNotMatch(h.visible(),/saved successfully|Care update saved\./);
 return h;
}
test("classified stale edit shows only fixed copy/reload/reopen guidance and retains draft",async()=>{
 const h=await reject(Object.assign(new Error(conflict.CARE_ENTRY_STALE_MESSAGE),{details:unsafe}));
 assert.match(h.visible(),/changed after you opened/i);
 assert.match(h.visible(),/not saved/i);
 assert.match(h.visible(),/copy.*draft/i);
 assert.match(h.visible(),/reload.*page/i);
 assert.match(h.visible(),/reopen.*latest/i);
 assert.doesNotMatch(h.visible(),/Please try again/);
 h.cancel();assert.deepEqual(h.counts(),{submits:1,saves:0,cancels:1});assert.deepEqual(h.entry,h.original);
});
const unrelated=[
 ["outage",new Error("Synthetic unavailable "+unsafe)],
 ["serialization",Object.assign(new Error("could not serialize access "+unsafe),{code:"40001"})],
 ["raw legacy database conflict",{code:"40001",message:"CARE_ENTRY_STALE",details:unsafe}],
 ["raw PT409 database conflict",{code:"PT409",message:"CARE_ENTRY_STALE",details:unsafe}],
 ["message prefix lookalike",new Error(conflict.CARE_ENTRY_STALE_MESSAGE+" "+unsafe)],
 ["untyped message lookalike",{message:conflict.CARE_ENTRY_STALE_MESSAGE}]
];
for(const[name,error]of unrelated)test(name+" stays generic without raw error leakage or automatic retry",async()=>{
 const h=await reject(error);assert.match(h.visible(),/Furvise could not save this update\. Please try again\./);
 assert.doesNotMatch(h.visible(),/reopen the latest|Copy your draft/i);
 h.cancel();assert.deepEqual(h.counts(),{submits:1,saves:0,cancels:1});
});
test("insert error does not masquerade as a stale saved-note edit",async()=>{
 const h=await reject(new Error(conflict.CARE_ENTRY_STALE_MESSAGE),{creating:true});
 assert.match(h.visible(),/Please try again/);assert.doesNotMatch(h.visible(),/Copy your draft/);
});
test("edit success keeps existing success callback and status",async()=>{
 const h=harness();await h.submit();h.render();
 assert.deepEqual(h.counts(),{submits:1,saves:1,cancels:0});
 assert.equal(h.saved().note,draft);assert.match(h.visible(),/Care update saved\./);
 assert.equal(h.textarea().props.value,draft);assert.deepEqual(h.entry,h.original);
});
test("insert success resets the draft only after the successful save",async()=>{
 const h=harness({creating:true});await h.submit();h.render();
 assert.deepEqual(h.counts(),{submits:1,saves:1,cancels:0});
 assert.equal(h.saved().note,draft);assert.equal(h.textarea().props.value,"");
 assert.match(h.visible(),/Care update added\./);
});
test("pending save disables controls and a fresh rendered submit does not duplicate",async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const h=harness({submit:async input=>{await pending;return{note:input.note};}});
 const first=h.submit();h.render();
 assert.ok(nodes(h.tree()).filter(node=>node.type==="button").every(node=>node.props.disabled));
 await h.submit();assert.equal(h.counts().submits,1);
 finish();await first;h.render();assert.equal(h.counts().saves,1);assert.deepEqual(h.entry,h.original);
});
test("Cancel before Save never invokes the mutation callback",()=>{
 const h=harness();h.cancel();assert.deepEqual(h.counts(),{submits:0,saves:0,cancels:1});assert.deepEqual(h.entry,h.original);
 assert.equal(networkAttempts,0);
});
