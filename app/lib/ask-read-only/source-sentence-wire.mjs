/** Provider-only sentence selectors. Canonical evidence still contains exact original
 * wording and passes the existing owner/source/task/clinical validators. */
const keys=(v,k)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const parts=body=>[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(body)].map(p=>p.segment);
const enabled=input=>!!input.schema?.properties?.completion?.items?.properties?.historyFacts;
function fail(){throw Object.assign(new Error("ASK_READ_COMPONENT_CONTRACT"),{code:"ASK_READ_COMPONENT_CONTRACT",answerDiagnostic:{category:"provider_output",field:"fact_reference"}});}
export const SOURCE_SENTENCE_INSTRUCTIONS="For historyFacts and historySynthesis.evidence select source plus firstSentence and lastSentence (inclusive, 1-based indexes in that source's sentences array). Select only contiguous complete original sentences totaling at most 280 characters after trimming. Do not retype excerpts. The server restores exact source wording. Do not duplicate history facts in ordinary component prose; collection prose is not historical evidence. Use at most three concise themes with one representative sentence each unless a meaningful contrast needs a second. Never drop negation or conditional wording.";
export function prepareSourceSentenceWire(input){
 if(!enabled(input))return {schema:input.schema,catalog:input.SOURCE_CATALOG,instructions:""};
 const schema=structuredClone(input.schema);
 const rewrite=node=>{
  if(!node||typeof node!=="object")return;
  if(node.type==="object"&&keys(node.properties,["source","excerpt"])){
   const source=node.properties.source;
   node.properties={source,firstSentence:{type:"integer",minimum:1,maximum:4096},lastSentence:{type:"integer",minimum:1,maximum:4096}};
   node.required=["source","firstSentence","lastSentence"];return;
  }
  for(const value of Object.values(node))if(value&&typeof value==="object")for(const child of Array.isArray(value)?value:[value])rewrite(child);
 };
 // Only these historical evidence leaves are projected; clinical/owner facts,
 // citations, source review, calculations and all other schema fields are intact.
 const completion=schema.properties.completion.items.properties;
 rewrite(completion.historyFacts);rewrite(completion.historySynthesis);
 const catalog=(input.SOURCE_CATALOG??[]).map(s=>{
  if(s.kind!=="history"||typeof s.body!=="string")return s;
  const {body,...rest}=s;return {...rest,sentences:parts(body)};
 });
 return {schema,catalog,instructions:SOURCE_SENTENCE_INSTRUCTIONS};
}
export function decodeSourceSentenceWire(value,input){
 if(!enabled(input))return value;
 const out=structuredClone(value),catalog=input.SOURCE_CATALOG??[];
 const decode=e=>{
  if(!keys(e,["source","firstSentence","lastSentence"]))fail();
  const matches=catalog.filter(s=>s.source===e.source&&s.kind==="history"&&typeof s.body==="string");
  if(matches.length!==1||!Number.isSafeInteger(e.firstSentence)||!Number.isSafeInteger(e.lastSentence))fail();
  const sentences=parts(matches[0].body);
  if(e.firstSentence<1||e.lastSentence<e.firstSentence||e.lastSentence>sentences.length)fail();
  const excerpt=sentences.slice(e.firstSentence-1,e.lastSentence).join("").trim();
  if(!excerpt||excerpt.length>280)fail();
  return {source:e.source,excerpt};
 };
 if(!Array.isArray(out?.completion))fail();
 for(const task of out.completion){
  if(!Array.isArray(task.historyFacts)||!Array.isArray(task.historySynthesis))fail();
  task.historyFacts=task.historyFacts.map(decode);
  for(const theme of task.historySynthesis){
   if(!Array.isArray(theme.evidence))fail();
   theme.evidence=theme.evidence.map(decode);
  }
 }
 return out;
}
