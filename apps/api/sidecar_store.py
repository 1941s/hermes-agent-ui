from __future__ import annotations

import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

try:
    from .skill_validate import validate_skill_manifest
except ImportError:
    from skill_validate import validate_skill_manifest  # type: ignore


def db_path() -> str:
    """Use the same DB file as FastAPI `main` (tests override `main.DB_PATH`)."""
    main_mod = sys.modules.get("main")
    if main_mod is not None:
        p = getattr(main_mod, "DB_PATH", None)
        if p is not None and str(p).strip():
            return str(p)
    return os.getenv("HERMES_UI_DB_PATH", os.path.join(os.path.dirname(__file__), "runtime.db"))


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.row_factory = sqlite3.Row
    return conn


def init_sidecar_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS skill_manifests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            package_name TEXT NOT NULL,
            version TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(package_name, version)
        );

        CREATE TABLE IF NOT EXISTS skill_installs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            package_name TEXT NOT NULL,
            version TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            installed_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, package_name)
        );

        CREATE TABLE IF NOT EXISTS agent_metrics_daily (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            day TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            calls INTEGER NOT NULL DEFAULT 0,
            successes INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, day, tool_name)
        );

        CREATE TABLE IF NOT EXISTS optimization_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT,
            kind TEXT NOT NULL,
            removed_json TEXT NOT NULL,
            added_json TEXT NOT NULL,
            rationale TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS task_graph_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            graph_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(session_id, revision)
        );

        CREATE TABLE IF NOT EXISTS session_fork (
            child_session_id TEXT PRIMARY KEY,
            parent_session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            forked_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS obs_turns (
            trace_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            model_provider TEXT,
            model_name TEXT,
            total_frames INTEGER NOT NULL DEFAULT 0,
            response_chunks INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            tool_calls INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS obs_tool_calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            tool_call_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            latency_ms INTEGER NOT NULL DEFAULT 0,
            success INTEGER NOT NULL DEFAULT 0,
            error_code TEXT
        );

        CREATE TABLE IF NOT EXISTS obs_clarify_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            wait_started_at TEXT NOT NULL,
            picked_at TEXT,
            wait_ms INTEGER NOT NULL DEFAULT 0,
            picked_value TEXT,
            timed_out INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS obs_trace_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trace_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            frame_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            frame_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_obs_turns_user_started
          ON obs_turns(user_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_obs_turns_session_started
          ON obs_turns(session_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_obs_tool_calls_user_time
          ON obs_tool_calls(user_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_obs_tool_calls_name_time
          ON obs_tool_calls(tool_name, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_obs_tool_calls_trace
          ON obs_tool_calls(trace_id);
        CREATE INDEX IF NOT EXISTS idx_obs_clarify_user_time
          ON obs_clarify_events(user_id, wait_started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_obs_trace_events_trace_seq
          ON obs_trace_events(trace_id, seq);
        """
    )
    _ensure_skill_install_columns(conn)


def _ensure_skill_install_columns(conn: sqlite3.Connection) -> None:
    rows = conn.execute("PRAGMA table_info(skill_installs)").fetchall()
    cols = {str(r[1]) for r in rows}
    if "sync_status" not in cols:
        conn.execute("ALTER TABLE skill_installs ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'")
    if "sync_error" not in cols:
        conn.execute("ALTER TABLE skill_installs ADD COLUMN sync_error TEXT")
    if "synced_at" not in cols:
        conn.execute("ALTER TABLE skill_installs ADD COLUMN synced_at TEXT")


def _runtime_skills_root() -> Path:
    raw = os.getenv("HERMES_UI_RUNTIME_SKILLS_DIR", "").strip()
    if raw:
        return Path(raw).expanduser()
    return (Path.home() / ".hermes" / "skills").expanduser()


def _skill_runtime_path(package_name: str) -> Path:
    # Preserve package namespace hierarchy so skill_view(name) can resolve
    # names like "hermes-ui/demo-skill" via direct path lookup.
    return _runtime_skills_root() / package_name


def _legacy_flat_skill_runtime_path(package_name: str) -> Path:
    # Backward-compat cleanup for previously materialized flat dirs.
    return _runtime_skills_root() / package_name.replace("/", "__")


def _render_skill_markdown(package_name: str, manifest: dict[str, Any]) -> str:
    pkg = manifest.get("package") or {}
    meta = manifest.get("meta") or {}
    display_name = str(pkg.get("displayName") or package_name)
    description = str(pkg.get("description") or "No description provided.")
    tags = meta.get("tags") if isinstance(meta.get("tags"), list) else []
    tags_line = ", ".join(str(t) for t in tags) if tags else "general"
    version = str(manifest.get("version") or "0.0.0")
    entrypoints = manifest.get("entrypoints") if isinstance(manifest.get("entrypoints"), dict) else {}
    permissions = manifest.get("permissions") if isinstance(manifest.get("permissions"), list) else []
    dependencies = manifest.get("dependencies") if isinstance(manifest.get("dependencies"), dict) else {}

    lines: list[str] = []
    lines.append("---")
    # Keep frontmatter name aligned with skill_view(name) lookup semantics.
    lines.append(f"name: {package_name}")
    lines.append(f"description: {description}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {display_name}")
    lines.append("")
    lines.append(f"- Package: `{package_name}`")
    lines.append(f"- Version: `{version}`")
    lines.append(f"- Tags: `{tags_line}`")
    lines.append("")
    lines.append("## Entrypoints")
    if entrypoints:
        for key, value in entrypoints.items():
            lines.append(f"- `{key}`: `{value}`")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("## Permissions")
    if permissions:
        for p in permissions:
            lines.append(f"- `{p}`")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("## Dependencies")
    if dependencies:
        for dep, ver in dependencies.items():
            lines.append(f"- `{dep}`: `{ver}`")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("## Runtime Notes")
    lines.append(
        "This skill entry is generated by Hermes Agent UI sync bridge. "
        "It maps UI-managed skill manifests into Hermes runtime SKILL.md format."
    )
    return "\n".join(lines) + "\n"


def _materialize_skill_manifest(package_name: str, manifest: dict[str, Any]) -> tuple[bool, str | None]:
    target = _skill_runtime_path(package_name)
    legacy_target = _legacy_flat_skill_runtime_path(package_name)
    tmp = target.parent / f".{target.name}.tmp-{uuid4().hex[:8]}"
    try:
        tmp.mkdir(parents=True, exist_ok=True)
        # Hermes runtime tools scan SKILL.md. Keep a manifest snapshot for traceability.
        with open(tmp / "SKILL.md", "w", encoding="utf-8") as f:
            f.write(_render_skill_markdown(package_name, manifest))
        with open(tmp / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        if target.exists():
            shutil.rmtree(target)
        if legacy_target.exists():
            shutil.rmtree(legacy_target)
        tmp.rename(target)
        return True, None
    except Exception as exc:
        try:
            if tmp.exists():
                shutil.rmtree(tmp)
        except Exception:
            pass
        return False, str(exc)


def _remove_runtime_skill(package_name: str) -> tuple[bool, str | None]:
    target = _skill_runtime_path(package_name)
    legacy_target = _legacy_flat_skill_runtime_path(package_name)
    try:
        if target.exists():
            shutil.rmtree(target)
        if legacy_target.exists():
            shutil.rmtree(legacy_target)
        return True, None
    except Exception as exc:
        return False, str(exc)


def seed_demo_data(conn: sqlite3.Connection, user_id: str = "anonymous") -> None:
    """Idempotent seed for mock/demo UX."""
    row = conn.execute("SELECT COUNT(*) FROM optimization_events WHERE user_id = ?", (user_id,)).fetchone()
    if row and int(row[0]) > 0:
        return
    removed = json.dumps(["Always call web_search before answering factual questions.", "Use temperature 0.9 for code."])
    added = json.dumps(
        [
            "Prefer tool results over model priors when a tool returned structured data.",
            "Use temperature 0.2 for code generation tasks.",
        ]
    )
    conn.execute(
        """
        INSERT INTO optimization_events(user_id, session_id, kind, removed_json, added_json, rationale)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            "demo-session",
            "rule_replace",
            removed,
            added,
            "Derived from 3 successful trajectories with verified tool outputs.",
        ),
    )
    base_manifest = {
        "specVersion": "1.0.0",
        "package": {
            "name": "hermes-ui/base-tool",
            "displayName": "Base Tool",
            "description": "Shared primitives for demo skills.",
        },
        "version": "1.0.0",
        "entrypoints": {"lib": "base.py"},
        "permissions": [],
        "dependencies": {},
        "meta": {"license": "MIT", "tags": ["core"], "authors": [{"name": "Hermes UI"}]},
    }
    ok_b, errs_b = validate_skill_manifest(base_manifest)
    if not ok_b:
        raise RuntimeError(f"Demo base manifest invalid: {errs_b}")
    conn.execute(
        """
        INSERT OR IGNORE INTO skill_manifests(package_name, version, manifest_json)
        VALUES (?, ?, ?)
        """,
        ("hermes-ui/base-tool", "1.0.0", json.dumps(base_manifest, ensure_ascii=False)),
    )

    demo_manifest = {
        "specVersion": "1.0.0",
        "package": {
            "name": "hermes-ui/demo-skill",
            "displayName": "Demo Skill",
            "description": "Compliant mock skill for Skill Hub.",
        },
        "version": "1.0.0",
        "entrypoints": {"default": "skill.py"},
        "permissions": ["filesystem.read"],
        "dependencies": {"hermes-ui/base-tool": "^1.0.0"},
        "meta": {"license": "MIT", "tags": ["demo"], "authors": [{"name": "Hermes UI"}]},
    }
    ok, errs = validate_skill_manifest(demo_manifest)
    if not ok:
        raise RuntimeError(f"Demo manifest invalid: {errs}")
    conn.execute(
        """
        INSERT OR IGNORE INTO skill_manifests(package_name, version, manifest_json)
        VALUES (?, ?, ?)
        """,
        ("hermes-ui/demo-skill", "1.0.0", json.dumps(demo_manifest, ensure_ascii=False)),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO skill_installs(user_id, package_name, version, enabled)
        VALUES (?, ?, ?, 1)
        """,
        (user_id, "hermes-ui/demo-skill", "1.0.0"),
    )

    demo_session = "demo-orchestration-session"
    for rev, graph in _demo_graph_checkpoints():
        conn.execute(
            """
            INSERT OR IGNORE INTO task_graph_snapshots(session_id, revision, graph_json)
            VALUES (?, ?, ?)
            """,
            (demo_session, rev, json.dumps(graph, ensure_ascii=False)),
        )


def _demo_graph_checkpoints() -> list[tuple[int, dict[str, Any]]]:
    """Revision-indexed graphs for Time Travel demo."""
    base_nodes = [
        {"id": "root", "label": "Planner", "status": "done", "kind": "agent"},
        {"id": "a", "label": "Researcher", "status": "thinking", "kind": "subagent"},
        {"id": "b", "label": "Coder", "status": "idle", "kind": "subagent"},
        {"id": "merge", "label": "Merge", "status": "idle", "kind": "join"},
    ]
    edges = [
        {"id": "e1", "source": "root", "target": "a", "label": "fork"},
        {"id": "e2", "source": "root", "target": "b", "label": "fork"},
        {"id": "e3", "source": "a", "target": "merge", "label": "sync"},
        {"id": "e4", "source": "b", "target": "merge", "label": "sync"},
    ]

    r0 = {"nodes": [dict(n, status="idle") for n in base_nodes], "edges": []}
    r1 = {
        "nodes": [
            {"id": "root", "label": "Planner", "status": "done", "kind": "agent"},
            {"id": "a", "label": "Researcher", "status": "thinking", "kind": "subagent"},
        ],
        "edges": [{"id": "e1", "source": "root", "target": "a", "label": "delegate"}],
    }
    r2 = {
        "nodes": [dict(n) for n in base_nodes],
        "edges": edges[:3],
    }
    r3 = {"nodes": [dict(n) for n in base_nodes], "edges": edges}
    return [(0, r0), (1, r1), (2, r2), (3, r3)]


def increment_tool_metric(user_id: str, tool_name: str, success: bool) -> None:
    day = date.today().isoformat()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO agent_metrics_daily(user_id, day, tool_name, calls, successes)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(user_id, day, tool_name) DO UPDATE SET
              calls = agent_metrics_daily.calls + 1,
              successes = agent_metrics_daily.successes + excluded.successes
            """,
            (user_id, day, tool_name, 1 if success else 0),
        )


def _ensure_demo_optimization_for_user(user_id: str) -> None:
    """First-time users get the same demo strategy-diff rows as anonymous (UX)."""
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM optimization_events WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row and int(row[0]) > 0:
            return
    removed = json.dumps(["Always call web_search before answering factual questions.", "Use temperature 0.9 for code."])
    added = json.dumps(
        [
            "Prefer tool results over model priors when a tool returned structured data.",
            "Use temperature 0.2 for code generation tasks.",
        ]
    )
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO optimization_events(user_id, session_id, kind, removed_json, added_json, rationale)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                "demo-session",
                "rule_replace",
                removed,
                added,
                "Derived from 3 successful trajectories with verified tool outputs.",
            ),
        )


def list_optimization_events(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    _ensure_demo_optimization_for_user(user_id)
    with connect() as conn:
        cur = conn.execute(
            """
            SELECT id, session_id, kind, removed_json, added_json, rationale, created_at
            FROM optimization_events
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, limit),
        )
        rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "session_id": r["session_id"],
                "kind": r["kind"],
                "removed": json.loads(r["removed_json"]),
                "added": json.loads(r["added_json"]),
                "rationale": r["rationale"],
                "created_at": r["created_at"],
            }
        )
    return out


def metrics_summary(user_id: str, days: int = 14) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            """
            SELECT day, tool_name, calls, successes
            FROM agent_metrics_daily
            WHERE user_id = ?
              AND day >= date('now', ?)
            ORDER BY day ASC, tool_name ASC
            """,
            (user_id, f"-{max(1, days)} days"),
        )
        series = [dict(zip(["day", "tool_name", "calls", "successes"], row, strict=False)) for row in cur.fetchall()]
    return {"user_id": user_id, "days": days, "series": series}


def process_observability_event(event: dict[str, Any]) -> None:
    kind = str(event.get("kind") or "")
    if not kind:
        return
    with connect() as conn:
        if kind == "turn_start":
            conn.execute(
                """
                INSERT OR REPLACE INTO obs_turns(
                    trace_id, user_id, session_id, started_at, status, model_provider, model_name
                ) VALUES (?, ?, ?, ?, 'running', ?, ?)
                """,
                (
                    str(event.get("trace_id") or ""),
                    str(event.get("user_id") or "anonymous"),
                    str(event.get("session_id") or ""),
                    str(event.get("started_at") or datetime.now(timezone.utc).isoformat()),
                    str(event.get("model_provider") or "openai"),
                    str(event.get("model_name") or ""),
                ),
            )
            return

        if kind == "turn_end":
            conn.execute(
                """
                UPDATE obs_turns
                SET ended_at = ?, duration_ms = ?, status = ?, total_frames = ?, response_chunks = ?, error_count = ?, tool_calls = ?
                WHERE trace_id = ?
                """,
                (
                    str(event.get("ended_at") or datetime.now(timezone.utc).isoformat()),
                    int(event.get("duration_ms") or 0),
                    str(event.get("status") or "completed"),
                    int(event.get("total_frames") or 0),
                    int(event.get("response_chunks") or 0),
                    int(event.get("error_count") or 0),
                    int(event.get("tool_calls") or 0),
                    str(event.get("trace_id") or ""),
                ),
            )
            return

        if kind == "tool_start":
            conn.execute(
                """
                INSERT INTO obs_tool_calls(
                    trace_id, user_id, session_id, tool_call_id, tool_name, started_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(event.get("trace_id") or ""),
                    str(event.get("user_id") or "anonymous"),
                    str(event.get("session_id") or ""),
                    str(event.get("tool_call_id") or ""),
                    str(event.get("tool_name") or "unknown"),
                    str(event.get("started_at") or datetime.now(timezone.utc).isoformat()),
                ),
            )
            return

        if kind == "tool_complete":
            conn.execute(
                """
                UPDATE obs_tool_calls
                SET completed_at = ?, latency_ms = ?, success = ?, error_code = ?
                WHERE trace_id = ? AND tool_call_id = ?
                """,
                (
                    str(event.get("completed_at") or datetime.now(timezone.utc).isoformat()),
                    int(event.get("latency_ms") or 0),
                    1 if bool(event.get("success")) else 0,
                    event.get("error_code"),
                    str(event.get("trace_id") or ""),
                    str(event.get("tool_call_id") or ""),
                ),
            )
            return

        if kind == "clarify_start":
            conn.execute(
                """
                INSERT INTO obs_clarify_events(trace_id, user_id, session_id, wait_started_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    str(event.get("trace_id") or ""),
                    str(event.get("user_id") or "anonymous"),
                    str(event.get("session_id") or ""),
                    str(event.get("wait_started_at") or datetime.now(timezone.utc).isoformat()),
                ),
            )
            return

        if kind == "clarify_resolve":
            conn.execute(
                """
                UPDATE obs_clarify_events
                SET picked_at = ?, wait_ms = ?, picked_value = ?, timed_out = ?
                WHERE id = (
                  SELECT id FROM obs_clarify_events
                  WHERE trace_id = ? AND picked_at IS NULL
                  ORDER BY id DESC LIMIT 1
                )
                """,
                (
                    str(event.get("picked_at") or datetime.now(timezone.utc).isoformat()),
                    int(event.get("wait_ms") or 0),
                    str(event.get("picked_value") or ""),
                    1 if bool(event.get("timed_out")) else 0,
                    str(event.get("trace_id") or ""),
                ),
            )
            return

        if kind == "frame":
            frame = event.get("frame")
            if not isinstance(frame, dict):
                return
            frame_type = str(frame.get("type") or "unknown")
            conn.execute(
                """
                INSERT INTO obs_trace_events(trace_id, user_id, session_id, seq, frame_type, created_at, frame_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(event.get("trace_id") or ""),
                    str(event.get("user_id") or "anonymous"),
                    str(event.get("session_id") or ""),
                    int(frame.get("seq") or 0),
                    frame_type,
                    str(event.get("created_at") or datetime.now(timezone.utc).isoformat()),
                    json.dumps(frame, ensure_ascii=False),
                ),
            )


def _window_start(window: str) -> datetime:
    now = datetime.now(timezone.utc)
    if window == "15m":
        return now - timedelta(minutes=15)
    if window == "1h":
        return now - timedelta(hours=1)
    if window == "7d":
        return now - timedelta(days=7)
    return now - timedelta(hours=24)


def _percentile(sorted_vals: list[int], q: float) -> int:
    if not sorted_vals:
        return 0
    idx = int(math.ceil((len(sorted_vals) - 1) * q))
    idx = max(0, min(idx, len(sorted_vals) - 1))
    return int(sorted_vals[idx])


def overview_metrics(user_id: str, window: str = "24h") -> dict[str, Any]:
    start = _window_start(window).isoformat()
    with connect() as conn:
        turns = conn.execute(
            """
            SELECT duration_ms, status, error_count
            FROM obs_turns
            WHERE user_id = ? AND started_at >= ?
            """,
            (user_id, start),
        ).fetchall()
        tool_row = conn.execute(
            """
            SELECT COUNT(*) AS calls, COALESCE(SUM(success), 0) AS successes
            FROM obs_tool_calls
            WHERE user_id = ? AND started_at >= ?
            """,
            (user_id, start),
        ).fetchone()
        clarify_row = conn.execute(
            """
            SELECT COUNT(*) AS total, COALESCE(SUM(timed_out), 0) AS timed_out, COALESCE(AVG(wait_ms), 0) AS avg_wait_ms
            FROM obs_clarify_events
            WHERE user_id = ? AND wait_started_at >= ?
            """,
            (user_id, start),
        ).fetchone()
    durations = sorted([int(r["duration_ms"]) for r in turns if int(r["duration_ms"]) > 0])
    turn_total = len(turns)
    turn_success = sum(1 for r in turns if str(r["status"]) == "completed" and int(r["error_count"]) == 0)
    tool_calls = int(tool_row["calls"]) if tool_row else 0
    tool_successes = int(tool_row["successes"]) if tool_row else 0
    clarify_total = int(clarify_row["total"]) if clarify_row else 0
    clarify_timeout = int(clarify_row["timed_out"]) if clarify_row else 0
    return {
        "window": window,
        "turns_total": turn_total,
        "turns_success_rate": (turn_success / turn_total) if turn_total else 0.0,
        "latency_p50_ms": _percentile(durations, 0.50),
        "latency_p95_ms": _percentile(durations, 0.95),
        "tool_calls": tool_calls,
        "tool_success_rate": (tool_successes / tool_calls) if tool_calls else 0.0,
        "clarify_total": clarify_total,
        "clarify_timeout_rate": (clarify_timeout / clarify_total) if clarify_total else 0.0,
        "clarify_avg_wait_ms": int(float(clarify_row["avg_wait_ms"])) if clarify_row else 0,
    }


def timeseries_metrics(user_id: str, window: str = "24h", bucket: str = "1h") -> dict[str, Any]:
    start = _window_start(window).isoformat()
    bucket_expr = "%Y-%m-%d %H:00:00" if bucket == "1h" else "%Y-%m-%d %H:%M:00"
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT strftime('{bucket_expr}', started_at) AS bucket_at,
                   COUNT(*) AS turns,
                   COALESCE(SUM(CASE WHEN status='completed' AND error_count=0 THEN 1 ELSE 0 END), 0) AS success_turns,
                   COALESCE(AVG(duration_ms), 0) AS avg_latency_ms
            FROM obs_turns
            WHERE user_id = ? AND started_at >= ?
            GROUP BY bucket_at
            ORDER BY bucket_at ASC
            """,
            (user_id, start),
        ).fetchall()
    series = [
        {
            "bucket": r["bucket_at"],
            "turns": int(r["turns"]),
            "success_turns": int(r["success_turns"]),
            "avg_latency_ms": int(float(r["avg_latency_ms"])),
        }
        for r in rows
    ]
    return {"window": window, "bucket": bucket, "series": series}


def tools_top_metrics(user_id: str, window: str = "24h", limit: int = 20, sort: str = "calls") -> dict[str, Any]:
    start = _window_start(window).isoformat()
    order_expr = "calls DESC"
    if sort == "failure_rate":
        order_expr = "(1.0 - success_rate) DESC, calls DESC"
    if sort == "latency":
        order_expr = "avg_latency_ms DESC, calls DESC"
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT tool_name,
                   COUNT(*) AS calls,
                   COALESCE(SUM(success), 0) AS successes,
                   COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
                   CASE WHEN COUNT(*) > 0 THEN (1.0 * COALESCE(SUM(success), 0) / COUNT(*)) ELSE 0 END AS success_rate
            FROM obs_tool_calls
            WHERE user_id = ? AND started_at >= ?
            GROUP BY tool_name
            ORDER BY {order_expr}
            LIMIT ?
            """,
            (user_id, start, max(1, min(limit, 100))),
        ).fetchall()
    items = [
        {
            "tool_name": r["tool_name"],
            "calls": int(r["calls"]),
            "successes": int(r["successes"]),
            "success_rate": float(r["success_rate"]),
            "avg_latency_ms": int(float(r["avg_latency_ms"])),
        }
        for r in rows
    ]
    return {"window": window, "sort": sort, "items": items}


def tool_latency_metrics(user_id: str, tool_name: str, window: str = "24h") -> dict[str, Any]:
    start = _window_start(window).isoformat()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT latency_ms
            FROM obs_tool_calls
            WHERE user_id = ? AND tool_name = ? AND started_at >= ? AND latency_ms > 0
            ORDER BY latency_ms ASC
            """,
            (user_id, tool_name, start),
        ).fetchall()
    vals = [int(r["latency_ms"]) for r in rows]
    return {
        "window": window,
        "tool_name": tool_name,
        "count": len(vals),
        "p50_ms": _percentile(vals, 0.50),
        "p95_ms": _percentile(vals, 0.95),
        "max_ms": max(vals) if vals else 0,
    }


def trace_events(user_id: str, trace_id: str, limit: int = 200, cursor: int | None = None) -> dict[str, Any]:
    with connect() as conn:
        if cursor is None:
            rows = conn.execute(
                """
                SELECT id, seq, frame_type, created_at, frame_json
                FROM obs_trace_events
                WHERE user_id = ? AND trace_id = ?
                ORDER BY seq ASC, id ASC
                LIMIT ?
                """,
                (user_id, trace_id, max(1, min(limit, 500))),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, seq, frame_type, created_at, frame_json
                FROM obs_trace_events
                WHERE user_id = ? AND trace_id = ? AND id > ?
                ORDER BY seq ASC, id ASC
                LIMIT ?
                """,
                (user_id, trace_id, cursor, max(1, min(limit, 500))),
            ).fetchall()
    items: list[dict[str, Any]] = []
    next_cursor: int | None = None
    for r in rows:
        payload = json.loads(r["frame_json"])
        items.append(
            {
                "id": int(r["id"]),
                "seq": int(r["seq"]),
                "frame_type": r["frame_type"],
                "created_at": r["created_at"],
                "frame": payload,
            }
        )
        next_cursor = int(r["id"])
    return {"trace_id": trace_id, "items": items, "next_cursor": next_cursor}


def clarify_metrics(user_id: str, window: str = "24h") -> dict[str, Any]:
    start = _window_start(window).isoformat()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT wait_ms, timed_out, picked_value
            FROM obs_clarify_events
            WHERE user_id = ? AND wait_started_at >= ?
            ORDER BY id DESC
            LIMIT 1000
            """,
            (user_id, start),
        ).fetchall()
    waits = [int(r["wait_ms"]) for r in rows if int(r["wait_ms"]) > 0]
    choices: dict[str, int] = {}
    timeout_count = 0
    for r in rows:
        if int(r["timed_out"]) == 1:
            timeout_count += 1
        pick = str(r["picked_value"] or "").strip()
        if pick:
            choices[pick] = choices.get(pick, 0) + 1
    return {
        "window": window,
        "total": len(rows),
        "timeout_count": timeout_count,
        "timeout_rate": (timeout_count / len(rows)) if rows else 0.0,
        "avg_wait_ms": int(sum(waits) / len(waits)) if waits else 0,
        "p95_wait_ms": _percentile(sorted(waits), 0.95) if waits else 0,
        "top_choices": [{"value": k, "count": v} for k, v in sorted(choices.items(), key=lambda x: -x[1])[:10]],
    }


def list_catalog() -> list[dict[str, Any]]:
    with connect() as conn:
        cur = conn.execute(
            "SELECT package_name, version, manifest_json FROM skill_manifests ORDER BY package_name ASC"
        )
        rows = cur.fetchall()
    grouped: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        grouped.setdefault(str(row["package_name"]), []).append(row)

    def _score_version(v: str) -> tuple[int, tuple[int, int, int]]:
        if v == "0.0.0":
            return (0, (0, 0, 0))
        parts = v.split(".")
        nums: list[int] = []
        for p in parts[:3]:
            try:
                nums.append(int(p.split("-")[0]))
            except ValueError:
                nums.append(0)
        while len(nums) < 3:
            nums.append(0)
        return (1, (nums[0], nums[1], nums[2]))

    result: list[dict[str, Any]] = []
    for pkg, items in grouped.items():
        best = max(items, key=lambda r: _score_version(str(r["version"])))
        m = json.loads(best["manifest_json"])
        result.append(
            {
                "package_name": pkg,
                "version": best["version"],
                "name": pkg,
                "description": str((m.get("package") or {}).get("description") or ""),
                "tags": list(((m.get("meta") or {}).get("tags") or [])),
                "installed": False,
                "manifest": m,
            }
        )
    return result


def list_catalog_for_user(user_id: str) -> list[dict[str, Any]]:
    catalog = list_catalog()
    installs = list_installs(user_id)
    installed_names = {str(row.get("package_name")) for row in installs}
    out: list[dict[str, Any]] = []
    for item in catalog:
        pkg = str(item.get("package_name") or "")
        row = dict(item)
        row["installed"] = pkg in installed_names
        out.append(row)
    return out


def _ensure_demo_skill_install(user_id: str) -> None:
    auto_demo = os.getenv("HERMES_UI_AUTO_DEMO_SKILL", "0").strip().lower() in {"1", "true", "yes", "on"}
    if not auto_demo:
        return
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM skill_installs WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if row and int(row[0]) > 0:
            return
        row = conn.execute(
            "SELECT package_name, version FROM skill_manifests WHERE package_name = ?",
            ("hermes-ui/demo-skill",),
        ).fetchone()
        if not row:
            return
        conn.execute(
            """
            INSERT OR IGNORE INTO skill_installs(
                user_id, package_name, version, enabled, sync_status, sync_error, synced_at
            )
            VALUES (?, ?, ?, 1, 'synced', NULL, datetime('now'))
            """,
            (user_id, row[0], row[1]),
        )


def list_installs(user_id: str) -> list[dict[str, Any]]:
    _normalize_legacy_hub_prefix(user_id)
    runtime_sync_on_list = os.getenv("HERMES_UI_RUNTIME_SYNC_ON_LIST", "1").strip().lower() in {"1", "true", "yes", "on"}
    if runtime_sync_on_list:
        try:
            # Keep control-plane state converged with runtime filesystem installs,
            # including skills installed outside this UI (e.g. direct CLI / agent actions).
            sync_runtime_skills_to_db(user_id)
        except Exception:
            pass
    _ensure_demo_skill_install(user_id)
    with connect() as conn:
        cur = conn.execute(
            """
            SELECT package_name, version, enabled, installed_at, sync_status, sync_error, synced_at
            FROM skill_installs
            WHERE user_id = ?
            ORDER BY installed_at DESC
            """,
            (user_id,),
        )
        rows = [dict(row) for row in cur.fetchall()]
    out: list[dict[str, Any]] = []
    for row in rows:
        pkg = str(row.get("package_name") or "")
        out.append(
            {
                **row,
                "name": pkg,
            }
        )
    return out


def _parse_simple_frontmatter(content: str) -> dict[str, Any]:
    lines = content.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        return {}
    out: dict[str, Any] = {}
    for i in range(1, len(lines)):
        line = lines[i].strip()
        if line == "---":
            break
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            if not inner:
                out[key] = []
            else:
                out[key] = [part.strip().strip("\"'") for part in inner.split(",") if part.strip()]
        else:
            out[key] = value
    return out


_SAFE_SKILL_NAME = re.compile(r"[^a-zA-Z0-9._/\-]")


def _sanitize_skill_name(raw: str) -> str:
    name = _SAFE_SKILL_NAME.sub("-", (raw or "").strip()).strip("-")
    if not name:
        return "unknown-skill"
    return name


def _normalize_legacy_hub_prefix(user_id: str) -> None:
    """
    Migrate legacy auto-prefixed names (hub/*) to bare runtime names.
    """
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT package_name
            FROM skill_installs
            WHERE user_id = ? AND package_name LIKE 'hub/%'
            """,
            (user_id,),
        ).fetchall()
        for row in rows:
            old_pkg = str(row["package_name"] or "")
            new_pkg = old_pkg.split("/", 1)[1] if "/" in old_pkg else old_pkg
            if not new_pkg:
                continue

            old_manifest = conn.execute(
                """
                SELECT version, manifest_json
                FROM skill_manifests
                WHERE package_name = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (old_pkg,),
            ).fetchone()
            has_new_manifest = conn.execute(
                "SELECT 1 FROM skill_manifests WHERE package_name = ? LIMIT 1",
                (new_pkg,),
            ).fetchone()
            if old_manifest and not has_new_manifest:
                conn.execute(
                    """
                    INSERT INTO skill_manifests(package_name, version, manifest_json)
                    VALUES (?, ?, ?)
                    ON CONFLICT(package_name, version) DO UPDATE SET manifest_json = excluded.manifest_json
                    """,
                    (new_pkg, old_manifest["version"], old_manifest["manifest_json"]),
                )
            conn.execute("DELETE FROM skill_manifests WHERE package_name = ?", (old_pkg,))

            has_new_install = conn.execute(
                "SELECT 1 FROM skill_installs WHERE user_id = ? AND package_name = ? LIMIT 1",
                (user_id, new_pkg),
            ).fetchone()
            if has_new_install:
                conn.execute(
                    "DELETE FROM skill_installs WHERE user_id = ? AND package_name = ?",
                    (user_id, old_pkg),
                )
            else:
                conn.execute(
                    "UPDATE skill_installs SET package_name = ? WHERE user_id = ? AND package_name = ?",
                    (new_pkg, user_id, old_pkg),
                )


def _runtime_skill_dirs() -> list[Path]:
    root = _runtime_skills_root()
    if not root.exists():
        return []
    out: list[Path] = []
    for skill_md in root.rglob("SKILL.md"):
        if ".hub" in skill_md.parts:
            continue
        out.append(skill_md.parent)
    return out


def _manifest_from_runtime_skill_dir(skill_dir: Path) -> dict[str, Any]:
    manifest_file = skill_dir / "manifest.json"
    if manifest_file.exists():
        loaded = json.loads(manifest_file.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            pkg_name = str(((loaded.get("package") or {}).get("name") or "")).strip()
            version = str(loaded.get("version") or "").strip()
            if pkg_name and version:
                return loaded
    skill_md = skill_dir / "SKILL.md"
    content = skill_md.read_text(encoding="utf-8")
    frontmatter = _parse_simple_frontmatter(content)
    pkg_name = _sanitize_skill_name(str(frontmatter.get("name") or skill_dir.name))
    version = str(frontmatter.get("version") or "0.0.0")
    description = str(frontmatter.get("description") or "")
    tags_val = frontmatter.get("tags")
    tags = tags_val if isinstance(tags_val, list) else []
    return {
        "specVersion": "1.0.0",
        "package": {
            "name": pkg_name,
            "displayName": str(frontmatter.get("name") or skill_dir.name),
            "description": description,
        },
        "version": version,
        "entrypoints": {"default": "SKILL.md"},
        "permissions": [],
        "dependencies": {},
        "meta": {"tags": tags, "authors": [{"name": "Hermes Skills Hub"}]},
    }


def sync_runtime_skills_to_db(user_id: str, only_skill_dirs: list[Path] | None = None) -> dict[str, Any]:
    imported = 0
    errors: list[str] = []
    targets = only_skill_dirs if only_skill_dirs is not None else _runtime_skill_dirs()
    for skill_dir in targets:
        try:
            manifest = _manifest_from_runtime_skill_dir(skill_dir)
            pkg_name = str(((manifest.get("package") or {}).get("name") or "")).strip()
            version = str(manifest.get("version") or "").strip() or "0.0.0"
            if not pkg_name:
                raise ValueError("missing package.name in runtime skill manifest")
            with connect() as conn:
                conn.execute(
                    """
                    INSERT INTO skill_manifests(package_name, version, manifest_json)
                    VALUES (?, ?, ?)
                    ON CONFLICT(package_name, version) DO UPDATE SET manifest_json = excluded.manifest_json
                    """,
                    (pkg_name, version, json.dumps(manifest, ensure_ascii=False)),
                )
                conn.execute(
                    """
                    INSERT INTO skill_installs(user_id, package_name, version, enabled, sync_status, sync_error, synced_at)
                    VALUES (?, ?, ?, 1, 'synced', NULL, datetime('now'))
                    ON CONFLICT(user_id, package_name) DO UPDATE SET
                      version = excluded.version,
                      enabled = 1,
                      sync_status = 'synced',
                      sync_error = NULL,
                      synced_at = datetime('now')
                    """,
                    (user_id, pkg_name, version),
                )
            imported += 1
        except Exception as exc:
            errors.append(f"{skill_dir}: {exc}")
    return {"ok": True, "imported": imported, "errors": errors}


def install_skill_from_hub(user_id: str, identifier: str) -> dict[str, Any]:
    ident = (identifier or "").strip()
    if not ident:
        return {"ok": False, "error": "EMPTY_IDENTIFIER"}
    before = {str(p.resolve()) for p in _runtime_skill_dirs()}
    def _run_install(candidate: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["hermes", "skills", "install", candidate],
            capture_output=True,
            text=True,
            input="y\n",
            timeout=180,
            check=False,
        )

    tried: list[str] = []
    try:
        tried.append(ident)
        proc = _run_install(ident)
    except FileNotFoundError:
        return {"ok": False, "error": "HERMES_CLI_NOT_FOUND"}
    except Exception as exc:
        return {"ok": False, "error": f"INSTALL_FAILED: {exc}"}
    stdout_tail = (proc.stdout or "")[-2000:]
    stderr_tail = (proc.stderr or "")[-2000:]
    merged_lower = f"{proc.stdout}\n{proc.stderr}".lower()
    cli_error_markers = (
        "error:",
        "no skill named",
        "not found in any source",
        "failed",
        "traceback",
    )
    has_cli_error = any(marker in merged_lower for marker in cli_error_markers)
    # Fallback: some fully-qualified identifiers can fail in one context while
    # short aliases resolve successfully (source routing/proxy differences).
    fallback_candidate = ident.rsplit("/", 1)[-1] if "/" in ident else ""
    if (proc.returncode != 0 or has_cli_error) and fallback_candidate and fallback_candidate != ident:
        try:
            tried.append(fallback_candidate)
            retry_proc = _run_install(fallback_candidate)
            retry_stdout_tail = (retry_proc.stdout or "")[-2000:]
            retry_stderr_tail = (retry_proc.stderr or "")[-2000:]
            retry_low = f"{retry_proc.stdout}\n{retry_proc.stderr}".lower()
            retry_has_error = any(marker in retry_low for marker in cli_error_markers)
            if retry_proc.returncode == 0 and not retry_has_error:
                proc = retry_proc
                stdout_tail = retry_stdout_tail
                stderr_tail = retry_stderr_tail
                has_cli_error = False
            else:
                stdout_tail = retry_stdout_tail
                stderr_tail = retry_stderr_tail
        except Exception:
            pass

    if proc.returncode != 0 or has_cli_error:
        # If remote fetch fails but skill already exists locally, treat as
        # "already installed" and just sync it into control-plane DB.
        candidates = [ident]
        if "/" in ident:
            candidates.append(ident.rsplit("/", 1)[-1])
        for cand in candidates:
            local_dir = _runtime_skills_root() / cand
            if (local_dir / "SKILL.md").exists():
                sync_local = sync_runtime_skills_to_db(user_id, [local_dir])
                if int(sync_local.get("imported", 0)) > 0:
                    return {
                        "ok": True,
                        "identifier": cand,
                        "stdout": stdout_tail,
                        "stderr": stderr_tail,
                        "imported": sync_local.get("imported", 0),
                        "changed_dirs": 0,
                        "sync_errors": sync_local.get("errors", []),
                        "tried_identifiers": tried,
                        "hint": "Remote fetch failed, but local installed skill was synchronized.",
                    }
        return {
            "ok": False,
            "error": "HERMES_INSTALL_FAILED",
            "stdout": stdout_tail,
            "stderr": stderr_tail,
            "tried_identifiers": tried,
        }
    after_dirs = _runtime_skill_dirs()
    changed_dirs = [d for d in after_dirs if str(d.resolve()) not in before]
    sync = sync_runtime_skills_to_db(user_id, changed_dirs if changed_dirs else after_dirs)
    if int(sync.get("imported", 0)) == 0:
        return {
            "ok": False,
            "error": "HERMES_INSTALL_NO_RUNTIME_SKILLS",
            "stdout": stdout_tail,
            "stderr": stderr_tail,
            "hint": "CLI reported success but no runtime SKILL.md was discovered; verify identifier and registry availability.",
        }
    return {
        "ok": True,
        "identifier": tried[-1] if tried else ident,
        "stdout": stdout_tail,
        "stderr": stderr_tail,
        "imported": sync.get("imported", 0),
        "changed_dirs": len(changed_dirs),
        "sync_errors": sync.get("errors", []),
        "tried_identifiers": tried,
    }


def search_hub_skills(query: str, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    q = (query or "").strip()
    if len(q) < 2:
        return {"ok": False, "error": "QUERY_TOO_SHORT", "items": []}
    safe_limit = max(1, min(int(limit), 50))
    safe_offset = max(0, int(offset))
    # Keep each request lightweight to avoid triggering a large fan-out
    # against multiple upstream registries in one shot.
    fetch_limit = min(safe_offset + safe_limit + 1, 121)

    # Preferred path: CLI search is usually lighter in network fan-out.
    proc: subprocess.CompletedProcess[str] | None = None
    try:
        proc = subprocess.run(
            ["hermes", "skills", "search", q, "--limit", str(fetch_limit)],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
    except Exception:
        proc = None

    if proc is not None:
        merged = (proc.stdout or "") + "\n" + (proc.stderr or "")
        low = merged.lower()
        if proc.returncode == 0 and "error:" not in low:
            items: list[dict[str, Any]] = []
            truncated_identifier_found = False
            for raw_line in (proc.stdout or "").splitlines():
                line = raw_line.strip()
                if not line.startswith("|"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 7:
                    continue
                name, source, trust, identifier = parts[1], parts[3], parts[4], parts[5]
                if not name or name.lower() == "name" or set(name) <= {"-"}:
                    continue
                # Ignore continuation rows in rich table wrapping.
                if identifier and " " in identifier:
                    identifier = ""
                if "…" in identifier or identifier.endswith("..."):
                    truncated_identifier_found = True
                items.append(
                    {
                        "name": name,
                        "description": "",
                        "identifier": identifier,
                        "source": source,
                        "trust": trust,
                        "tags": [],
                        "url": "",
                    }
                )
                if len(items) >= fetch_limit:
                    break
            # CLI table can truncate long identifiers. Fall back to
            # structured API to recover full identifiers when truncation is detected.
            if truncated_identifier_found:
                items = []
            else:
                page_items = items[safe_offset : safe_offset + safe_limit]
                has_more = len(items) > safe_offset + safe_limit
                total = safe_offset + len(page_items) + (1 if has_more else 0)
                return {
                    "ok": True,
                    "query": q,
                    "items": page_items,
                    "total": total,
                    "offset": safe_offset,
                    "limit": safe_limit,
                    "has_more": has_more,
                    "raw_output": (proc.stdout or "")[-5000:],
                }

    # Fallback path: call Hermes Hub Python APIs directly to get richer metadata.
    try:
        from tools.skills_hub import create_source_router, unified_search  # type: ignore

        sources = create_source_router()
        metas = unified_search(q, sources=sources, source_filter="all", limit=fetch_limit)
        items: list[dict[str, Any]] = []
        for meta in metas:
            extra = getattr(meta, "extra", {}) or {}
            detail_url = str(extra.get("detail_url") or "").strip()
            repo_url = str(extra.get("repo_url") or "").strip()
            items.append(
                {
                    "name": str(getattr(meta, "name", "") or ""),
                    "description": str(getattr(meta, "description", "") or ""),
                    "identifier": str(getattr(meta, "identifier", "") or ""),
                    "source": str(getattr(meta, "source", "") or ""),
                    "trust": str(getattr(meta, "trust_level", "") or ""),
                    "tags": list(getattr(meta, "tags", []) or []),
                    "url": detail_url or repo_url,
                }
            )
        page_items = items[safe_offset : safe_offset + safe_limit]
        has_more = len(items) > safe_offset + safe_limit
        total = safe_offset + len(page_items) + (1 if has_more else 0)
        return {
            "ok": True,
            "query": q,
            "items": page_items,
            "total": total,
            "offset": safe_offset,
            "limit": safe_limit,
            "has_more": has_more,
            "raw_output": "",
        }
    except Exception:
        return {"ok": False, "error": "HUB_SEARCH_FAILED", "items": []}


def inspect_hub_skill(identifier: str) -> dict[str, Any]:
    ident = (identifier or "").strip()
    if not ident:
        return {"ok": False, "error": "EMPTY_IDENTIFIER"}
    # Preferred path: Python hub source inspect for stable metadata.
    try:
        from tools.skills_hub import create_source_router  # type: ignore

        sources = create_source_router()
        prefix = ident.split("/", 1)[0] if "/" in ident else ""
        ordered = sources
        if prefix:
            prioritized = [s for s in sources if s.source_id() == prefix]
            ordered = prioritized + [s for s in sources if s.source_id() != prefix]
        for src in ordered:
            try:
                meta = src.inspect(ident)
            except Exception:
                continue
            if meta:
                content_lines = [
                    f"name: {meta.name}",
                    f"identifier: {meta.identifier}",
                    f"source: {meta.source}",
                    f"trust: {meta.trust_level}",
                    f"description: {meta.description}",
                ]
                tags = list(getattr(meta, "tags", []) or [])
                if tags:
                    content_lines.append(f"tags: {', '.join(str(t) for t in tags)}")
                return {"ok": True, "identifier": meta.identifier, "content": "\n".join(content_lines)}
    except Exception:
        pass

    try:
        proc = subprocess.run(
            ["hermes", "skills", "inspect", ident],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "error": "HERMES_CLI_NOT_FOUND"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "HUB_INSPECT_TIMEOUT"}
    except Exception as exc:
        return {"ok": False, "error": f"HUB_INSPECT_FAILED: {exc}"}

    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    merged_low = f"{out}\n{err}".lower()
    if proc.returncode != 0 or "error:" in merged_low:
        return {
            "ok": False,
            "error": "HUB_INSPECT_FAILED",
            "stdout": out[-5000:],
            "stderr": err[-2000:],
        }
    return {"ok": True, "identifier": ident, "content": out[-12000:]}


def cleanup_shadow_catalog_versions() -> dict[str, Any]:
    """
    Remove low-quality 0.0.0 shadow manifests when a real version exists.
    """
    removed = 0
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT package_name
            FROM skill_manifests
            GROUP BY package_name
            HAVING SUM(CASE WHEN version <> '0.0.0' THEN 1 ELSE 0 END) > 0
               AND SUM(CASE WHEN version = '0.0.0' THEN 1 ELSE 0 END) > 0
            """
        ).fetchall()
        pkgs = [str(r["package_name"]) for r in rows]
        for pkg in pkgs:
            cur = conn.execute(
                "DELETE FROM skill_manifests WHERE package_name = ? AND version = '0.0.0'",
                (pkg,),
            )
            removed += int(cur.rowcount)
    return {"ok": True, "removed": removed}


def delete_catalog_package(user_id: str, package_name: str) -> dict[str, Any]:
    """
    Remove a package from catalog source-of-truth for current workspace.
    Also removes current user's install state and runtime materialization.
    """
    pkg = (package_name or "").strip()
    if not pkg:
        return {"ok": False, "error": "EMPTY_PACKAGE_NAME"}
    _remove_runtime_skill(pkg)
    with connect() as conn:
        removed_installs = conn.execute(
            "DELETE FROM skill_installs WHERE user_id = ? AND package_name = ?",
            (user_id, pkg),
        ).rowcount
        removed_manifests = conn.execute(
            "DELETE FROM skill_manifests WHERE package_name = ?",
            (pkg,),
        ).rowcount
    return {
        "ok": True,
        "package_name": pkg,
        "removed_installs": int(removed_installs),
        "removed_manifests": int(removed_manifests),
    }


def install_skill(user_id: str, manifest: dict[str, Any]) -> dict[str, Any]:
    ok, errs = validate_skill_manifest(manifest)
    if not ok:
        return {"ok": False, "errors": errs}
    pkg = manifest["package"]["name"]
    ver = manifest["version"]
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO skill_manifests(package_name, version, manifest_json)
            VALUES (?, ?, ?)
            ON CONFLICT(package_name, version) DO UPDATE SET manifest_json = excluded.manifest_json
            """,
            (pkg, ver, json.dumps(manifest, ensure_ascii=False)),
        )
        conn.execute(
            """
            INSERT INTO skill_installs(user_id, package_name, version, enabled, sync_status, sync_error, synced_at)
            VALUES (?, ?, ?, 1, 'pending', NULL, NULL)
            ON CONFLICT(user_id, package_name) DO UPDATE SET
              version = excluded.version,
              enabled = 1,
              sync_status = 'pending',
              sync_error = NULL,
              synced_at = NULL
            """,
            (user_id, pkg, ver),
        )
    ok_sync, err = _materialize_skill_manifest(pkg, manifest)
    with connect() as conn:
        conn.execute(
            """
            UPDATE skill_installs
            SET sync_status = ?, sync_error = ?, synced_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
            WHERE user_id = ? AND package_name = ?
            """,
            ("synced" if ok_sync else "error", err, 1 if ok_sync else 0, user_id, pkg),
        )
    return {
        "ok": True,
        "package_name": pkg,
        "version": ver,
        "sync_status": "synced" if ok_sync else "error",
        "sync_error": err,
    }


def uninstall_skill(user_id: str, package_name: str) -> bool:
    _remove_runtime_skill(package_name)
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM skill_installs WHERE user_id = ? AND package_name = ?",
            (user_id, package_name),
        )
        return cur.rowcount > 0


def set_skill_enabled(user_id: str, package_name: str, enabled: bool) -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT si.package_name, si.version, sm.manifest_json
            FROM skill_installs si
            LEFT JOIN skill_manifests sm
              ON sm.package_name = si.package_name AND sm.version = si.version
            WHERE si.user_id = ? AND si.package_name = ?
            """,
            (user_id, package_name),
        ).fetchone()
        if row is None:
            return {"ok": False, "error": "NOT_INSTALLED"}
        conn.execute(
            "UPDATE skill_installs SET enabled = ? WHERE user_id = ? AND package_name = ?",
            (1 if enabled else 0, user_id, package_name),
        )
        manifest_json = row["manifest_json"]
    sync_status = "pending"
    sync_error: str | None = None
    if enabled:
        manifest = json.loads(manifest_json) if manifest_json else {}
        ok_sync, err = _materialize_skill_manifest(package_name, manifest)
        sync_status = "synced" if ok_sync else "error"
        sync_error = err
    else:
        ok_remove, err = _remove_runtime_skill(package_name)
        sync_status = "disabled" if ok_remove else "error"
        sync_error = err
    with connect() as conn:
        conn.execute(
            """
            UPDATE skill_installs
            SET sync_status = ?, sync_error = ?, synced_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
            WHERE user_id = ? AND package_name = ?
            """,
            (sync_status, sync_error, 1 if sync_status == "synced" else 0, user_id, package_name),
        )
    return {"ok": True, "package_name": package_name, "enabled": enabled, "sync_status": sync_status, "sync_error": sync_error}


def list_enabled_skills(user_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT si.package_name, si.version, sm.manifest_json
            FROM skill_installs si
            LEFT JOIN skill_manifests sm
              ON sm.package_name = si.package_name AND sm.version = si.version
            WHERE si.user_id = ? AND si.enabled = 1
            ORDER BY si.installed_at DESC
            """,
            (user_id,),
        ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        manifest = json.loads(row["manifest_json"]) if row["manifest_json"] else {}
        out.append({"package_name": row["package_name"], "version": row["version"], "manifest": manifest})
    return out


def reconcile_enabled_skills_runtime(user_id: str) -> dict[str, Any]:
    """
    Ensure all enabled skills are materialized in runtime format.
    Useful after runtime format upgrades or manual filesystem drift.
    """
    enabled = list_enabled_skills(user_id)
    synced = 0
    failed = 0
    for item in enabled:
        pkg = str(item.get("package_name") or "")
        manifest = item.get("manifest") if isinstance(item.get("manifest"), dict) else {}
        if not pkg or not manifest:
            failed += 1
            continue
        ok_sync, err = _materialize_skill_manifest(pkg, manifest)
        with connect() as conn:
            conn.execute(
                """
                UPDATE skill_installs
                SET sync_status = ?, sync_error = ?, synced_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
                WHERE user_id = ? AND package_name = ?
                """,
                ("synced" if ok_sync else "error", err, 1 if ok_sync else 0, user_id, pkg),
            )
        if ok_sync:
            synced += 1
        else:
            failed += 1
    return {"total": len(enabled), "synced": synced, "failed": failed}


def get_task_graph(session_id: str, revision: int | None) -> dict[str, Any] | None:
    with connect() as conn:
        if revision is None:
            row = conn.execute(
                "SELECT MAX(revision) AS m FROM task_graph_snapshots WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None or row["m"] is None:
                return None
            revision = int(row["m"])
        row = conn.execute(
            """
            SELECT revision, graph_json FROM task_graph_snapshots
            WHERE session_id = ? AND revision = ?
            """,
            (session_id, revision),
        ).fetchone()
    if row is None:
        return None
    graph = json.loads(row["graph_json"])
    return {"session_id": session_id, "revision": row["revision"], "graph": graph}


def list_graph_revisions(session_id: str) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            "SELECT revision FROM task_graph_snapshots WHERE session_id = ? ORDER BY revision ASC",
            (session_id,),
        )
        revs = [int(r["revision"]) for r in cur.fetchall()]
    return {"session_id": session_id, "revisions": revs, "max_revision": max(revs) if revs else None}


def fork_session(user_id: str, parent_session_id: str) -> str:
    child = f"sess_fork_{uuid4().hex[:16]}"
    now = datetime.now(timezone.utc).isoformat()
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO session_owners(session_id, user_id, updated_at) VALUES (?, ?, ?)",
            (child, user_id, now),
        )
        conn.execute(
            """
            INSERT INTO session_fork(child_session_id, parent_session_id, user_id)
            VALUES (?, ?, ?)
            """,
            (child, parent_session_id, user_id),
        )
    return child


def dependency_graph_for_packages(package_names: list[str]) -> dict[str, Any]:
    """Build a DAG from stored manifests' dependencies field (D3)."""
    with connect() as conn:
        cur = conn.execute("SELECT package_name, manifest_json FROM skill_manifests")
        rows = cur.fetchall()
    by_name: dict[str, dict[str, Any]] = {}
    for r in rows:
        by_name[r["package_name"]] = json.loads(r["manifest_json"])

    nodes: list[dict[str, str]] = []
    edges: list[dict[str, str]] = []
    seen: set[str] = set()

    def visit(name: str) -> None:
        if name in seen:
            return
        seen.add(name)
        nodes.append({"id": name, "label": name})
        m = by_name.get(name)
        if not m:
            return
        deps = m.get("dependencies") or {}
        for dep, ver in deps.items():
            edges.append({"source": name, "target": dep, "label": ver})
            visit(dep)

    for p in package_names:
        if p in by_name:
            visit(p)

    return {"nodes": nodes, "edges": edges}


def sandbox_run_stub(package_name: str, code: str) -> dict[str, Any]:
    """D2 stub: no real isolation; echo-only for developer loop wiring."""
    return {
        "ok": True,
        "mode": "stub",
        "package_name": package_name,
        "stdout": f"[stub] would execute {len(code)} chars",
        "stderr": "",
        "warning": "Sandbox is not hardened; enable only in trusted environments.",
    }
