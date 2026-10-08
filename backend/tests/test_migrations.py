import importlib.util
import io
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

from alembic.migration import MigrationContext
from alembic.operations import Operations


BACKEND = Path(__file__).resolve().parents[1]
MIGRATION = BACKEND / "alembic" / "versions" / "0007_budget_reservations.py"


def run_alembic(db, *args):
    env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db}"}
    result = subprocess.run(
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env,
        text=True, capture_output=True, check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_migration_backfills_owner_and_completed_chapters_then_downgrades(tmp_path):
    db = tmp_path / "migration.db"
    run_alembic(db, "upgrade", "0006")
    with sqlite3.connect(db) as c:
        now = "2026-10-08 12:00:00"
        c.execute("INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?)", ("user", "migration@example.com", "unused", now, now))
        c.execute("INSERT INTO programs (id,user_id,status,roadmap,created_at,updated_at) VALUES (?,?,?,?,?,?)", ("program", "user", "ready", "[]", now, now))
        for sip_id in ("done", "pending"):
            c.execute("INSERT INTO sips (id,user_id,input_text,status,program_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", (sip_id, "user", "topic", "ready", "program", now, now))
            c.execute("INSERT INTO modules (id,sip_id,position,title,role,objectives) VALUES (?,?,?,?,?,?)", (sip_id, sip_id, 1, "title", "role", "[]"))
            c.execute("INSERT INTO lessons (id,sip_id,module_id,position,global_index,key,title,objective,prerequisites,concepts,status,revisions,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (sip_id, sip_id, sip_id, 1, 0, "M1L1", "title", "objective", "[]", "[]", "ready", 0, now, now, now if sip_id == "done" else None))
        c.execute("INSERT INTO llm_calls (id,stage,model,sip_id,cost,ok,created_at) VALUES (?,?,?,?,?,?,?)", ("legacy", "writing", "m", "done", 0.5, True, now))
        c.execute("INSERT INTO llm_calls (id,stage,model,sip_id,user_id,cost,ok,created_at) VALUES (?,?,?,?,?,?,?,?)", ("explicit", "writing", "m", "done", "explicit-user", 0.5, True, now))
        c.execute("INSERT INTO llm_calls (id,stage,model,sip_id,cost,ok,created_at) VALUES (?,?,?,?,?,?,?)", ("deleted", "writing", "m", "deleted-sip", 0.5, True, now))
    run_alembic(db, "upgrade", "head")
    with sqlite3.connect(db) as c:
        assert dict(c.execute("SELECT id,user_id FROM llm_calls")) == {"legacy": "user", "explicit": "explicit-user", "deleted": None}
        assert dict(c.execute("SELECT id,adjustment_queued FROM sips")) == {"done": 1, "pending": 0}
        assert c.execute("SELECT id FROM budget_lock").fetchall() == [(1,)]
        assert "reserved_until" in {row[1] for row in c.execute("PRAGMA table_info(llm_calls)")}
    run_alembic(db, "downgrade", "0006")
    with sqlite3.connect(db) as c:
        assert "reserved_until" not in {row[1] for row in c.execute("PRAGMA table_info(llm_calls)")}
        assert "adjustment_queued" not in {row[1] for row in c.execute("PRAGMA table_info(sips)")}
        assert c.execute("SELECT user_id FROM llm_calls WHERE id='legacy'").fetchone() == ("user",)
        assert c.execute("SELECT id FROM lessons ORDER BY id").fetchall() == [("done",), ("pending",)]


def test_budget_migration_compiles_for_postgresql():
    spec = importlib.util.spec_from_file_location("budget_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = io.StringIO()
    context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        module.upgrade()
        module.downgrade()
    sql = output.getvalue()
    assert "UPDATE llm_calls SET user_id" in sql
    assert "CREATE TABLE budget_lock" in sql
    assert "ALTER TABLE sips ADD COLUMN adjustment_queued BOOLEAN" in sql
    assert "DROP TABLE budget_lock" in sql
