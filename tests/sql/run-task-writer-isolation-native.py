"""UNEXECUTED native specification; precondition replay uses rollback subtransactions."""
import argparse,json,pathlib,subprocess,os,hashlib
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--host',required=True,choices=['127.0.0.1','::1']);p.add_argument('--user',required=True);p.add_argument('--port',type=int,default=5432);p.add_argument('--ack-disposable-local',action='store_true');p.add_argument('--expiry',action='store_true');a=p.parse_args()
if not a.ack_disposable_local or not a.database.startswith('furvise_disposable_'):raise SystemExit('Existing explicitly authorized disposable local target required')
here=pathlib.Path(__file__).resolve().parent;root=here.parents[1];fixtures=here.parent/'fixtures/task-writer-isolation';ident=json.loads((fixtures/'identity.json').read_text(encoding='utf8'));rows=[]
for row in ident['functions']:
 before=(fixtures/(row['name']+'-before.sql')).read_bytes();after=(fixtures/(row['name']+'-after.sql')).read_bytes();assert hashlib.sha256(before).hexdigest()==row['beforeSHA256'] and hashlib.sha256(after).hexdigest()==row['afterSHA256'];rows.append({**row,'before':before.decode(),'afterBody':after.decode().split('AS $function$')[1].split('$function$')[0]})
migration=(root/'supabase/migrations/20261004233000_guard_canonical_task_writers.sql').read_text(encoding='utf8')
quote=lambda s:"'"+s.replace("'","''")+"'"
checks="""DO $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id IN('89720000-0000-4000-8000-000000000001','89720000-0000-4000-8000-000000000002')) THEN RAISE EXCEPTION 'ROLLBACK_FIXTURE_NOT_EMPTY';END IF;END $$;"""
sql="\\set ON_ERROR_STOP on\n"+checks+"\nBEGIN;\nSELECT set_config('furvise.task_preimages',"+quote(json.dumps(rows,ensure_ascii=False))+",true);\nSELECT set_config('furvise.task_migration',"+quote(migration)+",true);\n"
sql+=(here/'task-writer-isolation-fixture.sql').read_text(encoding='utf8')+'\n'
if a.expiry:sql+=(here/'task-writer-isolation-expiry.sql').read_text(encoding='utf8')
else:
 sql+=(here/'task-writer-isolation-catalog.sql').read_text(encoding='utf8')+'\n'+(here/'task-writer-isolation-native.sql').read_text(encoding='utf8')
sql+='\nROLLBACK;\n'+checks+"\nSELECT 'TASK_WRITER_ROLLBACK_EMPTY' AS evidence;\n"
r=subprocess.run(['psql','-X','--host',a.host,'--port',str(a.port),'--username',a.user,'--dbname',a.database],input=sql,text=True,encoding='utf-8',errors='strict',env={**os.environ,'PGCLIENTENCODING':'UTF8'},timeout=960 if a.expiry else 180)
raise SystemExit(r.returncode)
