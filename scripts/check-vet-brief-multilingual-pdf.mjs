import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {generateVetBriefPdf} from '../app/lib/vet-brief/pdf.ts';
const base=JSON.parse(readFileSync(new URL('../tests/fixtures/vet-brief-rich-publication.json',import.meta.url)));
const output=process.argv[2] || 'output/vet-brief-multilingual';mkdirSync(output,{recursive:true});
for(const [name,text] of [['arabic','سجل الرعاية بتاريخ 2020-02-14 يُظهر كرياتينين 1.0 mg/dL ضمن المجال 0.8–2.4 mg/dL. لا تؤكد الملاحظة إعطاء الدواء. قال المالك إن Mochi تلقى 2.5 mg مرتين يومياً لكن إعطاء الجرعات غير مؤكد.'],['japanese','保存記録では2020-02-14のクレアチニンは1.0 mg/dL、基準範囲は0.8–2.4 mg/dLです。投薬の実施は確認されていません。飼い主の記憶と処方記録は分けて確認してください。']]){
 const doc={...base,reasonForVisit:text,visitSummary:text,concernTimeline:[],relevantCareHistory:[{date:'2020-02-14',category:name,text}],questionsForVeterinarian:[text],missingInformation:[text],medicationsSupplements:[],ownerNotes:text};
 const start=Date.now();const bytes=await generateVetBriefPdf(doc);writeFileSync(`${output}/${name}.pdf`,bytes);console.log(name,bytes.length,Date.now()-start);
}
