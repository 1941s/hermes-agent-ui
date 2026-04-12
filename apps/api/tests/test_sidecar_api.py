from __future__ import annotations

import json
import os
import sys
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
