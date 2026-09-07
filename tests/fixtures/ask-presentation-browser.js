// Actual callback outputs; synthetic providers/database, real parser, renderer and Chrome.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AskAnswerText } from '../../app/components/ask-answer-text';
import { buildAskConversationResponse, parseAskConversationResponse } from '../../app/lib/ask.mjs';
import samples from './ask-presentation-snapshots.js';
const errors=[];
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const h=React.createElement;
try {
 const reloaded=samples.map((sample,index)=>{
  const key='ask-presentation-'+index;
  const stored=buildAskConversationResponse(sample.answer);
  localStorage.setItem(key,JSON.stringify(stored));
  const parsed=parseAskConversationResponse(JSON.parse(localStorage.getItem(key)));
  localStorage.removeItem(key);
  if(!parsed || parsed.directAnswer!==sample.answer.summary) throw Error('Serialization changed validated answer '+index);
  return parsed.directAnswer;
 });
 flushSync(()=>createRoot(document.getElementById('root')).render(h('div',null,...reloaded.map((text,index)=>h('article',{'data-case':index,key:index},h(AskAnswerText,{text}))))));
 const first=document.querySelector('[data-case="0"]');
 if((first.textContent.match(/^- /gm)||[]).length!==2) throw Error('Two-point layout lost after reload/render');
 if(first.querySelectorAll('p').length!==2) throw Error('Coverage limitation is not separated from answer');
 if(!first.querySelector('p').className.includes('whitespace-pre-wrap')) throw Error('Line-break preserving production class absent');
 if(!/^1\. /m.test(document.querySelector('[data-case="1"]').textContent)) throw Error('Numbered layout lost');
 if(/^- /m.test(document.querySelector('[data-case="2"]').textContent)) throw Error('Paragraph request still displays bullets');
 if(/never be sick|I saved/.test(document.getElementById('root').textContent)) throw Error('Rejected/removed claim reappeared');
 if(errors.length) throw Error(errors.join('; '));
 window.acceptanceResult={status:'passed',checks:['callback outputs serialized unchanged','local-storage reload','two visible point lines','separate coverage paragraph','production whitespace preservation','numbered layout','paragraph override','rejected and sanitized claims absent'],samples:reloaded.length};
} catch(error) { window.acceptanceResult={status:'failed',error:error.message,errors}; }
