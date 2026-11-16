/** Describe exact scope and re-read source instants; never infer the dates of
 * omitted bodies from absent data or treat a retained subset as a new search. */
export function retainedSelectionDescription(row){
 const scope=row.scope??{},axis=scope.orderBy==="recorded"?"recorded":"event";
 const from=axis==="event"?scope.from:scope.recordedFrom,to=axis==="event"?scope.to:scope.recordedTo;
 const dates=[...new Set((row.sourceInstants??row.sources??[]).map(s=>s[axis==="event"?"eventAt":"recordedAt"]).filter(v=>typeof v==="string"))].sort();
 return "Original reference scope: "+axis+" dates "+(from??"earliest")+" to "+(to??"latest")+". Re-read original "+axis+" instants: "+(dates.join(", ")||(row.returned>0?"not included in this coverage metadata":"none"))+". Other original bodies within that scope were not re-read; their individual dates and contents are not established by this retained selection.";
}
/** Authoritative query coverage, independent of model wording. No internal handles. */
export function readCoverageMessages(coverage=[]) {
 return coverage.filter(row=>row.scope?.compositionOnly||row.unmet?.length||row.discovery||row.searchRelaxed||row.hasMore||row.hasPrevious||row.truncated).map(row=>{
  const scope=row.scope??{},pet=typeof scope.pet==="string"?scope.pet:"This pet";
  if(scope.compositionOnly){
   if(row.unmet?.includes("referenced_source_changed_or_missing"))return pet+": The referenced historical note changed or is missing; its earlier content was not reconstructed.";
   if(row.returned>0&&scope.literalQuoted===true&&!row.unmet?.includes("no_selected_support"))return pet+": "+row.returned+" saved note re-read for a verified original quotation. Its fresh text was not supplied to the answer model. This rechecks the selected note, not the whole earlier collection.";
   return pet+": The requested historical note could not be included as a complete verified quotation within this brief. No fresh note text was supplied to the answer model.";
  }
  if(!Array.isArray(row.discovery)&&row.unmet?.includes("referenced_source_changed_or_missing"))return pet+": A previously referenced source changed or is missing. Ask for a fresh search or clarify which source you mean; its earlier content was not reconstructed.";
  if(Array.isArray(row.discovery)) {
   const window=(label,from,to)=>from||to?" "+label+" "+(from??"earliest")+" to "+(to??"latest"):"";
   const lanes=row.discovery.map(lane=>lane.mode+": "+lane.inspected+(Number.isSafeInteger(lane.total)?" of "+lane.total:"")+" database candidates examined in "+lane.pages+" database page(s)"+(Number.isSafeInteger(lane.attempts)?"; "+lane.attempts+" DB attempts, "+lane.rawRows+" candidate rows delivered, "+lane.reusedPages+" reused pages, "+lane.sharedCandidates+" shared candidates":"")+(lane.exhausted?"; query exhausted":"; more or uninspected candidates may remain"));
   const unmet=row.unmet??[];
   const remaining=row.omittedRange??(row.omittedEventRange?{axis:"event",...row.omittedEventRange}:null);
   return pet+window("event dates",scope.from,scope.to)+window("recorded dates",scope.recordedFrom,scope.recordedTo)
    +": "+scope.goal+": "+row.returned+" notes supplied to the answer model from "+row.inspected+" distinct database candidates examined. "+lanes.join(". ")+"."
    +(row.continuationValidation?" Continuation anchors: "+(row.continuationValidation.valid?"verified":"unavailable or changed")+"; "+row.continuationValidation.attempts+" validation DB attempts, "+row.continuationValidation.rows+" rows checked within the shared acquisition budget.":"")
    +(row.sharedCollection?" Goals in this pet/time scope share one candidate acquisition; any lexical lane uses combined hints instead of separate queries for each goal.":"")
    +(row.omitted?" "+row.omitted+" examined notes omitted by the evidence limits; their text was not supplied to the answer model.":"")
    +(remaining?" Omitted sources have "+remaining.axis+" dates "+remaining.from+" to "+remaining.to+". Ask about that narrower period for another bounded read; it is a fresh search and can repeat boundary-day records.":"")
    +(unmet.includes("prior_source_selection_omitted")?" Only a bounded subset of the earlier result’s sources was retained for this reference. "+retainedSelectionDescription(row):"")
    +(unmet.includes("referenced_source_changed_or_missing")?" A previously referenced source changed or is missing. Clarify the source or request a fresh search; its earlier content was not reconstructed.":"")
    +(unmet.includes("retrieval_unavailable")?" Part of this retrieval was unavailable.":"")
    +(unmet.includes("no_selected_support")?" The answer did not select supporting evidence for this goal.":"")
    +(row.hasPrevious?" Results before the requested offset were not inspected.":"")
    +(row.truncated?" Some evidence or measurements could not fit within this reply’s limits.":"")
    +(unmet.length?" This goal has a partial evidence view.":" All examined notes for this query were supplied.")
    +" Query exhaustion does not establish semantic completeness or prove every related record was found. Saved notes describe historical reports, not verified current or corrected facts.";
  }
  const window=scope.from||scope.to?" ("+(scope.from??"earliest")+" to "+(scope.to??"latest")+")":"";
  const count=Number.isSafeInteger(row.total)&&row.total>=0?" of "+row.total:"";
  const partial=row.hasMore||row.hasPrevious||row.truncated;
  return pet+window+": "+row.returned+count
   +(row.searchRelaxed?" broader saved notes returned. The literal search returned no notes; these candidates came from a broader search within the same pet and date range.":" matching notes returned for this search.")
   +(row.hasPrevious?" Results before this page were not inspected.":"")
   +(row.hasMore?(row.searchRelaxed?" More candidate notes remain.":" More matching notes remain."):"")
   +(row.truncated?" Some notes could not be included within this reply's limits.":"")
   +(partial?" This is a partial view.":"");
 });
}
