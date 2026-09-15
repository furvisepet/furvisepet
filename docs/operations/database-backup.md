# Encrypted database backup and restore drill

Run **Encrypted database backup and restore check** from Actions on main. It also runs daily at 07:17 UTC and when its code changes on main. It never runs on pull requests. GitHub schedules can be delayed; check that the latest successful run is less than 24–48 hours old.

Required repository Actions secrets:
- `SUPABASE_DB_URL`: this project's direct or session pooler connection URI, port 5432.
- `BACKUP_ENCRYPTION_PASSPHRASE`: a separate, randomly generated password of at least 32 characters. Retain a copy in the owner's password manager. Losing this key makes the backup unrecoverable. Never commit either secret.

The job holds a read-only repeatable-read transaction and exports a snapshot for pg_dump. It saves the database archive, password-free role definitions, and per-table row-count/hash manifest inside an authenticated AES-256-GCM archive (`.fvbackup`), with a random salt and scrypt key derivation. Only the encrypted archive may be uploaded. No database errors or row contents are printed to logs.

The drill decrypts that archive and restores its contents into a disposable Postgres 17 container with matching Supabase extensions. The container has no network access, published port, source credentials, or mounted host directories. Cron job execution is disabled. Any dump, encryption, restore, or comparison failure fails the job. Restore compares all ordinary tables in public, private, auth, storage and supabase_migrations against the source snapshot. Restore errors must be investigated; do not ignore errors or remove objects merely to make the check pass.

The GitHub encrypted artifact expires after 14 days. Download and retain it privately off-site, with the encryption key stored separately. Every scheduled backup includes a restore verification. A daily schedule means up to approximately one day of new data can be lost between successful snapshots; failures or scheduling delays extend that window. Review Actions failures alongside the owner dashboard. The dashboard does not independently detect a stopped GitHub schedule.

Limits: database backups do not restore hosted Auth/OAuth/SMTP settings, provider credentials, role passwords, Vercel settings, external services, or Vault/column-encryption root keys. The job fails if Storage has any files; those require a separate object backup. The database schema/roles are restored with errors treated as fatal, but this is not a hosted Supabase application failover test. Recovery may require restoring provider configuration and reauthorizing integrations. Source role definitions are obtained separately because PostgreSQL roles are cluster-level objects.

References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

## Verified recovery receipt

The production snapshot in [run 35034136778](https://github.com/furvisepet/furvisepet/actions/runs/35034136778) restored successfully on September 15, 2026. All 102 scoped table counts and row hashes matched. The encrypted file SHA-256 was `38a1ba1f190115ef027d44bc84f44bdb696f0e6f96df4981c2b7891a71f8e28c`.

The isolated cluster must use `supabase_admin` as its bootstrap role and load `supautils` with the configured privileged role. Role ADMIN grants precede dependent grants. Every dump entry is restored; event triggers and their comments are restored last using their original session owner because Supabase rejects transient superuser ownership of user-owned trigger functions.

## Recover the encrypted file

Download the artifact ZIP from a successful Actions run and unpack the `.fvbackup` file locally. Retain the encryption password separately. In an offline/private recovery folder, install `cryptography==46.0.0`, then use the repository's authenticated decrypt function. The password is prompted without echo and never passed on the command line:

```python
import getpass
import os
import sys
from pathlib import Path
sys.path.insert(0, "scripts/backup")
from database import decrypt
files = decrypt(Path("database-RUN_ID.fvbackup"), getpass.getpass("Backup encryption password: "))
output = Path("private-recovery")
output.mkdir(mode=0o700)
for name, data in files.items():
    with os.fdopen(os.open(output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as stream:
        stream.write(data)
```

These decrypted files contain private records: keep them off GitHub and shared folders. Restore only into an isolated/new database first. Use `drill`'s matching bootstrap, role and event-trigger restoration sequence; do not run an unreviewed restore against production. Restore hosted settings and external secrets separately before directing the app to a replacement database.
