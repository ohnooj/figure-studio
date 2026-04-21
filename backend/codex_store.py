from __future__ import annotations

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any
import shutil

from .services.files import ROOT


CODEX_ROOT = ROOT / ".codex_chat"
DB_PATH = CODEX_ROOT / "chat.sqlite3"
THREAD_WORKSPACES_ROOT = CODEX_ROOT / "thread_workspaces"


def now_ts() -> float:
    return round(time.time(), 3)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class CodexStore:
    def __init__(self, db_path: Path = DB_PATH) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        THREAD_WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _init_db(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS codex_threads (
                    id TEXT PRIMARY KEY,
                    figure_id TEXT NOT NULL,
                    scope TEXT NOT NULL DEFAULT 'figure',
                    title TEXT NOT NULL,
                    codex_thread_id TEXT,
                    staging_dir TEXT NOT NULL,
                    model TEXT,
                    reasoning_effort TEXT,
                    sandbox_mode TEXT NOT NULL,
                    approval_policy TEXT NOT NULL,
                    personality TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS codex_runs (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    target_figure_id TEXT,
                    scope_snapshot TEXT,
                    results_count INTEGER NOT NULL DEFAULT 1,
                    review_state TEXT NOT NULL DEFAULT 'pending',
                    applied_variant_id TEXT,
                    state TEXT NOT NULL,
                    codex_turn_id TEXT,
                    current_status TEXT,
                    figure_context_json TEXT NOT NULL,
                    latest_diff TEXT,
                    latest_preview_svg TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    completed_at REAL,
                    FOREIGN KEY(thread_id) REFERENCES codex_threads(id)
                );

                CREATE TABLE IF NOT EXISTS codex_run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES codex_runs(id)
                );

                CREATE INDEX IF NOT EXISTS idx_codex_threads_figure_id
                ON codex_threads(figure_id, archived, updated_at DESC);

                CREATE INDEX IF NOT EXISTS idx_codex_runs_thread_id
                ON codex_runs(thread_id, created_at DESC);

                CREATE UNIQUE INDEX IF NOT EXISTS idx_codex_run_events_run_seq
                ON codex_run_events(run_id, seq);

                CREATE TABLE IF NOT EXISTS codex_run_variants (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL,
                    variant_index INTEGER NOT NULL,
                    label TEXT NOT NULL,
                    native_thread_id TEXT,
                    native_turn_id TEXT,
                    staging_dir TEXT NOT NULL,
                    state TEXT NOT NULL,
                    current_status TEXT,
                    latest_diff TEXT,
                    latest_preview_svg TEXT,
                    review_state TEXT NOT NULL DEFAULT 'pending',
                    marked_for_revision INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    completed_at REAL,
                    FOREIGN KEY(run_id) REFERENCES codex_runs(id)
                );

                CREATE INDEX IF NOT EXISTS idx_codex_run_variants_run_id
                ON codex_run_variants(run_id, variant_index ASC);
                """
            )
            self._ensure_column(connection, "codex_threads", "scope", "TEXT NOT NULL DEFAULT 'figure'")
            self._ensure_column(connection, "codex_threads", "reasoning_effort", "TEXT")
            self._ensure_column(connection, "codex_runs", "target_figure_id", "TEXT")
            self._ensure_column(connection, "codex_runs", "scope_snapshot", "TEXT")
            self._ensure_column(connection, "codex_runs", "results_count", "INTEGER NOT NULL DEFAULT 1")
            self._ensure_column(connection, "codex_runs", "review_state", "TEXT NOT NULL DEFAULT 'pending'")
            self._ensure_column(connection, "codex_runs", "applied_variant_id", "TEXT")

    @staticmethod
    def _ensure_column(connection: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
        columns = {
            str(row["name"])
            for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    def list_threads(self, figure_id: str | None = None, archived: bool = False) -> list[dict[str, Any]]:
        query = """
            SELECT id, figure_id, scope, title, codex_thread_id, staging_dir, model, reasoning_effort, sandbox_mode,
                   approval_policy, personality, created_at, updated_at, archived
            FROM codex_threads
            WHERE archived = ?
        """
        params: list[Any] = [1 if archived else 0]
        if figure_id:
            query += " AND figure_id = ?"
            params.append(figure_id)
        query += " ORDER BY updated_at DESC, created_at DESC"
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self.get_thread(str(row["id"])) for row in rows]

    def create_thread(
        self,
        *,
        figure_id: str,
        scope: str,
        title: str,
        model: str | None,
        reasoning_effort: str | None,
        sandbox_mode: str,
        approval_policy: str,
        personality: str | None,
    ) -> dict[str, Any]:
        thread_id = new_id("thread")
        created_at = now_ts()
        staging_dir = str((THREAD_WORKSPACES_ROOT / thread_id).resolve())
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO codex_threads (
                    id, figure_id, scope, title, codex_thread_id, staging_dir, model, reasoning_effort, sandbox_mode,
                    approval_policy, personality, created_at, updated_at, archived
                ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    thread_id,
                    figure_id,
                    scope,
                    title,
                    staging_dir,
                    model,
                    reasoning_effort,
                    sandbox_mode,
                    approval_policy,
                    personality,
                    created_at,
                    created_at,
                ),
            )
        return self.get_thread(thread_id)

    def get_thread(self, thread_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, figure_id, scope, title, codex_thread_id, staging_dir, model, reasoning_effort, sandbox_mode,
                       approval_policy, personality, created_at, updated_at, archived
                FROM codex_threads
                WHERE id = ?
                """,
                (thread_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Unknown Codex thread: {thread_id}")
            thread = self._thread_row_to_dict(row)
            runs = connection.execute(
                """
                SELECT id, thread_id, prompt, target_figure_id, scope_snapshot, results_count, review_state, applied_variant_id,
                       state, codex_turn_id, current_status, figure_context_json, latest_diff, latest_preview_svg, created_at,
                       updated_at, completed_at
                FROM codex_runs
                WHERE thread_id = ?
                ORDER BY created_at ASC
                """,
                (thread_id,),
            ).fetchall()
        thread["runs"] = []
        for run in runs:
            payload = self._run_row_to_dict(run)
            payload["events"] = self.list_run_events(payload["id"])
            thread["runs"].append(payload)
        return thread

    def update_thread(self, thread_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            return self.get_thread(thread_id)
        fields["updated_at"] = now_ts()
        columns = ", ".join(f"{name} = ?" for name in fields)
        params = list(fields.values()) + [thread_id]
        with self._lock, self._connect() as connection:
            connection.execute(f"UPDATE codex_threads SET {columns} WHERE id = ?", params)
        return self.get_thread(thread_id)

    def clear_thread(self, thread_id: str) -> dict[str, Any]:
        thread = self.get_thread(thread_id)
        staging_dir = Path(thread["stagingDir"])
        with self._lock, self._connect() as connection:
            run_ids = [
                str(row["id"])
                for row in connection.execute(
                    "SELECT id FROM codex_runs WHERE thread_id = ?",
                    (thread_id,),
                ).fetchall()
            ]
            if run_ids:
                placeholders = ", ".join("?" for _ in run_ids)
                connection.execute(
                    f"DELETE FROM codex_run_variants WHERE run_id IN ({placeholders})",
                    run_ids,
                )
                connection.execute(
                    f"DELETE FROM codex_run_events WHERE run_id IN ({placeholders})",
                    run_ids,
                )
                connection.execute(
                    "DELETE FROM codex_runs WHERE thread_id = ?",
                    (thread_id,),
                )
            connection.execute(
                "UPDATE codex_threads SET codex_thread_id = NULL, updated_at = ? WHERE id = ?",
                (now_ts(), thread_id),
            )
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        staging_dir.mkdir(parents=True, exist_ok=True)
        return self.get_thread(thread_id)

    def delete_thread(self, thread_id: str) -> None:
        thread = self.get_thread(thread_id)
        staging_dir = Path(thread["stagingDir"])
        with self._lock, self._connect() as connection:
            run_ids = [
                str(row["id"])
                for row in connection.execute(
                    "SELECT id FROM codex_runs WHERE thread_id = ?",
                    (thread_id,),
                ).fetchall()
            ]
            if run_ids:
                placeholders = ", ".join("?" for _ in run_ids)
                connection.execute(
                    f"DELETE FROM codex_run_variants WHERE run_id IN ({placeholders})",
                    run_ids,
                )
                connection.execute(
                    f"DELETE FROM codex_run_events WHERE run_id IN ({placeholders})",
                    run_ids,
                )
            connection.execute("DELETE FROM codex_runs WHERE thread_id = ?", (thread_id,))
            connection.execute("DELETE FROM codex_threads WHERE id = ?", (thread_id,))
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    def create_run(
        self,
        *,
        thread_id: str,
        prompt: str,
        target_figure_id: str,
        scope_snapshot: str,
        results_count: int,
        figure_context: dict[str, Any],
    ) -> dict[str, Any]:
        run_id = new_id("run")
        created_at = now_ts()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO codex_runs (
                    id, thread_id, prompt, target_figure_id, scope_snapshot, results_count, review_state, applied_variant_id, state, codex_turn_id, current_status, figure_context_json,
                    latest_diff, latest_preview_svg, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, 'queued', NULL, NULL, ?, NULL, NULL, ?, ?, NULL)
                """,
                (run_id, thread_id, prompt, target_figure_id, scope_snapshot, results_count, json.dumps(figure_context), created_at, created_at),
            )
            connection.execute(
                "UPDATE codex_threads SET updated_at = ? WHERE id = ?",
                (created_at, thread_id),
            )
        return self.get_run(run_id)

    def create_variant(
        self,
        *,
        run_id: str,
        variant_index: int,
        label: str,
        staging_dir: str,
    ) -> dict[str, Any]:
        variant_id = new_id("variant")
        created_at = now_ts()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO codex_run_variants (
                    id, run_id, variant_index, label, native_thread_id, native_turn_id, staging_dir,
                    state, current_status, latest_diff, latest_preview_svg, review_state, marked_for_revision,
                    created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 'queued', NULL, NULL, NULL, 'pending', 0, ?, ?, NULL)
                """,
                (variant_id, run_id, variant_index, label, staging_dir, created_at, created_at),
            )
        return self.get_variant(variant_id)

    def list_variants(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, run_id, variant_index, label, native_thread_id, native_turn_id, staging_dir,
                       state, current_status, latest_diff, latest_preview_svg, review_state, marked_for_revision,
                       created_at, updated_at, completed_at
                FROM codex_run_variants
                WHERE run_id = ?
                ORDER BY variant_index ASC, created_at ASC
                """,
                (run_id,),
            ).fetchall()
        return [self._variant_row_to_dict(row) for row in rows]

    def get_variant(self, variant_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, run_id, variant_index, label, native_thread_id, native_turn_id, staging_dir,
                       state, current_status, latest_diff, latest_preview_svg, review_state, marked_for_revision,
                       created_at, updated_at, completed_at
                FROM codex_run_variants
                WHERE id = ?
                """,
                (variant_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Unknown Codex variant: {variant_id}")
        return self._variant_row_to_dict(row)

    def update_variant(self, variant_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            return self.get_variant(variant_id)
        fields["updated_at"] = now_ts()
        if fields.get("state") in {"completed", "failed", "cancelled"}:
            fields.setdefault("completed_at", now_ts())
        columns = ", ".join(f"{name} = ?" for name in fields)
        params = list(fields.values()) + [variant_id]
        with self._lock, self._connect() as connection:
            connection.execute(f"UPDATE codex_run_variants SET {columns} WHERE id = ?", params)
            run_id = connection.execute(
                "SELECT run_id FROM codex_run_variants WHERE id = ?",
                (variant_id,),
            ).fetchone()
            if run_id is not None:
                connection.execute(
                    "UPDATE codex_runs SET updated_at = ? WHERE id = ?",
                    (fields["updated_at"], str(run_id["run_id"])),
                )
        return self.get_variant(variant_id)

    def list_run_events(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT seq, event_type, payload_json, created_at
                FROM codex_run_events
                WHERE run_id = ?
                ORDER BY seq ASC
                """,
                (run_id,),
            ).fetchall()
        return [
            {
                "seq": int(row["seq"]),
                "type": str(row["event_type"]),
                "payload": json.loads(str(row["payload_json"])),
                "createdAt": float(row["created_at"]),
            }
            for row in rows
        ]

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, thread_id, prompt, target_figure_id, scope_snapshot, results_count, review_state, applied_variant_id, state, codex_turn_id, current_status,
                       figure_context_json, latest_diff, latest_preview_svg, created_at,
                       updated_at, completed_at
                FROM codex_runs
                WHERE id = ?
                """,
                (run_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Unknown Codex run: {run_id}")
        run = self._run_row_to_dict(row)
        run["events"] = self.list_run_events(run_id)
        run["variants"] = self.list_variants(run_id)
        return run

    def active_run_for_thread(self, thread_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, thread_id, prompt, target_figure_id, scope_snapshot, results_count, review_state, applied_variant_id, state, codex_turn_id, current_status,
                       figure_context_json, latest_diff, latest_preview_svg, created_at,
                       updated_at, completed_at
                FROM codex_runs
                WHERE thread_id = ? AND state IN ('queued', 'running', 'waiting')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (thread_id,),
            ).fetchone()
        return None if row is None else self._run_row_to_dict(row)

    def update_run(self, run_id: str, **fields: Any) -> dict[str, Any]:
        if not fields:
            return self.get_run(run_id)
        fields["updated_at"] = now_ts()
        if fields.get("state") in {"completed", "failed", "cancelled"}:
            fields.setdefault("completed_at", now_ts())
        columns = ", ".join(f"{name} = ?" for name in fields)
        params = list(fields.values()) + [run_id]
        with self._lock, self._connect() as connection:
            connection.execute(f"UPDATE codex_runs SET {columns} WHERE id = ?", params)
            thread_id = connection.execute(
                "SELECT thread_id FROM codex_runs WHERE id = ?",
                (run_id,),
            ).fetchone()
            if thread_id is not None:
                connection.execute(
                    "UPDATE codex_threads SET updated_at = ? WHERE id = ?",
                    (fields["updated_at"], str(thread_id["thread_id"])),
                )
        return self.get_run(run_id)

    def append_run_event(self, run_id: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        created_at = now_ts()
        with self._lock, self._connect() as connection:
            current = connection.execute(
                "SELECT COALESCE(MAX(seq), 0) FROM codex_run_events WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            seq = int(current[0]) + 1
            connection.execute(
                """
                INSERT INTO codex_run_events (run_id, seq, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (run_id, seq, event_type, json.dumps(payload), created_at),
            )
        return {"seq": seq, "type": event_type, "payload": payload, "createdAt": created_at}

    @staticmethod
    def _thread_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "figureId": str(row["figure_id"]),
            "scope": str(row["scope"] or "figure"),
            "title": str(row["title"]),
            "codexThreadId": None if row["codex_thread_id"] is None else str(row["codex_thread_id"]),
            "stagingDir": str(row["staging_dir"]),
            "model": None if row["model"] is None else str(row["model"]),
            "reasoningEffort": str(row["reasoning_effort"] or "medium"),
            "sandboxMode": str(row["sandbox_mode"]),
            "approvalPolicy": str(row["approval_policy"]),
            "personality": None if row["personality"] is None else str(row["personality"]),
            "createdAt": float(row["created_at"]),
            "updatedAt": float(row["updated_at"]),
            "archived": bool(row["archived"]),
        }

    @staticmethod
    def _run_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "threadId": str(row["thread_id"]),
            "prompt": str(row["prompt"]),
            "targetFigureId": str(row["target_figure_id"] or json.loads(str(row["figure_context_json"])).get("figureId", "")),
            "scopeSnapshot": str(row["scope_snapshot"] or "figure"),
            "resultsCount": max(1, min(3, int(row["results_count"] or 1))),
            "reviewState": str(row["review_state"] or "pending"),
            "appliedVariantId": None if row["applied_variant_id"] is None else str(row["applied_variant_id"]),
            "state": str(row["state"]),
            "codexTurnId": None if row["codex_turn_id"] is None else str(row["codex_turn_id"]),
            "currentStatus": None if row["current_status"] is None else str(row["current_status"]),
            "figureContext": json.loads(str(row["figure_context_json"])),
            "latestDiff": None if row["latest_diff"] is None else str(row["latest_diff"]),
            "latestPreviewSvg": None if row["latest_preview_svg"] is None else str(row["latest_preview_svg"]),
            "createdAt": float(row["created_at"]),
            "updatedAt": float(row["updated_at"]),
            "completedAt": None if row["completed_at"] is None else float(row["completed_at"]),
        }

    @staticmethod
    def _variant_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "runId": str(row["run_id"]),
            "variantIndex": int(row["variant_index"]),
            "label": str(row["label"]),
            "nativeThreadId": None if row["native_thread_id"] is None else str(row["native_thread_id"]),
            "nativeTurnId": None if row["native_turn_id"] is None else str(row["native_turn_id"]),
            "stagingDir": str(row["staging_dir"]),
            "state": str(row["state"]),
            "currentStatus": None if row["current_status"] is None else str(row["current_status"]),
            "latestDiff": None if row["latest_diff"] is None else str(row["latest_diff"]),
            "latestPreviewSvg": None if row["latest_preview_svg"] is None else str(row["latest_preview_svg"]),
            "reviewState": str(row["review_state"] or "pending"),
            "markedForRevision": bool(row["marked_for_revision"]),
            "createdAt": float(row["created_at"]),
            "updatedAt": float(row["updated_at"]),
            "completedAt": None if row["completed_at"] is None else float(row["completed_at"]),
        }
