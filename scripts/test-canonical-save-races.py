"""Small real-PostgreSQL race checks. Only the named disposable database."""
import subprocess, time
CMD = ["docker", "exec", "furvise-stage2-db-2788f0b", "psql", "-U", "postgres", "-d", "stage2_validation", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c"]
A = "61000000-0000-4000-8000-000000000001"
B = "61000000-0000-4000-8000-000000000002"
P = "61000000-0000-4000-8000-000000000011"
S = "61000000-0000-4000-8000-000000000021"
CALL = f"select * from public.save_ask_memory_suggestion('{A}','{S}','{P}','Maple hides during storms.','behavior');"
def sql(query):
    r = subprocess.run(CMD + [query], capture_output=True, text=True, timeout=20)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()
def start(query):
    return subprocess.Popen(CMD + ["set statement_timeout='10s'; " + query], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def finish(p):
    out, err = p.communicate(timeout=15)
    return p.returncode, out, err
def wait_for(query):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if sql(query) == "1": return
        time.sleep(.1)
    raise AssertionError("Expected database synchronization state absent")
def seed():
    sql(f"insert into public.ai_update_suggestions(id,user_id,pet_profile_id,type,title,details,payload,status) values ('{S}','{A}','{P}','memory','Remember','Maple hides during storms.','{{\"memoryType\":\"behavior\"}}','pending');")
processes = []
assert sql(f"select count(*) from auth.users where id in ('{A}','{B}')") == "0", "Fixture collision"
try:
    sql(f"insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at) values ('{A}','authenticated','authenticated','race-a@example.test','',now(),now()),('{B}','authenticated','authenticated','race-b@example.test','',now(),now()); insert into public.dog_profiles(id,user_id,name,species) values ('{P}','{A}','Maple','dog');")
    seed()
    first = start("set application_name='canonical_race_first'; begin; set local role service_role; " + CALL + "select pg_sleep(3); commit;")
    processes.append(first)
    wait_for("select count(*) from pg_stat_activity where application_name='canonical_race_first' and wait_event='PgSleep'")
    second = start("set application_name='canonical_race_second'; set role service_role; " + CALL)
    processes.append(second)
    wait_for("select count(*) from pg_stat_activity where application_name='canonical_race_second' and wait_event_type='Lock'")
    r1, r2 = finish(first), finish(second)
    assert r1[0] == r2[0] == 0, (r1, r2)
    assert "applied|" in r1[1] and "already_applied|" in r2[1], (r1, r2)
    assert sql(f"select count(*) from public.furvise_memories where user_id='{A}'") == "1"
    print("PASS concurrent saves: observed lock wait, one memory, retry receipt")
    sql(f"delete from public.furvise_memories where user_id='{A}'; delete from public.ai_update_suggestions where id='{S}';")
    seed()
    transfer = start(f"set application_name='canonical_race_transfer'; begin; update public.dog_profiles set user_id='{B}' where id='{P}'; select pg_sleep(3); commit;")
    processes.append(transfer)
    wait_for("select count(*) from pg_stat_activity where application_name='canonical_race_transfer' and wait_event='PgSleep'")
    saver = start("set application_name='canonical_race_saver'; set role service_role; " + CALL)
    processes.append(saver)
    wait_for("select count(*) from pg_stat_activity where application_name='canonical_race_saver' and wait_event_type='Lock'")
    rt, rs = finish(transfer), finish(saver)
    assert rt[0] == 0 and rs[0] != 0 and "SUGGESTION_FORBIDDEN" in rs[2], (rt, rs)
    assert sql(f"select count(*) from public.furvise_memories where pet_id='{P}'") == "0"
    assert sql(f"select status from public.ai_update_suggestions where id='{S}'") == "pending"
    print("PASS ownership transfer: observed wait, fresh ownership rejection, no save")
finally:
    for p in processes:
        if p.poll() is None: finish(p)
    sql(f"delete from auth.users where id in ('{A}','{B}');")
    assert sql(f"select count(*) from auth.users where id in ('{A}','{B}')") == "0"
    print("CLEANUP verified")
