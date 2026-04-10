from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import jwt
from fastapi.testclient import TestClient


def _load_main_module(tmp_path: Path):
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

    main.DB_PATH = str(tmp_path / "test_runtime_auth.db")
    main._init_db()
    return main


def _token(
    sub: str,
    *,
    issuer: str = "test-issuer",
    audience: str = "test-audience",
    secret: str = "test-secret-0123456789abcdef0123456789ab",
    scope: str | None = None,
) -> str:
    payload: dict[str, Any] = {"sub": sub, "iat": 1700000000, "exp": 4102444800, "iss": issuer, "aud": audience}
    if scope:
        payload["scope"] = scope
    return jwt.encode(payload, secret, algorithm="HS256")


def test_ws_rejects_missing_token(tmp_path: Path):
    main = _load_main_module(tmp_path)
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(json.dumps({"session_id": "sess-auth-1", "message": "hello"}))
            frame = ws.receive_json()

    assert frame["type"] == "ERROR"
    assert frame["payload"]["code"] == "AUTH_MISSING"


def test_ws_rejects_invalid_token(tmp_path: Path):
    main = _load_main_module(tmp_path)
    bad_token = _token("user-1", secret="wrong-secret-0123456789abcdef0123456789")
    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(json.dumps({"session_id": "sess-auth-2", "message": "hello", "auth_token": bad_token}))
            frame = ws.receive_json()

    assert frame["type"] == "ERROR"
    assert frame["payload"]["code"] == "AUTH_INVALID"


def test_ws_rejects_session_owner_mismatch(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token_user_a = _token("user-a")
    token_user_b = _token("user-b")
    session_id = "sess-owner-1"

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws_a:
            ws_a.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "",
                        "resume_from_seq": 0,
                        "auth_token": token_user_a,
                    }
                )
            )
            _ = ws_a.receive_json()

        with client.websocket_connect("/ws/agent") as ws_b:
            ws_b.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "",
                        "resume_from_seq": 0,
                        "auth_token": token_user_b,
                    }
                )
            )
            frame = ws_b.receive_json()

    assert frame["type"] == "ERROR"
    assert frame["payload"]["code"] == "SESSION_FORBIDDEN"


def test_ws_allows_same_owner_replay_and_returns_idle(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token_user = _token("user-z")
    session_id = "sess-owner-2"
    main._persist_frame(session_id, {"session_id": session_id, "seq": 0, "type": "STATUS", "payload": {"state": "thinking"}})

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "",
                        "resume_from_seq": -1,
                        "auth_token": token_user,
                    }
                )
            )
            first = ws.receive_json()
            second = ws.receive_json()

    assert first["seq"] == 0
    assert second["type"] == "STATUS"
    assert second["payload"]["state"] == "idle"


def test_replay_stats_requires_auth(tmp_path: Path):
    main = _load_main_module(tmp_path)
    with TestClient(main.app) as client:
        response = client.get("/replay/stats")
    assert response.status_code == 401


def test_replay_stats_user_scope_default(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token_user = _token("stats-user")
    session_id = "sess-stats-user"
    main._bind_or_verify_session_owner(session_id, "stats-user")
    main._persist_frame(session_id, {"session_id": session_id, "seq": 0, "type": "STATUS", "payload": {"state": "idle"}})

    with TestClient(main.app) as client:
        response = client.get("/replay/stats", headers={"Authorization": f"Bearer {token_user}"})
    body = response.json()
    assert response.status_code == 200
    assert body["scope"] == "user"
    assert body["user_id"] == "stats-user"
    assert body["total_sessions"] >= 1
    assert "db_path" not in body
    assert "runtime_counters" not in body


def test_replay_stats_admin_scope_can_read_all(tmp_path: Path):
    main = _load_main_module(tmp_path)
    admin_token = jwt.encode(
        {
            "sub": "admin-user",
            "iat": 1700000000,
            "exp": 4102444800,
            "iss": "test-issuer",
            "aud": "test-audience",
            "scope": "admin:stats:read",
        },
        "test-secret-0123456789abcdef0123456789ab",
        algorithm="HS256",
    )

    with TestClient(main.app) as client:
        response = client.get("/replay/stats", headers={"Authorization": f"Bearer {admin_token}"})
    body = response.json()
    assert response.status_code == 200
    assert body["scope"] == "all"
    assert "db_path" in body
    assert "runtime_counters" in body


def test_benchmark_requires_scope(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token_user = _token("bench-user")

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(
                json.dumps(
                    {
                        "session_id": "sess-bench-1",
                        "message": "/benchmark",
                        "auth_token": token_user,
                    }
                )
            )
            frame = ws.receive_json()

    assert frame["type"] == "ERROR"
    assert frame["payload"]["code"] == "FORBIDDEN_SCOPE"


def test_benchmark_allowed_with_scope(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token_user = _token("bench-user", scope="benchmark:run")

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(
                json.dumps(
                    {
                        "session_id": "sess-bench-2",
                        "message": "/benchmark",
                        "auth_token": token_user,
                    }
                )
            )
            first = ws.receive_json()

    assert first["type"] in {"THOUGHT", "TOOL_CALL", "RESPONSE"}
