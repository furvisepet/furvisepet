"""UNEXECUTED isolated test runner. Does not provision or migrate a database."""
import argparse,json,pathlib,subprocess,os
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--host',choices=['127.0.0.1','::1'],required=True);p.add_argument('--user',required=True);p.add_argument('--port',type=int,default=5432);p.add_argument('--fixture',type=pathlib.Path,required=True);p.add_argument('--ack-disposable-local',action='store_true');a=p.parse_args()
if not a.ack_disposable_local or not a.database.startswith('furvise_disposable_'):raise SystemExit('Explicit disposable local target required')
f=json.loads(a.fixture.read_text(encoding='utf8'));assert f['schema']=='ReplaceSemanticsBinderFixtures.v2' and len(f['actions'])==6
sql=pathlib.Path(__file__).with_name('replace-semantics-native.sql').read_text(encoding='utf8')
vectors=json.loads(pathlib.Path(__file__).parents[1].joinpath('fixtures/write-semantics-parity.json').read_text(encoding='utf8'));assert vectors['schema']=='WriteSemanticsParityVectors.v1'
script="\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL statement_timeout='30s';\nSET LOCAL lock_timeout='2s';\nSELECT set_config('furvise.test_fixture','"+json.dumps(f).replace("'","''")+"',true);\n"+"SELECT set_config('furvise.test_semantics_vectors','"+json.dumps(vectors,ensure_ascii=False).replace("'","''")+"',true);\n"+sql+"\nROLLBACK;\n"
# No connection string, password, private environment-file read, service start,
# install, migration application or remote host discovery is performed.
r=subprocess.run(['psql','-X','--host',a.host,'--port',str(a.port),'--username',a.user,'--dbname',a.database],input=script,text=True,encoding='utf-8',errors='strict',env={**os.environ,'PGCLIENTENCODING':'UTF8'},timeout=120)
raise SystemExit(r.returncode)
