// Real production response parser + React answer renderer; synthetic local data.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AskAnswerText } from '../../app/components/ask-answer-text';
import { buildAskConversationResponse, parseAskConversationResponse } from '../../app/lib/ask.mjs';
const h = React.createElement;
const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const quote = 'Milo weighed 2.7 kg; test_A #2 was >1.5, not normal. <script>alert(1)</script>';
const summary = `Milo had soft stool for two days in February 2011.\n\nThe 2014-07-09 note reports: ${quote}\n\nSome saved records couldn't be loaded. This covers only the notes I could check.`;
try {
  const saved = buildAskConversationResponse({ title: 'Furvise', summary, sections: [], safetyNote: null });
  localStorage.setItem('ask-synthetic-reload', JSON.stringify(saved));
  const reloaded = parseAskConversationResponse(JSON.parse(localStorage.getItem('ask-synthetic-reload')));
  if (!reloaded || !reloaded.directAnswer.includes(quote)) throw Error('Source report changed during serialization/reload');
  flushSync(() => createRoot(document.getElementById('root')).render(h(AskAnswerText, { text: reloaded.directAnswer })));
  const paragraphs = [...document.querySelectorAll('#root p')];
  if (paragraphs.length !== 3) throw Error('Expected three connected answer paragraphs');
  if (!paragraphs[1].textContent.includes(quote)) throw Error('Exact facts and punctuation not rendered');
  if (document.querySelector('#root script')) throw Error('Source text interpreted as executable HTML');
  if (document.querySelectorAll('#root h1,#root h2,#root h3').length) throw Error('Unnecessary heading');
  if (errors.length) throw Error(errors.join('; '));
  window.acceptanceResult = { status: 'passed', checks: ['production response serialization', 'local-storage reload', 'three answer paragraphs', 'exact 2.7 kg, test_A #2, >1.5 and negation', 'literal untrusted HTML', 'no mandatory summary heading'], text: document.getElementById('root').innerText };
  localStorage.removeItem('ask-synthetic-reload');
} catch (error) { window.acceptanceResult = { status: 'failed', error: error.message, errors }; }
