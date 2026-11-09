/** Authoritative query coverage, independent of model wording. No internal handles. */
export function readCoverageMessages(coverage=[]) {
 return coverage.filter(row=>row.hasMore||row.hasPrevious||row.truncated).map(row=>{
  const scope=row.scope??{},pet=typeof scope.pet==="string"?scope.pet:"This pet";
  const window=scope.from||scope.to?" ("+(scope.from??"earliest")+" to "+(scope.to??"latest")+")":"";
  const count=Number.isSafeInteger(row.total)&&row.total>=0?" of "+row.total:"";
  return pet+window+": "+row.returned+count+" matching notes returned for this search."
   +(row.hasPrevious?" Results before this page were not inspected.":"")
   +(row.hasMore?" More matching notes remain.":"")
   +(row.truncated?" Some notes could not be included within this reply's limits.":"")
   +" This is a partial view.";
 });
}
