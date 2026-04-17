from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import jwt
from fastapi.testclient import TestClient


def _load_main(tmp_path: Path):
    api_dir = Path(__file__).resolve().parents[1]
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))

    os.environ["HERMES_UI_SKIP_AGENT_BOOT"] = "1"
    os.environ["HERMES_UI_AUTH_ENABLED"] = "1"
    os.environ["HERMES_UI_JWT_SECRET"] = "test-secret-0123456789abcdef0123456789ab"
    os.environ["HERMES_UI_JWT_ISSUER"] = "test-issuer"
    os.environ["HERMES_UI_JWT_AUDIENCE"] = "test-audience"

    for module_name in ("main", "config", "auth_dependency"):
        if module_name in sys.modules:
            del sys.modules[module_name]
    import main  # type: ignore

    main.DB_PATH = str(tmp_path / "sidecar_api.db")
    main._init_db()
    return main


def _token(sub: str = "u-sidecar") -> str:
    payload = {
        "sub": sub,
        "iat": 1700000000,
        "exp": 4102444800,
        "iss": "test-issuer",
        "aud": "test-audience",
    }
    return jwt.encode(
        payload,
        "test-secret-0123456789abcdef0123456789ab",
        algorithm="HS256",
    )


def test_insights_optimization_events(tmp_path: Path):
    main = _load_main(tmp_path)
    with TestClient(main.app) as client:
        r = client.get(
            "/insights/optimization-events",
            headers={"Authorization": f"Bearer {_token()}"},
        )
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert isinstance(data["items"], list)
    assert len(data["items"]) >= 1


def test_skills_catalog_and_install_validation(tmp_path: Path):
    main = _load_main(tmp_path)
    with TestClient(main.app) as client:
        c = client.get(
            "/skills/catalog",
            headers={"Authorization": f"Bearer {_token()}"},
        )
    assert c.status_code == 200
    catalog = c.json()["items"]
    assert catalog, "catalog should not be empty"
    first = catalog[0]
    assert "description" in first
    assert "tags" in first
    assert "installed" in first

    bad = {"specVersion": "1.0.0", "package": {"name": "bad"}, "version": "not-semver", "entrypoints": {}}
    with TestClient(main.app) as client:
        r = client.post(
            "/skills/install",
            headers={"Authorization": f"Bearer {_token()}"},
            json={"manifest": bad},
        )
    assert r.status_code in (400, 422)


def test_orchestration_graph_demo_session(tmp_path: Path):
    main = _load_main(tmp_path)
    with TestClient(main.app) as client:
        r = client.get(
            "/orchestration/sessions/demo-orchestration-session/graph/revisions",
            headers={"Authorization": f"Bearer {_token()}"},
        )
    assert r.status_code == 200
    revs = r.json()
    assert revs["max_revision"] == 3

    with TestClient(main.app) as client:
        r2 = client.get(
            "/orchestration/sessions/demo-orchestration-session/graph?revision=3",
            headers={"Authorization": f"Bearer {_token()}"},
        )
    assert r2.status_code == 200
    body = r2.json()
    assert body["graph"]["nodes"]


def test_dependency_graph_edges(tmp_path: Path):
    main = _load_main(tmp_path)
    with TestClient(main.app) as client:
        r = client.get(
            "/skills/dependency-graph",
            params={"packages": "hermes-ui/demo-skill"},
            headers={"Authorization": f"Bearer {_token()}"},
        )
    assert r.status_code == 200
    data = r.json()
    assert data["edges"], data
    assert any(e["target"] == "hermes-ui/base-tool" for e in data["edges"])


def test_skills_install_uninstall_consistency(tmp_path: Path):
    main = _load_main(tmp_path)
    os.environ["HERMES_UI_RUNTIME_SKILLS_DIR"] = str(tmp_path / "runtime_skills")
    token = _token("u-skill-flow")
    manifest = {
        "specVersion": "1.0.0",
        "package": {
            "name": "hermes-ui/test-skill",
            "displayName": "Test Skill",
            "description": "Test install flow",
        },
        "version": "1.0.0",
        "entrypoints": {"default": "skill.py"},
        "permissions": [],
        "dependencies": {},
        "meta": {"license": "MIT", "tags": ["test"], "authors": [{"name": "Hermes UI"}]},
    }
    with TestClient(main.app) as client:
        i = client.post(
            "/skills/install",
            headers={"Authorization": f"Bearer {token}"},
            json={"payload": {"manifest": manifest}},
        )
        assert i.status_code == 200
        runtime_root = Path(os.environ["HERMES_UI_RUNTIME_SKILLS_DIR"])
        skill_dir = runtime_root / "hermes-ui" / "test-skill"
        assert skill_dir.exists()
        skill_md = skill_dir / "SKILL.md"
        assert skill_md.exists()
        assert "name: hermes-ui/test-skill" in skill_md.read_text(encoding="utf-8")
        assert (skill_dir / "manifest.json").exists()
        items = client.get(
            "/skills/installed",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["items"]
        assert any(row["package_name"] == "hermes-ui/test-skill" for row in items)
        row = next(row for row in items if row["package_name"] == "hermes-ui/test-skill")
        assert "sync_status" in row
        assert row["enabled"] == 1
        t = client.patch(
            "/skills/installed/hermes-ui%2Ftest-skill/enabled",
            headers={"Authorization": f"Bearer {token}"},
            json={"payload": {"enabled": False}},
        )
        assert t.status_code == 200
        assert not skill_dir.exists()
        items_disabled = client.get(
            "/skills/installed",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["items"]
        row_disabled = next(row for row in items_disabled if row["package_name"] == "hermes-ui/test-skill")
        assert row_disabled["enabled"] == 0
        d = client.delete(
            "/skills/installed/hermes-ui%2Ftest-skill",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert d.status_code == 200
        items2 = client.get(
            "/skills/installed",
            headers={"Authorization": f"Bearer {token}"},
        ).json()["items"]
        assert all(row["package_name"] != "hermes-ui/test-skill" for row in items2)


def _seed_obs(main, user_id: str = "u-sidecar") -> None:
    try:
        from sidecar_store import process_observability_event  # type: ignore
    except ImportError:
        from .sidecar_store import process_observability_event  # type: ignore
    now = datetime.now(timezone.utc).isoformat()
    process_observability_event(
        {
            "kind": "turn_start",
            "trace_id": "trace-demo-1",
            "user_id": user_id,
            "session_id": "sess-demo-1",
            "started_at": now,
            "model_provider": "openai",
            "model_name": "demo-model",
        }
    )
    process_observability_event(
        {
            "kind": "tool_start",
            "trace_id": "trace-demo-1",
            "user_id": user_id,
            "session_id": "sess-demo-1",
            "tool_call_id": "tool-1",
            "tool_name": "web_search",
            "started_at": now,
        }
    )
    process_observability_event(
        {
            "kind": "tool_complete",
            "trace_id": "trace-demo-1",
            "tool_call_id": "tool-1",
            "latency_ms": 120,
            "success": True,
            "completed_at": now,
        }
    )
    process_observability_event(
        {
            "kind": "frame",
            "trace_id": "trace-demo-1",
            "user_id": user_id,
            "session_id": "sess-demo-1",
            "created_at": now,
            "frame": {"type": "THOUGHT", "seq": 1, "payload": {"content": "x"}},
        }
    )
    process_observability_event(
        {
            "kind": "clarify_start",
            "trace_id": "trace-demo-1",
            "user_id": user_id,
            "session_id": "sess-demo-1",
            "wait_started_at": now,
        }
    )
    process_observability_event(
        {
            "kind": "clarify_resolve",
            "trace_id": "trace-demo-1",
            "picked_at": now,
            "wait_ms": 200,
            "picked_value": "yes",
            "timed_out": False,
        }
    )
    process_observability_event(
        {
            "kind": "turn_end",
            "trace_id": "trace-demo-1",
            "ended_at": now,
            "duration_ms": 500,
            "status": "completed",
            "total_frames": 3,
            "response_chunks": 1,
            "error_count": 0,
            "tool_calls": 1,
        }
    )


def test_insights_v2_endpoints(tmp_path: Path):
    main = _load_main(tmp_path)
    _seed_obs(main)
    auth = {"Authorization": f"Bearer {_token()}"}
    with TestClient(main.app) as client:
        r1 = client.get("/insights/overview?window=24h", headers=auth)
        assert r1.status_code == 200
        body1 = r1.json()
        assert "turns_total" in body1
        r2 = client.get("/insights/timeseries?window=24h&bucket=1h", headers=auth)
        assert r2.status_code == 200
        assert isinstance(r2.json().get("series"), list)
        r3 = client.get("/insights/tools/top?window=24h&sort=calls&limit=5", headers=auth)
        assert r3.status_code == 200
        assert isinstance(r3.json().get("items"), list)
        r4 = client.get("/insights/tools/web_search/latency?window=24h", headers=auth)
        assert r4.status_code == 200
        assert "p95_ms" in r4.json()
        r5 = client.get("/insights/traces/trace-demo-1?limit=20", headers=auth)
        assert r5.status_code == 200
        assert "items" in r5.json()
        r6 = client.get("/insights/clarify?window=24h", headers=auth)
        assert r6.status_code == 200
        assert "total" in r6.json()
