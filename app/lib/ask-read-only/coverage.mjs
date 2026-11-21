/** Human-facing limits only. Query accounting stays in server result metadata. */
export function readCoverageMessages(coverage=[]) {
 return [...new Set(coverage.flatMap(row=>{
  const pet=typeof row.scope?.pet==="string"?row.scope.pet:"This pet";
  const unmet=Array.isArray(row.unmet)?row.unmet:[];
  if(unmet.includes("referenced_source_changed_or_missing"))
   return [pet+": An earlier saved note changed or is no longer available. Ask me to search for it again."];
  if(unmet.includes("retrieval_unavailable"))
   return [pet+": Some saved notes could not be checked right now. Please try again."];
  if(unmet.includes("no_selected_support"))
   return [pet+": I couldn't confirm this part from the saved notes I reviewed."];
  if(row.requestedEvidenceSatisfied===true)return [];
  if(row.omitted||row.hasMore||row.hasPrevious||row.truncated||unmet.length)
   return [pet+": This answer covers only part of the matching saved history. Ask about a shorter period for a closer look."];
  if(row.searchRelaxed)
   return [pet+": I didn't find an exact match, so I included related saved notes from the same pet and period."];
  return [];
 }))];
}
