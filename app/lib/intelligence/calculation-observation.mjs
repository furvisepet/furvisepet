import {captureHistoryPublication} from './ask-preview-capture.mjs';
import {calculationStatusEvidence} from './ask-preview-semantic.mjs';
export function observeCalculation(step,reason,plan,gates={},supported){
 if(process.env.VERCEL_ENV!=='preview')return;
 try{
 const operands=(Array.isArray(plan?.calculations)?plan.calculations:[]).slice(0,32).flatMap(c=>(Array.isArray(c?.operands)?c.operands:[]).slice(0,64)).slice(0,64).map(o=>({
  domain:o?.kind==='recorded'?'recorded':o?.kind==='premise'?'premise':o?.kind==='result'?'result':'factual_read',
  sourceKind:o?.source==='anchor'?'anchor':o?.kind==='result'?'result':o?.kind==='premise'?'premise':o&&Object.hasOwn(o,'clause')&&Object.hasOwn(o,'item')?'selected':'unknown',
  role:o?.role
 }));
 captureHistoryPublication(calculationStatusEvidence({step,reason,operands,gates,supported}));
 }catch{captureHistoryPublication({phase:'calculation_status',step:'unknown',reason:'unknown',gates:{},operands:[]});}
}
export function calculationErrorReason(error){
 const message=error instanceof Error?error.message:'';
 if(error instanceof Error&&['StageDeadlineError','AbortError'].includes(error.name))return 'deadline_cancelled';
 const codes={'recorded_source_missing':'selected_source_unavailable','recorded_measurement_ambiguous':'numeric_ambiguous','RECORDED_SOURCE_UNAVAILABLE':'source_reader_unavailable'};
 if(Object.hasOwn(codes,message))return codes[message];
 const prefix='RECORDED_NUMERIC_PREMISE_INVALID:';
 if(!message.startsWith(prefix))return 'unknown';
 const reasons={anchor_source:'anchor_unavailable',selected_report:'selected_source_unavailable',selected_source:'selected_source_unavailable',source_reader:'source_reader_unavailable',source_scope:'source_scope_denied',scope:'source_scope_denied',
  stale_or_changed:'source_changed',read_changed:'source_changed',source_snapshot:'source_changed',anchor_snapshot_changed:'source_changed',source_version:'source_changed',labs_snapshot:'source_changed',
  span:'numeric_ineligible',measurement:'numeric_ineligible',unit:'numeric_ineligible',dimension:'numeric_ineligible',proof:'proof_invalid',request:'proof_invalid',report_authority:'proof_invalid',source_predicates:'numeric_ineligible'};
 return Object.hasOwn(reasons,message.slice(prefix.length))?reasons[message.slice(prefix.length)]:'unknown';
}
