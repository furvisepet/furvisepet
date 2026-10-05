"""UNEXECUTED native specification runner; never provisions or migrates a database."""
import argparse,json,pathlib,subprocess,os
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--host',choices=['127.0.0.1','::1'],required=True);p.add_argument('--user',required=True);p.add_argument('--port',type=int,default=5432);p.add_argument('--fixture',type=pathlib.Path,required=True);p.add_argument('--ack-disposable-local',action='store_true');a=p.parse_args()
if not a.ack_disposable_local or not a.database.startswith('furvise_disposable_'):raise SystemExit('Explicit already-authorized disposable local target required')
f=json.loads(a.fixture.read_text(encoding='utf8'));assert f['schema']=='ReplaceSemanticsBinderFixtures.v2' and len(f['actions'])==6 and set(f['deletion'])=={'source','replace','removeSource','remove','lifecycleSource','lifecycle'}
for name,source in [('replace','source'),('remove','removeSource'),('lifecycle','lifecycleSource')]:
 action=f['deletion'][name];src=f['deletion'][source];assert action['sourceMessageId']==src['id'] and action['id'].startswith(src['requestId']+':') and action['petId']==f['subject']['id']
sql=pathlib.Path(__file__).with_name('canonical-conversation-delete-native.sql').read_text(encoding='utf8')
sql+='\n'+pathlib.Path(__file__).with_name('canonical-origin-dependency-native.sql').read_text(encoding='utf8')
script="\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL statement_timeout='30s';\nSET LOCAL lock_timeout='2s';\nSELECT set_config('furvise.test_fixture','"+json.dumps(f,ensure_ascii=False).replace("'","''")+"',true);\n"+sql+"\nROLLBACK;\n"
r=subprocess.run(['psql','-X','--host',a.host,'--port',str(a.port),'--username',a.user,'--dbname',a.database],input=script,text=True,encoding='utf-8',errors='strict',env={**os.environ,'PGCLIENTENCODING':'UTF8'},timeout=120)
raise SystemExit(r.returncode)
