"""Loopback PostgREST verification in the authorized disposable container only."""
import subprocess, secrets, json, base64, hmac, hashlib, time
C = "furvise-stage2-db-2788f0b"
A = "71000000-0000-4000-8000-000000000001"
P = "71000000-0000-4000-8000-000000000011"
S = "71000000-0000-4000-8000-000000000021"
ROLE = "furvise_http_probe"
def run(args, data=None):
    r = subprocess.run(args, input=data.encode() if data is not None else None, capture_output=True, timeout=20)
    if r.returncode: raise RuntimeError("Probe command failed: " + r.stderr.decode(errors="replace")[:500])
    return r.stdout.decode().strip()
def sql(q):
    return run(["docker","exec","-i",C,"psql","-U","postgres","-d","stage2_validation","-X","-At","-v","ON_ERROR_STOP=1"], q)
def put(path, text):
    run(["docker","exec","-i",C,"sh","-c","umask 077; cat > " + path],text)
assert sql(f"select count(*) from auth.users where id='{A}'") == "0"
assert sql(f"select count(*) from pg_roles where rolname='{ROLE}'") == "0"
password, secret = secrets.token_hex(24), secrets.token_hex(32)
server = None
try:
    sql(f"create role {ROLE} login noinherit password '{password}'; grant anon,authenticated,service_role to {ROLE};")
    sql(f"insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values ('{A}','authenticated','authenticated','http-probe@example.test','',now(),now()); insert into public.dog_profiles(id,user_id,name,species) values ('{P}','{A}','Maple','dog'); insert into public.ai_update_suggestions(id,user_id,pet_profile_id,type,title,details,payload,status) values ('{S}','{A}','{P}','memory','Remember','Maple hides during storms.','{{\"memoryType\":\"behavior\"}}','pending');")
    put("/tmp/furvise-http.conf", f'db-uri = "postgresql://{ROLE}:{password}@127.0.0.1:5432/stage2_validation"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "{secret}"\nserver-host = "127.0.0.1"\nserver-port = 3099\ndb-pool = 2\n')
    server = subprocess.Popen(["docker","exec",C,"/tmp/furvise-postgrest","/tmp/furvise-http.conf"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    def token(role):
        enc = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=")
        body = enc(b'{"alg":"HS256","typ":"JWT"}') + b"." + enc(json.dumps({"role":role,"sub":A,"exp":int(time.time())+120}).encode())
        return (body+b"."+enc(hmac.new(secret.encode(),body,hashlib.sha256).digest())).decode()
    payload = {"p_user_id":A,"p_suggestion_id":S,"p_expected_pet_id":P,"p_expected_note":"Maple hides during storms.","p_expected_type":"behavior"}
    def request(role):
        put("/tmp/furvise-http-request",json.dumps(payload))
        put("/tmp/furvise-http-curl", 'silent\nshow-error\nheader = "Content-Type: application/json"\nheader = "Authorization: Bearer '+token(role)+'"\n')
        out = run(["docker","exec",C,"curl","--max-time","5","--config","/tmp/furvise-http-curl","--data-binary","@/tmp/furvise-http-request","--write-out","\n%{http_code}","http://127.0.0.1:3099/rpc/save_ask_memory_suggestion"])
        body, status = out.rsplit("\n",1)
        return int(status), json.loads(body)
    ready = False
    for _ in range(20):
        r = subprocess.run(["docker","exec",C,"curl","-s","--max-time","1","http://127.0.0.1:3099/"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if r.returncode == 0: ready=True; break
        time.sleep(.2)
    assert ready, "PostgREST startup unavailable"
    for role in ["anon","authenticated"]:
        status, body = request(role)
        assert status in (401,403,404), (role,status,body)
        print("PASS HTTP denied",role,status)
    status, body = request("service_role")
    assert status == 200 and body[0]["apply_status"] == "applied", (status,body)
    memory = body[0]["memory_id"]
    status, body = request("service_role")
    assert status == 200 and body[0]["apply_status"] == "already_applied" and body[0]["memory_id"] == memory
    assert sql(f"select count(*) from public.furvise_memories where user_id='{A}'") == "1"
    print("PASS HTTP service save/retry: one canonical memory")
finally:
    if server:
        run(["docker","exec",C,"pkill","-f","^/tmp/furvise-postgrest /tmp/furvise-http.conf$"])
        server.communicate(timeout=10)
    sql(f"delete from auth.users where id='{A}'; drop role if exists {ROLE};")
    run(["docker","exec",C,"rm","-f","/tmp/furvise-http.conf","/tmp/furvise-http-curl","/tmp/furvise-http-request"])
    assert sql(f"select count(*) from auth.users where id='{A}'") == "0"
    print("CLEANUP verified")
