import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {formatHistoryPeriod} from '../app/lib/furvise-output.ts';
const source=fs.readFileSync(new URL('../app/components/ask-answer-text.tsx',import.meta.url),'utf8');
let js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
for(const [from,to] of [['react/jsx-runtime',import.meta.resolve('react/jsx-runtime')],['../lib/furvise-output',new URL('../app/lib/furvise-output.ts',import.meta.url).href]])js=js.replaceAll(JSON.stringify(from),JSON.stringify(to));
const {AskAnswerText}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('rendered code preserves indentation and escapes executable-looking input',()=>{
 const text='A finite loop:\n\n```python\nwhile True:\n    print("hello")\n    break\n```\n\n```html\n<script>alert(1)</script>\n```';
 const html=renderToStaticMarkup(React.createElement(AskAnswerText,{text}));
 assert.match(html,/<pre[^>]*><code>while True:\n    print\(&quot;hello&quot;\)\n    break<\/code><\/pre>/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
});
test('inline code containing quotes remains one complete code element',()=>{
 const html=renderToStaticMarkup(React.createElement(AskAnswerText,{text:'Run `print("hello")` once.'}));
 assert.match(html,/<code[^>]*>print\(&quot;hello&quot;\)<\/code>/);
});
test('an introductory line does not turn the following bullets into a paragraph',()=>{
 const html=renderToStaticMarkup(React.createElement(AskAnswerText,{text:'Supported:\n- Read saved notes.\n- Prepare a brief.\n\nLimits:\n- No other-account access.'}));
 assert.equal((html.match(/<ul\b/g)||[]).length,2);
 assert.equal((html.match(/<li\b/g)||[]).length,3);
 for(const text of ['Supported:','Read saved notes.','Prepare a brief.','Limits:','No other-account access.']) assert.ok(html.includes(text));
});
test('calendar window presentation preserves exclusive bounds including leap days',()=>{
 assert.equal(formatHistoryPeriod('2024-01-01','2025-01-01'),' for 2024');
 assert.equal(formatHistoryPeriod('2024-02-01','2024-03-01'),' from 2024-02-01 through 2024-02-29');
 assert.equal(formatHistoryPeriod('2024-02-01T12:00:00Z','2024-02-02T12:00:00Z'),' from 2024-02-01T12:00:00Z until (but not including) 2024-02-02T12:00:00Z');
});
