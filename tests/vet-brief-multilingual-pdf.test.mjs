import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {generateVetBriefPdf} from '../app/lib/vet-brief/pdf.ts';
import {briefTextDirection,briefTextRuns} from '../app/lib/vet-brief/text-direction.ts';
const base=JSON.parse(readFileSync(new URL('./fixtures/vet-brief-rich-publication.json',import.meta.url)));
const cases=[
 ['Arabic','سجل الرعاية بتاريخ 2020-02-14 يُظهر كرياتينين 1.0 mg/dL ضمن المجال 0.8–2.4 mg/dL. لا تؤكد الملاحظة إعطاء الدواء.'],
 ['Japanese','保存記録では2020-02-14のクレアチニンは1.0 mg/dL、基準範囲は0.8–2.4 mg/dLです。投薬の実施は確認されていません。'],
];
test('Arabic direction follows the prose and keeps dates, ranges, doses and units in intact LTR runs',()=>{
 const text='Mochi 2018–2026: '+cases[0][1];assert.equal(briefTextDirection(text),'rtl');
 const runs=briefTextRuns(text);assert.equal(runs.map(r=>r.text).join(''),text);
 for(const expected of ['2018–2026','2020-02-14','1.0 mg/dL','0.8–2.4 mg/dL'])assert.ok(runs.some(r=>r.isolate&&r.text===expected),expected);
 assert.equal(briefTextDirection(cases[1][1]),'ltr');
});
for(const [language,text] of cases)test(`${language} exports an embedded, searchable PDF on Letter and A4`,async()=>{
 for(const pageSize of ['letter','a4']){
  const doc={...base,visitSummary:text};const bytes=await generateVetBriefPdf(doc,{pageSize});const pdf=await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount()<=2);assert.equal(Math.round(pdf.getPage(0).getWidth()),pageSize==='letter'?612:595);
  const content=pdf.context.enumerateIndirectObjects().filter(([,v])=>v instanceof PDFRawStream).map(([,v])=>{try{return Buffer.from(decodePDFRawStream(v).decode()).toString('latin1');}catch{return '';}}).join('\n');
  assert.match(content,/\/ActualText <FEFF/);assert.doesNotMatch(content,/ NaN | Infinity /);
 }
});

test('PDF embeds actual complete font outlines, not only valid extraction mappings',async()=>{
 const pdf=await PDFDocument.load(await generateVetBriefPdf({...base,visitSummary:cases[0][1]}));
 const regular=readFileSync(new URL('../public/fonts/Inter-Regular.ttf',import.meta.url));
 const fonts=pdf.context.enumerateIndirectObjects().filter(([,v])=>v instanceof PDFRawStream).map(([,v])=>{try{return Buffer.from(decodePDFRawStream(v).decode());}catch{return Buffer.alloc(0);}});
 // This fails for the formerly used subset encoder, whose PDFs extracted the
 // right text but displayed missing outlines in both Poppler and browsers.
 assert.ok(fonts.some(bytes=>bytes.equals(regular)),'complete Latin font program is embedded');
 const sfnt=fonts.filter(bytes=>bytes.length>12&&bytes.readUInt32BE(0)===0x00010000);
 assert.ok(sfnt.length>=3,'Latin and Arabic full font programs are embedded');
 for(const bytes of sfnt){let sum=0;for(let i=0;i<bytes.length;i+=4){const word=Buffer.alloc(4);bytes.copy(word,0,i,Math.min(i+4,bytes.length));sum=(sum+word.readUInt32BE(0))>>>0;}assert.equal(sum,0xb1b0afba,'sfnt table/header checksum is valid');}
});
