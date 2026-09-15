import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, nextResolve) {
 if (specifier === 'server-only') return {url:'data:text/javascript,export {};',shortCircuit:true};
 return nextResolve(specifier,context);
}});
const { buildUserDataExport } = await import('../../app/lib/operations/user-data-export.ts');
const user = { id: 'owner', email: 'qa@example.invalid', created_at: '2026-09-15' };
function database({ cap=2, failAfterFirst=false, total=5 }={}) {
  return { from(table) {
    let offset=0, end=5000, owner;
    const q = {
      select(){ return q; }, eq(column,value){ assert.equal(column,'user_id'); owner=value; return q; },
      order(){ return q; }, range(start,to){ offset=start; end=to; return q; }, limit(n){end=n-1;return q;},
      then(resolve){
        assert.equal(owner,user.id); 
        const count=table==='pet_care_entries'||table==='ai_usage_events' ? total : 0;
        const rows=Array.from({length:Math.max(0,Math.min(count-offset,cap,end-offset+1))},(_,i)=>({id:String(offset+i),title:'note',secret:'hidden'}));
        resolve({data:rows,count,error:failAfterFirst&&offset>0 ? {message:'page failed'} : null});
      }
    }; return q;
  }};
}
test('exports every owner row even when server caps a response below requested size', async()=>{
 const result=JSON.parse(await buildUserDataExport(database(),user));
 assert.equal(result.careHistory.length,5);
 assert.equal(result.aiUsage.length,5);
 assert.deepEqual(result.careHistory.map(x=>x.id),['0','1','2','3','4']);
 assert.ok(result.careHistory.every(x=>!('secret' in x)));
});
test('does not return a partial export when a later page fails', async()=>{
 await assert.rejects(buildUserDataExport(database({failAfterFirst:true}),user),/EXPORT_QUERY_FAILED/);
});
test('uses exact totals to reject oversized sections despite a capped first response', async()=>{
 await assert.rejects(buildUserDataExport(database({total:5001}),user),/EXPORT_TOO_LARGE/);
});
