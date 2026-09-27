import {fixtureSemanticsPage} from '../../scripts/audits/helpers/source-semantics-fixture.mjs';
import assert from "node:assert/strict";
import {createEffectiveWindowResolver} from "../../app/lib/intelligence/history-retrieval.ts";
import {eventOrder} from "../../app/lib/furvise-brain/read-selection.ts";
export function calculationEffectiveStore(rows, graph={}, subjects) {
 const pets=subjects.map(p=>p.id);const scope={ownedPetIds:pets,from:"2020-01-01T00:00:00Z",to:"2027-01-01T00:00:00Z"};
  const pages=[], calls=[];
  // SQL-faithful bounded RPC mock. In particular tombstone markers for care
  // roots are returned ONLY for p_care_ids, not for merely linked sources.
  const db={rpc(name,args){if(name==='read_ask_source_semantics')return {abortSignal:async()=>fixtureSemanticsPage([...rows,...(graph.sources||[])],args,graph.sourceSemantics)};assert.equal(name,'read_ask_history_correction_page'); calls.push(args);
    return {abortSignal:async()=>{
      const claims=graph.claims||[], edges=graph.edges||[], links=graph.links||[];
      const seeds=claims.filter(c=>args.p_seed_pet_ids.includes(c.subject_id)
        && ['correct','supersede'].includes(c.operation_type)
        && (!args.p_event_from||c.occurred_at>=args.p_event_from)&&(!args.p_event_to||c.occurred_at<args.p_event_to)
        && edges.some(e=>e.from_claim_id===c.id&&['corrects','supersedes'].includes(e.relation_type)));
      const roots=new Set([...args.p_claim_ids,...seeds.map(c=>c.id),...links.filter(l=>args.p_care_ids.includes(l.legacy_row_id)).map(l=>l.claim_id)]);
      const relations=edges.filter(e=>roots.has(e.from_claim_id)||roots.has(e.to_claim_id));
      const ids=new Set([...roots,...relations.flatMap(e=>[e.from_claim_id,e.to_claim_id])]);
      const lineage=links.filter(l=>ids.has(l.claim_id));
      const sources=new Set([...args.p_care_ids,...lineage.map(l=>l.legacy_row_id)]);
      return {error:null,data:{claims:structuredClone(claims.filter(c=>ids.has(c.id))),relations,lineage,
        sources:[...rows,...(graph.sources||[])].filter(r=>sources.has(r.id)&&!(graph.missing||[]).includes(r.id)),
        withheld_source_ids:(graph.removedSources||[]).filter(id=>args.p_care_ids.includes(id)),
        withheld_claim_ids:(graph.removedClaims||[]).filter(id=>ids.has(id)),
        truncated:!!graph.truncated || (graph.partialPets||[]).some(p=>args.p_seed_pet_ids.includes(p))}};
    }};
  }};
  const coverage={plan:{from:scope.from,to:scope.to,terms:[],interpretation:'period'},candidateIds:[],queryCount:0,
    retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown',continuation:[],reasons:[],
    consistency:'read_committed_no_snapshot',perPet:[],provenance:[],claimSources:[],excludedIds:[]};
  const effectiveWindow=createEffectiveWindowResolver({owned:new Set(scope.ownedPetIds),petIds:pets,userId:'owner',db,coverage,deadline:Date.now()+60000});
  const store={effectiveWindow,effective:async()=>{throw Error('must use correction-aware stream');},
    page:async input=>{pages.push(input);return rows.filter(r=>r.pet_profile_id===input.petId&&!r.deleted_at
      && r.occurred_at>=input.from&&r.occurred_at<input.to).sort((a,b)=>input.ordering==='asc'?eventOrder(a,b):eventOrder(b,a))
      .slice(input.offset,input.offset+input.limit);}};
  return {store,pages,calls,coverage};
}
