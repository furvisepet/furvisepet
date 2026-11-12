/** The question's filter meaning is authoritative; display/order are separate.
 * Validate the original tool arguments before calling this normalizer.
 * Never move a date from one axis to another or alter source timestamps.
 */
export function normalizeReadTemporalScope(name,args,timeBasis){
 if(name!=="search_saved_records"||!["event","recorded"].includes(timeBasis))return {args,removedAxis:null};
 const event=args.from!==null||args.to!==null,recorded=args.recordedFrom!==null||args.recordedTo!==null;
 const primary=timeBasis==="event"?event:recorded,secondary=timeBasis==="event"?recorded:event;
 if(!primary&&secondary){
  const error=new Error("ASK_READ_TEMPORAL_CONTRACT");error.code="ASK_READ_TEMPORAL_CONTRACT";
  error.answerDiagnostic={category:"temporal_scope",field:"primary_axis_missing"};throw error;
 }
 if(!primary||!secondary)return {args,removedAxis:null};
 return timeBasis==="recorded"
  ?{args:{...args,from:null,to:null},removedAxis:"event"}
  :{args:{...args,recordedFrom:null,recordedTo:null},removedAxis:"recorded"};
}
