import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {fixture,withBrowserTransport} from "./history-note-edit-contract.mjs";

export async function withEditor(fn,seed){
 const f=await fixture();seed?.(f);
 return withBrowserTransport(async(api,calls)=>{
  const priorFetch=globalThis.fetch,priorDocument=globalThis.document;
  let pendingSaves=0;
  let address=new URL("https://fixture.invalid/history"),slots=[],cursor=0,dirty=true,pending=[],tree,marks=0;
  const identities=new Map(),identity=id=>{if(!id)return null;if(!identities.has(id))identities.set(id,{id});return identities.get(id);};
  const events=new Map(),element=(type,props)=>({type,props:props||{}});
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const hooks={
   useState(initial){const i=cursor++;slots[i]??={value:typeof initial==="function"?initial():initial};return[slots[i].value,v=>{const n=typeof v==="function"?v(slots[i].value):v;if(!Object.is(n,slots[i].value)){slots[i].value=n;dirty=true;}}];},
   useRef(initial){const i=cursor++;return(slots[i]??={current:initial});},
   useMemo(make,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:make()};return slots[i].value;},
   useDeferredValue:v=>v,
   useEffect(effect,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const old=slots[i];slots[i]={deps};pending.push(()=>{old?.cleanup?.();slots[i].cleanup=effect();});}}
  };
  globalThis.document={cookie:"",body:{style:{}},activeElement:null};
  Object.assign(globalThis.window,{location:{get search(){return address.search;}},history:{replaceState(_a,_b,url){address=new URL(url,address);}},
   addEventListener:(k,v)=>events.set(k,v),removeEventListener:(k,v)=>{if(events.get(k)===v)events.delete(k);}});
  globalThis.fetch=async(url,options)=>{
   calls.push({url,options});
   assert.equal(options.method,"PATCH");const body=JSON.parse(options.body);
   return f.patch(body,new Headers(options.headers).get("Idempotency-Key"),url.split("/").at(-1));
  };
  const request=createRequire(import.meta.url),ts=request("typescript");
  const source=readFileSync(new URL("../../app/components/history-archive.tsx",import.meta.url),"utf8");
  const stubs={
   react:hooks,"react/jsx-runtime":{jsx:element,jsxs:element,Fragment:"fragment"},
   "next/navigation":{useSearchParams:()=>new URLSearchParams(address.search)},
   "./app-page":{AppPage:({children})=>children},
   "./product-primitives":{LoadingState:()=>null,Notice:({children})=>element("aside",{children}),PageHeader:()=>null},
   "../lib/auth-session":{useRequireConfirmedSupabaseAuth:()=>({status:f.user?"signedIn":"signedOut",user:identity(f.user)})},
   "../lib/care-log.mjs":{CARE_ENTRY_CATEGORIES:["general"],formatCareEntryCategory:x=>x},
   "../lib/history-archive":{formatHistoryTimestamp:()=>"Synthetic date",getHistoryFromInstant:()=>null,HISTORY_PAGE_SIZE:20,isHistoryWhenFilter:()=>true,normalizeHistorySearch:x=>x},
   "../lib/navigation/app-data-freshness":{useAppDataVersion:()=>0,markAppDataChanged:()=>marks++},
   "../lib/petwise":{formatPetDisplayName:x=>x},
   "../lib/supabase":{listHistoryArchivePets:async()=>[],hasAnyHistoryArchiveEntries:async()=>true,queryHistoryArchive:async()=>({entries:f.snapshot().map(r=>({...r,pet_name:"Synthetic pet"})),hasMore:false,nextOffset:2}),removeCareEntryFromHistory:()=>{throw Error("REMOVAL_FORBIDDEN_IN_TEST");},updateCareEntry:async(...args)=>{pendingSaves++;try{return await api.updateCareEntry(...args);}finally{pendingSaves--;}}}
  };
  const compiledModule={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
   {module:compiledModule,exports:compiledModule.exports,require:s=>{assert.ok(s in stubs,"unexpected UI import "+s);return stubs[s];},window:globalThis.window,document:globalThis.document,URLSearchParams,console,Date,Set,Object,Promise,Error,TypeError});
  const expand=n=>Array.isArray(n)?n.map(expand):!n||typeof n!=="object"?n:typeof n.type==="function"?expand(n.type(n.props)):{...n,props:{...n.props,children:expand(n.props.children)}};
  const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==="object"?[n,...nodes(n.props?.children)]:[];
  const text=n=>Array.isArray(n)?n.map(text).join(""):n&&typeof n==="object"?text(n.props?.children):n==null||typeof n==="boolean"?"":String(n);
  const ui={
   f,calls,get marks(){return marks;},get text(){return text(tree);},
   buttons:()=>nodes(tree).filter(n=>n.type==="button"),
   textarea:()=>nodes(tree).find(n=>n.type==="textarea"),
   async settle(){for(let i=0;i<1000;i++){if(dirty){dirty=false;cursor=0;tree=expand(compiledModule.exports.HistoryArchive());}for(const effect of pending.splice(0))effect();await new Promise(pendingSaves ? resolve=>setTimeout(resolve,1) : setImmediate);if(!dirty&&!pending.length&&!pendingSaves)return;}throw Error("component did not settle");},
   async refresh(){dirty=true;await ui.settle();},
   async click(label){const b=ui.buttons().find(n=>text(n)===label);assert.ok(b,"missing button "+label);assert.equal(!!b.props.disabled,false,"disabled button "+label);b.props.onClick({currentTarget:{focus(){}},preventDefault(){}});await ui.settle();},
   async open(){const b=ui.buttons().find(n=>text(n).includes("Synthetic original"));assert.ok(b,"existing row missing");b.props.onClick({currentTarget:{focus(){}}});await ui.settle();},
   async draft(value){assert.ok(ui.textarea());ui.textarea().props.onChange({target:{value}});await ui.settle();},
   async escape(){events.get("keydown")?.({key:"Escape"});await ui.settle();}
  };
  try{await ui.settle();return await fn(ui,f);}
  finally{for(const slot of slots)slot?.cleanup?.();globalThis.fetch=priorFetch;globalThis.document=priorDocument;}
 });
}
