import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("backup", Path(__file__).with_name("database.py"))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class BackupSafetyTests(unittest.TestCase):
    def config(self, uri=None):
        return {"SUPABASE_DB_URL": uri or "postgresql://postgres.sxavgqzwfahljdvmisyq:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres", "BACKUP_ENCRYPTION_PASSPHRASE": "synthetic-test-key-0123456789abcdef"}

    def test_only_expected_source_and_session_pooler(self):
        pg, _ = backup.configuration(self.config())
        self.assertEqual(pg["PGPASSWORD"], "p@ss")
        self.assertIn("default_transaction_read_only=on", pg["PGOPTIONS"])
        for uri in ["postgresql://postgres:secret@localhost:5432/postgres", "postgresql://postgres.other:secret@aws-0-us-east-1.pooler.supabase.com:5432/postgres", self.config()["SUPABASE_DB_URL"].replace(":5432", ":6543")]:
            with self.assertRaises(RuntimeError):
                backup.configuration(self.config(uri))

    def test_no_dump_without_independent_encryption_key(self):
        for key in ["", "short", "a" * 32 + "\n"]:
            env = self.config()
            env["BACKUP_ENCRYPTION_PASSPHRASE"] = key
            with self.assertRaises(RuntimeError):
                backup.configuration(env)

    def test_actual_encrypted_archive_round_trip_and_wrong_key_failure(self):
        files = {"database.dump": b"synthetic private data", "roles.sql": b"role fixture", "manifest.json": b"{}"}
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "test.fvbackup"
            backup.encrypt(files, target, "synthetic-test-key-0123456789abcdef")
            self.assertNotIn(files["database.dump"], target.read_bytes())
            self.assertEqual(backup.decrypt(target, "synthetic-test-key-0123456789abcdef"), files)
            with self.assertRaises(RuntimeError):
                backup.decrypt(target, "incorrect-synthetic-key")

if __name__ == "__main__":
    unittest.main()
