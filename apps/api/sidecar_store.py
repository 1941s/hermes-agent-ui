from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import date, datetime, timezone
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
        """
    )


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


def list_catalog() -> list[dict[str, Any]]:
    with connect() as conn:
        cur = conn.execute(
            "SELECT package_name, version, manifest_json FROM skill_manifests ORDER BY package_name ASC"
        )
        rows = cur.fetchall()
    result: list[dict[str, Any]] = []
    for r in rows:
        m = json.loads(r["manifest_json"])
        result.append(
            {
                "package_name": r["package_name"],
                "version": r["version"],
                "manifest": m,
            }
        )
    return result


def _ensure_demo_skill_install(user_id: str) -> None:
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
            INSERT OR IGNORE INTO skill_installs(user_id, package_name, version, enabled)
            VALUES (?, ?, ?, 1)
            """,
            (user_id, row[0], row[1]),
        )


def list_installs(user_id: str) -> list[dict[str, Any]]:
    _ensure_demo_skill_install(user_id)
    with connect() as conn:
        cur = conn.execute(
            """
            SELECT package_name, version, enabled, installed_at
            FROM skill_installs
            WHERE user_id = ?
            ORDER BY installed_at DESC
            """,
            (user_id,),
        )
        return [dict(row) for row in cur.fetchall()]


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
            INSERT INTO skill_installs(user_id, package_name, version, enabled)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id, package_name) DO UPDATE SET version = excluded.version, enabled = 1
            """,
            (user_id, pkg, ver),
        )
    return {"ok": True, "package_name": pkg, "version": ver}


def uninstall_skill(user_id: str, package_name: str) -> bool:
    with connect() as conn:
        cur = conn.execute(
            "DELETE FROM skill_installs WHERE user_id = ? AND package_name = ?",
            (user_id, package_name),
        )
        return cur.rowcount > 0


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
