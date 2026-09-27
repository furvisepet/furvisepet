import {readFileSync} from 'node:fs';
import {sourceSemanticsSnapshot,sourceSemanticsDigest} from '../../../app/lib/intelligence/correction-relevance.ts';
const reviewed=JSON.parse(readFileSync(new URL('./reviewed-source-semantics.json',import.meta.url),'utf8'));
/** Fixture-authored persisted migration output. Never examines question or note wording. */
export function fixtureSourceSemantics(row, override){
 const target=reviewed.targets[row.id];
 const semantics=override??(target?{classification:'attributed_correction',target}:{classification:'observation',target:null});
 const payload=JSON.stringify({version:'source-semantics.v1',source:sourceSemanticsSnapshot(row),...semantics});
 return {id:'source-semantics:'+row.id,user_id:row.user_id,subject_type:'pet',subject_id:row.pet_profile_id,
  source_message_lineage_id:row.id,source_type:'legacy_import',claim_kind:'assertion',operation_type:'assert',knowledge_status:'unconfirmed',
  modality:'reported',persistence_destination:'none',turn_payload_hash:sourceSemanticsDigest(payload),
  governance_metadata:{sourceSemanticsPayload:payload}};
}

/** Explicit test import: caller-provided rows are reviewed observations unless separately annotated. */
export function fixtureSemanticsPage(rows,args,semantics={}){
 const owned=rows.filter(r=>args.p_pet_ids.includes(r.pet_profile_id)&&!r.deleted_at);
 const all=owned.map(r=>fixtureSourceSemantics(r,semantics[r.id]));
 const claims=all.filter(c=>args.p_source_ids.includes(c.source_message_lineage_id)||JSON.parse(c.governance_metadata.sourceSemanticsPayload).classification!=='observation');
 return {error:null,data:{complete:claims.length<=76,limit:76,claims,
  sources:owned.filter(r=>claims.some(c=>c.source_message_lineage_id===r.id))}};
}
