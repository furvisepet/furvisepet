"""Manual, fail-closed backup drill. Never accepts a production restore destination."""
import argparse
import hashlib
import io
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import tarfile
import time
from urllib.parse import unquote, urlsplit

IMAGE = "supabase/postgres:17.6.1.127"
PROJECT = "sxavgqzwfahljdvmisyq"
SCHEMAS = ("public", "private", "auth", "storage", "supabase_migrations")


def configuration(env):
    uri = env.get("SUPABASE_DB_URL", "")
    key = env.get("BACKUP_ENCRYPTION_PASSPHRASE", "")
    if not uri:
        raise RuntimeError("SUPABASE_DB_URL is missing")
    if len(key) < 32 or "\n" in key or "\r" in key:
        raise RuntimeError("BACKUP_ENCRYPTION_PASSPHRASE must be a single-line random secret of at least 32 characters")
    try:
        parsed = urlsplit(uri)
        host = parsed.hostname or ""
        direct = host == f"db.{PROJECT}.supabase.co" and parsed.username == "postgres"
        pooled = host.endswith(".pooler.supabase.com") and parsed.username == f"postgres.{PROJECT}"
        valid = parsed.scheme in ("postgres", "postgresql") and (direct or pooled)
        valid = valid and parsed.port == 5432 and parsed.path == "/postgres"
        password = unquote(parsed.password or "")
        if not valid or not password or "YOUR-PASSWORD" in password or parsed.fragment:
            raise ValueError()
    except ValueError:
        raise RuntimeError("Use the production project's direct or session-pooler URI on port 5432 with the real encoded password") from None
    return {
        "PGHOST": host, "PGPORT": "5432", "PGDATABASE": "postgres",
        "PGUSER": unquote(parsed.username), "PGPASSWORD": password,
        "PGSSLMODE": "require", "PGCONNECT_TIMEOUT": "20",
        "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=900000 -c timezone=UTC -c datestyle=ISO",
    }, key


def run(args, *, env=None, data=None):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, check=False)
    if result.returncode:
        # Emit only fixed error categories; never raw server output or SQL.
        detail = result.stderr.decode(errors="replace").lower()
        if "psql" in args or "pg_restore" in args:
            for line in detail.splitlines():
                if "error:" in line:
                    line = line.split("error:")[-1]
                    safe = re.sub(r'"[^"\n]*"', '[identifier]', line)
                    safe = re.sub(r"'[^'\n]*'", '[value]', safe)
                    print("Restore error: " + safe[:250], flush=True)
        for marker, label in [("already exists", "restore object already exists"), ("does not exist", "restore dependency missing"), ("permission denied", "database permission denied"), ("unrecognized configuration parameter", "unsupported database setting"), ("could not open extension", "extension unavailable"), ("syntax error", "SQL syntax error")]:
            if marker in detail:
                print("Failure category: " + label, flush=True)
        raise RuntimeError(f"{Path(args[0]).name} failed (exit {result.returncode}); raw output withheld")
    return result.stdout


def manifest(connection):
    from psycopg import sql
    tables = connection.execute("""select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=any(%s) and c.relkind='r' order by 1,2""", (list(SCHEMAS),)).fetchall()
    result = {}
    for schema, table in tables:
        count, checksum = 0, 0
        query = sql.SQL("select row_to_json(t)::text from {}.{} t").format(sql.Identifier(schema), sql.Identifier(table))
        with connection.cursor(name="backup_rows") as cursor:
            cursor.execute(query)
            for (row,) in cursor:
                checksum = (checksum + int.from_bytes(hashlib.sha256(row.encode()).digest(), "big")) % (1 << 256)
                count += 1
        result[f"{schema}.{table}"] = {"count": count, "checksum": f"{checksum:064x}"}
    return result


def order_role_grants(roles):
    # pg_dumpall can emit a dependent GRANTED BY before that grantor receives ADMIN.
    # Preserve every statement; establish ADMIN memberships before dependent grants.
    lines = roles.decode().splitlines(keepends=True)
    grants = [line for line in lines if line.startswith("GRANT ")]
    if any(not line.rstrip().endswith(";") for line in grants):
        raise RuntimeError("Unexpected multiline role grant; manual recovery review required")
    base = [line for line in lines if not line.startswith("GRANT ")]
    # Keep grants before psql's final unrestrict command.
    index = next((i for i, line in enumerate(base) if line.startswith("\\unrestrict")), len(base))
    ordered = sorted(grants, key=lambda line: 0 if "ADMIN TRUE" in line or "WITH ADMIN OPTION" in line else 1)
    return "".join(base[:index] + ordered + base[index:]).encode()


MAGIC = b"FURVISE_BACKUP_V1\0"


def derive_key(passphrase, salt):
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
    return Scrypt(salt=salt, length=32, n=2**17, r=8, p=1).derive(passphrase.encode())


def encrypt(files, destination, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    payload = io.BytesIO()
    with tarfile.open(fileobj=payload, mode="w:gz") as archive:
        for name, content in files.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(content), 0o600
            archive.addfile(info, io.BytesIO(content))
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + salt + nonce
    ciphertext = AESGCM(derive_key(key, salt)).encrypt(nonce, payload.getvalue(), header)
    destination.write_bytes(header + ciphertext)
    destination.chmod(0o600)


def decrypt(destination, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.exceptions import InvalidTag
    encoded = destination.read_bytes()
    length = len(MAGIC)
    if not encoded.startswith(MAGIC) or len(encoded) < length + 44:
        raise RuntimeError("Invalid encrypted backup header")
    salt, nonce = encoded[length:length+16], encoded[length+16:length+28]
    try:
        payload = AESGCM(derive_key(key, salt)).decrypt(nonce, encoded[length+28:], encoded[:length+28])
    except InvalidTag:
        raise RuntimeError("Encrypted backup authentication failed: wrong key or corrupted file") from None
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as archive:
        if set(archive.getnames()) != {"database.dump", "roles.sql", "manifest.json"}:
            raise RuntimeError("Unexpected encrypted archive contents")
        return {name: archive.extractfile(name).read() for name in archive.getnames()}


def drill(pg_env, key):
    import psycopg
    env = {**os.environ, **pg_env}
    pg_args = ["docker", "run", "--rm", "--network", "host"]
    for name in pg_env:
        pg_args += ["--env", name]
    # Source tools receive only read-only connection settings. No restore command uses these settings.
    print("Connecting to the configured source database.", flush=True)
    with psycopg.connect(host=pg_env["PGHOST"], port=5432, dbname="postgres", user=pg_env["PGUSER"],
                         password=pg_env["PGPASSWORD"], sslmode="require", connect_timeout=20,
                         options=pg_env["PGOPTIONS"]) as source:
        print("Connected; checking the read-only source snapshot.", flush=True)
        source.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        version = source.execute("show server_version_num").fetchone()[0]
        if int(version) // 10000 != 17:
            raise RuntimeError("Production major version changed; review restore image first")
        if source.execute("select count(*) from storage.objects").fetchone()[0]:
            raise RuntimeError("Storage contains files; configure a separate object backup before claiming complete recovery")
        snapshot = source.execute("select pg_export_snapshot()").fetchone()[0]
        print("Reading table checksums.", flush=True)
        expected = manifest(source)
        print("Dumping the consistent snapshot.", flush=True)
        dump = run(pg_args + [IMAGE, "pg_dump", "--format=custom", "--no-tablespaces", f"--snapshot={snapshot}"], env=env)
        roles = run(pg_args + [IMAGE, "pg_dumpall", "--roles-only", "--no-role-passwords"], env=env)
    output = Path(os.environ["RUNNER_TEMP"]) / "furvise-backup-output"
    output.mkdir(mode=0o700, exist_ok=True)
    destination = output / f"database-{os.environ.get('GITHUB_RUN_ID', 'manual')}.fvbackup"
    files = {"database.dump": dump, "roles.sql": roles, "manifest.json": json.dumps(expected, sort_keys=True).encode()}
    encrypt(files, destination, key)
    restored_files = decrypt(destination, key)
    dump, roles = restored_files["database.dump"], restored_files["roles.sql"]
    if json.loads(restored_files["manifest.json"]) != expected:
        raise RuntimeError("Encrypted manifest did not match the source snapshot")
    print("Encrypted database snapshot created and decrypted. Starting isolated restore verification.")
    name = "furvise-restore-" + secrets.token_hex(6)
    operator = "restore_operator_" + secrets.token_hex(6)
    try:
        # Bypass platform bootstrap: restore the source schema into a fresh cluster with matching extensions.
        # No network, published port, production env, or mounted host directory is available to this container.
        run(["docker", "run", "-d", "--name", name, "--network", "none", "--user", "postgres",
             "--tmpfs", "/restore:rw,mode=1777", "--entrypoint", "bash", IMAGE, "-ceu",
             'initdb -D /restore/data -U "$1" --auth=trust >/dev/null; exec postgres -D /restore/data '
             '-c listen_addresses= -c unix_socket_directories=/tmp '
             '-c shared_preload_libraries=pg_cron,pg_net,pg_stat_statements '
             '-c cron.database_name=postgres -c cron.launch_active_jobs=off '
             '-c supautils.superuser=supabase_admin -c supautils.privileged_role=supabase_privileged_role', "--", "supabase_admin"])
        local = ["docker", "exec", "-i", "--env", "PGOPTIONS=-c timezone=UTC -c datestyle=ISO", name]
        psql = local + ["psql", "-X", "-h", "/tmp", "-U", operator, "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        for attempt in range(30):
            check = subprocess.run(local + ["pg_isready", "-h", "/tmp", "-U", "supabase_admin"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if check.returncode == 0:
                break
            time.sleep(2)
        else:
            raise RuntimeError("Disposable restore database did not become ready")
        bootstrap_psql = local + ["psql", "-X", "-h", "/tmp", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
        run(bootstrap_psql + ["-c", f'CREATE ROLE "{operator}" SUPERUSER LOGIN;'])
        # initdb already created the source bootstrap superuser (OID 10).
        # Preserve its ALTER statements, avoiding only the duplicate CREATE.
        role_lines = roles.splitlines(keepends=True)
        bootstrap_create = b"CREATE ROLE supabase_admin;"
        if sum(line.strip() == bootstrap_create for line in role_lines) != 1:
            raise RuntimeError("Source bootstrap role definition changed")
        roles = b"".join(line for line in role_lines if line.strip() != bootstrap_create)
        print("Restoring database roles.", flush=True)
        run(psql, data=order_role_grants(roles))
        print("Restoring database schema and data.", flush=True)
        run(local + ["pg_restore", "--exit-on-error", "--clean", "--if-exists", "--no-tablespaces",
                     "-h", "/tmp", "-U", operator, "-d", "postgres"], data=dump)
        # Compare canonical per-row hashes without exposing any row values to the workflow log.
        for table, expected_table in expected.items():
            schema, table_name = table.split(".", 1)
            quote = lambda value: '"' + value.replace('"', '""') + '"'
            # COPY escaping is decoded by JSON aggregation instead, preserving exact original row strings.
            query = f"SELECT coalesce(json_agg(row_to_json(t)::text),'[]'::json) FROM {quote(schema)}.{quote(table_name)} t;"
            rows = json.loads(run(psql + ["-At", "-c", query]))
            checksum = sum(int.from_bytes(hashlib.sha256(row.encode()).digest(), "big") for row in rows) % (1 << 256)
            if {"count": len(rows), "checksum": f"{checksum:064x}"} != expected_table:
                raise RuntimeError("Restored table contents do not match the snapshot")
        receipt = {"status": "passed", "tables_verified": len(expected), "database_major": 17,
                   "encrypted_sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}
        print(json.dumps(receipt))
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(
                "Database restore check passed. All scoped table counts and row hashes match.\n\n"
                "Encrypted artifact retained for 14 days. Download it and retain the encryption secret separately.\n\n"
                "This does not restore hosted Auth settings, external secrets, Vault encryption keys, or external services.\n")
    finally:
        subprocess.run(["docker", "rm", "-f", "-v", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    try:
        configuration_values = configuration(os.environ)
        if args.preflight:
            print("Required backup secrets are configured; values were not displayed.")
        else:
            drill(*configuration_values)
    except Exception as error:
        # Classify known failures without displaying server messages or credentials.
        import psycopg
        if isinstance(error, psycopg.Error):
            code = error.sqlstate
            print("Database error category: " + (code if code and len(code) == 5 and code.isalnum() else "connection_or_driver"))
            message = str(error).lower()
            for marker, label in [("password authentication failed", "Database password was rejected"), ("tenant or user not found", "Pooler tenant or user was not found"), ("network is unreachable", "Runner cannot reach the database network"), ("could not translate host name", "Database hostname could not be resolved")]:
                if marker in message:
                    print(label)
                    break
        # Only explicitly authored messages are safe to log.
        print(str(error) if type(error) is RuntimeError else "Backup/restore check failed; database details withheld.")
        raise SystemExit(1) from None
