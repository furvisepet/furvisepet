// Valid current wire fixtures. Every mocked SDK response is checked against the
// actual request schema before it reaches the real decoder/publication path.
import Ajv from 'ajv';
const ajv=new Ajv({strict:false});
export const clearAssessment=()=>({medicationIntent:'none',referent:'clear',missingContext:[],careContext:'none',eventAssessments:[]});
export function ordinaryTask(saved=false){return {id:'t1',kind:saved?'saved_content':'general_guidance',combineHistory:false,needsHistory:saved,needsOwnerFacts:false,includeSourceDates:false,recordMode:saved?'single':'none',workflow:'none',pets:saved?['p1']:[],reference:null,missing:[]};}
export function selectionFixture({reads=[],draft='',task=ordinaryTask(reads.length>0)}={}){
 return {safety:clearAssessment(),reads,draft,historyIntent:{requested:reads.length>0,timeBasis:'event',pet:reads.length?'p1':null},workflowIntent:'none',taskPlan:[task]};
}
export function answerFixture({text='I can read saved information, but I can’t cancel actions or change records through Ask.',sources=[],quotes=[],replyType='refusal',task=ordinaryTask(sources.length>0)}={}){
 const unavailable=replyType==='refusal';
 return {presentation:{sourceDates:[],contextRequired:false},components:[{kind:unavailable?'limitation':sources.length?'saved':'general',text,sources}],quotes,sources,calculations:[],replyType,
 clinicalReview:{assessment:clearAssessment(),ownerStatementRefs:[],observationFields:[]},appHelp:{intent:'none',pet:null},
 completion:[{task:task.id,status:unavailable?'unresolved':'complete',reason:unavailable?'not_supported':'none',componentIndexes:[0],sources,ownerFacts:[],historyFacts:[],historySynthesis:[]}],
 evidenceCompletion:{sourceReview:{routine:[],noteworthy:[],uncertain:[],irrelevant:[]},missingReference:null}};
}
export function sdkFixture(request,value){
 const validate=ajv.compile(request.text.format.schema);
 if(!validate(value))throw Error('Wire fixture violates current schema: '+JSON.stringify(validate.errors));
 return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}],usage:{input_tokens:100,output_tokens:20}};
}
