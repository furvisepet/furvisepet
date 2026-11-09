/** Authoritative query coverage, independent of model wording. No internal handles. */
export function readCoverageMessages(coverage=[]) {
 return coverage.filter(row=>row.searchRelaxed||row.hasMore||row.hasPrevious||row.truncated).map(row=>{
  const scope=row.scope??{},pet=typeof scope.pet==="string"?scope.pet:"This pet";
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
