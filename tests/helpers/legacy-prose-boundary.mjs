import assert from 'node:assert/strict';
import {persistPendingSuggestion} from '../../app/lib/intelligence/persist-pending-suggestion.ts';
export async function assertLegacyProseRejected(suggestion,sourceMessage='Uncertified owner text.'){
 let reads=0,writes=0;const supabase={from(){reads++;throw Error('LEGACY_READ_FORBIDDEN')},rpc(){writes++;throw Error('LEGACY_WRITE_FORBIDDEN')}};
 const result=await persistPendingSuggestion({suggestion,sourceMessage,supabase,createCanonicalCareAuthorityClient:()=>supabase});
 assert.deepEqual(result,{careEntryId:null,concernId:null,effectAlreadyPresent:false,errorCode:'CANONICAL_SUGGESTION_REQUIRED',suggestion:null});
 assert.equal(reads,0);assert.equal(writes,0);return result;
}
