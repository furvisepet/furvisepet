# Encrypted database backup and restore drill

Run **Encrypted database backup and restore check** from Actions on main. It also runs when its reviewed code is merged to main. It never runs on pull requests and has no daily schedule yet.

Required repository Actions secrets:
- `SUPABASE_DB_URL`: this project's direct or session pooler connection URI, port 5432.
- `BACKUP_ENCRYPTION_PASSPHRASE`: a separate, randomly generated password of at least 32 characters. Retain a copy in the owner's password manager. Losing this key makes the backup unrecoverable. Never commit either secret.

The job holds a read-only repeatable-read transaction and exports a snapshot for pg_dump. It saves the database archive, password-free role definitions, and per-table row-count/hash manifest inside an authenticated AES-256-GCM archive (`.fvbackup`), with a random salt and scrypt key derivation. Only the encrypted archive may be uploaded. No database errors or row contents are printed to logs.

The drill decrypts that archive and restores its contents into a disposable Postgres 17 container with matching Supabase extensions. The container has no network access, published port, source credentials, or mounted host directories. Cron job execution is disabled. Any dump, encryption, restore, or comparison failure fails the job. Restore compares all ordinary tables in public, private, auth, storage and supabase_migrations against the source snapshot. Restore errors must be investigated; do not ignore errors or remove objects merely to make the check pass.

The GitHub encrypted artifact expires after 14 days. Download and retain it privately off-site, with the encryption key stored separately. This is a manual drill, not an active recurring backup policy. Do not mark recovery verified until an actual production snapshot has successfully restored and the artifact is retained.

Limits: database backups do not restore hosted Auth/OAuth/SMTP settings, provider credentials, role passwords, Vercel settings, external services, or Vault/column-encryption root keys. The job fails if Storage has any files; those require a separate object backup. The database schema/roles are restored with errors treated as fatal, but this is not a hosted Supabase application failover test. Recovery may require restoring provider configuration and reauthorizing integrations. Source role definitions are obtained separately because PostgreSQL roles are cluster-level objects.

References: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
