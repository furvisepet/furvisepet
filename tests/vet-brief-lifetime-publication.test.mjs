import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {generateVetBriefPdf} from '../app/lib/vet-brief/pdf.ts';
import {parseVetBriefContent} from '../app/lib/vet-brief/content.ts';
const document=JSON.parse(readFileSync(new URL('./fixtures/vet-brief-rich-publication.json',import.meta.url),'utf8'));
test('rich publication avoids a coverage-only trailing page with readable unchanged body font',async()=>{
 for(const pageSize of ['letter','a4']){
 const pdf=await PDFDocument.load(await generateVetBriefPdf(document,{pageSize}));
 assert.ok(pdf.getPageCount()<=2,`${pageSize}: ${pdf.getPageCount()} pages`);
 }
});
test('selection contract rejects routine baseline inventories without deleting clinical comparison history',()=>{
 const event={kind:'history',date:'2021-09-09',category:'weight',text:'Body weight 4 kg.',relevance:'requested_comparison',rationale:'Owner requested the five-year measurement comparison.'};
 const raw={content:{reasonForVisit:'Review weight history',visitSummary:'Compare dated body weights; clinic assessment needed.',events:Array.from({length:20},(_,i)=>({...event,date:`${2006+i}-09-09`})),questionsForVeterinarian:['Is the weight change clinically meaningful?'],missingInformation:[]},sourceRecordIds:[],confidence:'low'};
 assert.equal(parseVetBriefContent(raw,document,[],true).document.relevantCareHistory.length,20);
 raw.content.events=[{...event,relevance:'baseline'},{...event,relevance:'baseline'}];assert.equal(parseVetBriefContent(raw,document,[],true),null);
 raw.content.events=[{...event,rationale:''}];assert.equal(parseVetBriefContent(raw,document,[],true),null);
 raw.content.events=[event];raw.content.visitSummary='x'.repeat(601);assert.equal(parseVetBriefContent(raw,document,[],true),null);
});
