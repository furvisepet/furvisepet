import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=rel=>readFileSync(new URL('../'+rel,import.meta.url),'utf8');
const hash=rel=>createHash('sha256').update(readFileSync(new URL('../'+rel,import.meta.url))).digest('hex');
const isolation=read('supabase/migrations/20260923210524_isolate_canonical_ask_sql_inference.sql');
const attributed=read('supabase/migrations/20260927061142_attributed_source_semantics.sql');
const migration=read('supabase/migrations/20261004215000_detach_canonical_dialogue_preserve_origin.sql');
const base=isolation.match(/create function private\.canonical_ask_replace_safe[\s\S]*?\$function\$;/)?.[0];
assert.ok(base);
const decode=s=>s.replaceAll("''", "'");
function replacements(block,initial){
 let result=initial;
 for(const match of block.matchAll(/revised:=replace\((?:definition|revised),'((?:''|[^'])*)',\s*'((?:''|[^'])*)'\);/g)){
  const from=decode(match[1]),to=decode(match[2]);assert.ok(result.includes(from),'source patch anchor must be present');result=result.replaceAll(from,to);
 }
 return result;
}
const attributeBlock=attributed.slice(attributed.indexOf("definition:=pg_get_functiondef('private.canonical_ask_replace_safe"));
const originBlock=migration.slice(migration.indexOf("definition:=pg_get_functiondef('private.canonical_ask_replace_safe"),migration.indexOf("definition:=pg_get_functiondef('private.is_canonical_ask_source"));
const old=replacements(attributeBlock,base).replaceAll('e.intelligence_source_message_id','e.canonical_ask_origin_message_id');
const current=replacements(originBlock,replacements(attributeBlock,base));
const before='d.source_message_lineage_id=e.id or d.source_message_id=';
const after='d.source_message_lineage_id=e.id or d.source_message_lineage_id=e.canonical_ask_origin_message_id or d.source_message_id=';
test('expanded current SQL adds exactly one permanent-origin dependency and changes no other branch',()=>{
 assert.equal(old.split(before).length,2);assert.equal(current,old.replace(before,after));
 assert.match(originBlock,/CANONICAL_ORIGIN_DEPENDENCY_PRECONDITION/);
});
test('the added disjunction stays owner-scoped and inside the unchanged attributed exemption, without status narrowing',()=>{
 const block=current.match(/and not exists\(select 1 from public\.semantic_claims d[\s\S]*?(?=\n    and not exists)/)?.[0];assert.ok(block);
 assert.match(block,/d\.user_id=e\.user_id and not\(d\.governance_metadata \? 'sourceSemanticsPayload'\)/);
 for(const clause of ['d.source_message_lineage_id=e.id','d.source_message_lineage_id=e.canonical_ask_origin_message_id','d.source_message_id=e.canonical_ask_origin_message_id','private.json_references_care_entry(d.governance_metadata,e.id)','private.json_references_care_entry(d.structured_value,e.id)'])assert.ok(block.includes(clause),clause);
 assert.doesNotMatch(block,/knowledge_status|persistence_destination|effective|predicate/);
});
test('previous native deletion/backfill evidence and reviewed History revision transport remain exact reviewed bytes',()=>{
  // Supabase client pin: reviewed JV26fdb090 opened-revision transport on unchanged EH authority; behavioral negatives live in history-note-edit and today-v4 contracts.
 const pins={'tests/sql/canonical-conversation-delete-native.sql':'a4d71a78da28cd904160338c054bc8fe5fd3d1444a5ccb61a5973abc5de7a27d','tests/sql/canonical-dialogue-backfill-capture.sql':'7788a543008e4a88d9b7fd4b03b9142c2eb899f9a5eeffb8f955b84a9a98ecfe','tests/sql/canonical-dialogue-backfill-assert.sql':'1bb2667ea419965db47804c5bbc90b04512e10c7b7247856099ed718078db593','app/lib/intelligence/correction-relevance.ts':'31b852a42f2e888ee16f849b751bc8f0a8b09dae017671f641e2f750060e4bdd','app/lib/supabase.ts':'47ab8726020bfc93fd30a4ef1ea539f772681ba08fe93fea34d635f0217eab5b'};
 for(const [path,digest]of Object.entries(pins))assert.equal(hash(path),digest,path);
});
test('native extension is wired after unchanged original suite and retains real RPC/catalog/executor and rollback assertions',()=>{
 const sql=read('tests/sql/canonical-origin-dependency-native.sql'),runner=read('tests/sql/run-canonical-conversation-delete-native.py');
 assert.ok(runner.indexOf("with_name('canonical-conversation-delete-native.sql')")<runner.indexOf("with_name('canonical-origin-dependency-native.sql')"));
 for(const name of ['persist_governed_semantic_turn_v2','list_ask_replace_targets','execute_ask_action_capability','delete_owned'])assert.ok(sql.includes(name));
 for(const mode of ['origin_effective','origin_unconfirmed','origin_tombstoned','origin_superseded','origin_rejected','origin_forgotten','origin_dismissed','care_lineage','metadata_reference','value_reference','live_source_only','clean_attributed','unrelated_message','foreign_reference'])assert.ok(sql.includes("'"+mode+"'"),mode);
 for(const assertion of ['physical transcript absence','all claim fields/lineage preserved except actual live detach','care generation/snapshot/body immutable across deletion','denied effect preserves all care generations/body/count','denied effect preserves all dependency/stamp fields/count','exact persisted outcome receipt','terminal failed/succeeded replay exact and effect-free'])assert.ok(sql.includes(assertion));
 assert.match(sql,/effect\.action->>'status'='failed'/);assert.match(sql,/effect\.action->>'status'='succeeded'/);
 assert.doesNotMatch(sql,/disable\s+trigger|session_replication_role/i);
});
// These are source-contract checks, not native PostgreSQL execution or proof of
// service-role/RLS enforcement. Native witnesses are independently run after delivery.
