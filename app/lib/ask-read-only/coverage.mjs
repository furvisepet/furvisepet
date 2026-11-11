/** Authoritative query coverage, independent of model wording. No internal handles. */
export function readCoverageMessages(coverage=[]) {
 return coverage.filter(row=>row.unmet?.length||row.discovery||row.searchRelaxed||row.hasMore||row.hasPrevious||row.truncated).map(row=>{
  const scope=row.scope??{},pet=typeof scope.pet==="string"?scope.pet:"This pet";
  if(!Array.isArray(row.discovery)&&row.unmet?.includes("referenced_source_changed_or_missing"))return pet+": A previously referenced source changed or is missing. Ask for a fresh search or clarify which source you mean; its earlier content was not reconstructed.";
  if(Array.isArray(row.discovery)) {
   const window=(label,from,to)=>from||to?" "+label+" "+(from??"earliest")+" to "+(to??"latest"):"";
   const lanes=row.discovery.map(lane=>lane.mode+": "+lane.inspected+(Number.isSafeInteger(lane.total)?" of "+lane.total:"")+" database candidates examined in "+lane.pages+" database page(s)"+(Number.isSafeInteger(lane.attempts)?"; "+lane.attempts+" DB attempts, "+lane.rawRows+" candidate rows delivered, "+lane.reusedPages+" reused pages, "+lane.sharedCandidates+" shared candidates":"")+(lane.exhausted?"; query exhausted":"; more or uninspected candidates may remain"));
   const unmet=row.unmet??[];
   return pet+window("event dates",scope.from,scope.to)+window("recorded dates",scope.recordedFrom,scope.recordedTo)
    +" — "+scope.goal+": "+row.returned+" notes supplied to the answer model from "+row.inspected+" distinct database candidates examined. "+lanes.join(". ")+"."
    +(row.sharedCollection?" Goals in this pet/time scope share one candidate acquisition; any lexical lane uses combined hints instead of separate queries for each goal.":"")
    +(row.omitted?" "+row.omitted+" examined notes omitted by the evidence limits; their text was not supplied to the answer model.":"")
    +(row.omittedEventRange?" Omitted sources have event dates "+row.omittedEventRange.from+" to "+row.omittedEventRange.to+". Ask about that narrower period for another bounded read; it is a fresh search and can repeat boundary-day records.":"")
    +(unmet.includes("prior_source_selection_omitted")?" Only a bounded subset of the earlier result’s sources was retained for this reference.":"")
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
