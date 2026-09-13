// Mounted production Ask page. Only auth, network and Next routing are fixtures.
import React from 'react';
import { createRoot } from 'react-dom/client';
import AskPage from '../../app/ask/page';
import { buildAskConversationResponse } from '../../app/lib/ask.mjs';
import { getFurviseActionPolicy } from '../../app/lib/application-actions/policy';
const id=n=>'81000000-0000-4000-8000-'+String(n).padStart(12,'0');
const petId=id(1),old=id(41),a=id(42),b=id(43),calls=[],errors=[];
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const action={id:id(60),petId,kind:'pet.mark_deceased',...getFurviseActionPolicy('pet.mark_deceased'),status:'proposed',input:{field:null,value:null,title:null,detail:null,category:null,target:'selected'},evidence:'Milo passed away',explicitIntent:true,label:'Review lifecycle change',description:'Confirm the reported lifecycle change.',href:null,resultMessage:null,errorMessage:null};
const summary=(key,title)=>({id:key,petId,petName:'Milo',title,preview:'Saved conversation',status:'active',lastActivityAt:'2026-09-10T00:00:00Z'});
const answer=(text,actions=[])=>buildAskConversationResponse({title:'Furvise',summary:text,sections:[],safetyNote:null},{applicationActions:actions});
const messages=(n,text,actions=[])=>[{id:id(n),requestId:id(n+100),role:'user',text:'An update',createdAt:'2026-09-10'}, {id:id(n+1),role:'furvise',response:answer(text,actions),saveMetadata:null,contextUsed:null,createdAt:'2026-09-10'}];
let hold=false;const pending={};
window.fixture={profile:{id:petId,name:'Milo',species:'dog',lifecycle_status:'active',age_value:4,age_unit:'years',memories:[]},calls};
window.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);const method=init.method||'GET';calls.push({path:url.pathname,query:url.search,method,body:init.body});
 if(url.pathname==='/api/ask'&&method==='GET')return Response.json({usage:{remaining:10,limit:15,planId:'free',resetAt:'2026-10-01'}});
 if(url.pathname==='/api/ask/conversations')return Response.json(url.searchParams.has('after')?{conversations:[summary(old,'Old saved chat')],nextCursor:null}:{conversations:[summary(a,'A chat'),summary(b,'B chat')],nextCursor:'second-page'});
 if(url.pathname.startsWith('/api/ask/actions/')){
  const body=JSON.parse(init.body);if(body.decision!=='cancel')throw Error('Unexpected confirmation');
  localStorage.setItem('ask20-cancelled','true');return Response.json({action:{...action,status:'cancelled'},changed:false});
 }
 if(url.pathname.startsWith('/api/ask/conversations/')){
  const key=url.pathname.split('/').at(-1);
  const detail=key===old?{...summary(old,'Old saved chat'),messages:url.searchParams.has('before')?messages(2,'Earlier note: 2.7 kg, not 3 kg.') :messages(4,'The note says test_A >1.5, not normal. <script>not executable</script>',[{...action,status:localStorage.getItem('ask20-cancelled')?'cancelled':'proposed'}]),olderMessagesCursor:url.searchParams.has('before')?null:4}:{...summary(key,key===a?'A chat':'B chat'),messages:messages(key===a?10:20,key===a?'A answer':'B answer'),olderMessagesCursor:null};
  if(hold&&(key===a||key===b))return new Promise(resolve=>pending[key]=()=>resolve(Response.json({conversation:detail})));
  return Response.json({conversation:detail});
 }
 throw Error('Unexpected fixture request '+method+' '+url.pathname);
};
history.replaceState({},'',`/ask?conversation=${old}`);
createRoot(document.getElementById('root')).render(React.createElement(AskPage));
const pause=()=>new Promise(r=>setTimeout(r,20));
async function until(predicate,label){for(let i=0;i<200;i++){if(predicate())return;await pause();}throw Error('Timed out: '+label);}
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const click=label=>{const b=button(label);if(!b)throw Error('Missing button '+label);b.click();};
(async()=>{
 await until(()=>document.body.textContent.includes('test_A >1.5'),'old deep link');
 if(!calls.some(c=>c.path.endsWith(old)))throw Error('Older direct link was not loaded');
 if(document.querySelector('#root script'))throw Error('Untrusted HTML executed');
 if(sessionStorage.getItem('ask20-phase')==='reload'){
  await pause();if(button('Review action'))throw Error('Cancelled action revived after reload');
  window.acceptanceResult={status:'passed',phase:'reload',checks:['deep link outside latest page','durable cancellation survives browser reload','source text remains escaped'],errors};return;
 }
 click('Review action');await until(()=>button('Cancel'),'confirm step');click('Cancel');
 await until(()=>calls.some(c=>c.path.startsWith('/api/ask/actions/'))&&!button('Review action'),'cancelled action');
 if(calls.filter(c=>c.path.startsWith('/api/ask/actions/')).length!==1)throw Error('Repeated action request');
 click('Load earlier messages');await until(()=>document.body.textContent.includes('Earlier note: 2.7 kg'),'earlier messages');
 if(button('Load earlier messages'))throw Error('Completed message pager remains');
 click('Conversations');await until(()=>button('Load older conversations'),'history pager');click('Load older conversations');await until(()=>document.body.textContent.includes('Old saved chat'),'older history');
 hold=true;
 const historyButton=prefix=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(prefix));
 historyButton('A chat').click();await until(()=>pending[a],'A pending');historyButton('B chat').click();await until(()=>pending[b],'B pending');
 pending[b]();await until(()=>document.body.textContent.includes('B answer'),'B shown');pending[a]();await pause();await pause();
 if(document.body.textContent.includes('A answer'))throw Error('Stale A overwrote B');
 if(errors.length)throw Error(errors.join('; '));
 sessionStorage.setItem('ask20-phase','reload');
 window.acceptanceResult={status:'passed',phase:'interactive',checks:['real Ask page mounted','older deep link','Cancel sends one request','earlier messages prepend','history pagination','last selection wins','HTML escaped'],errors};
})().catch(e=>window.acceptanceResult={status:'failed',error:e.message,errors});
