from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import jwt
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


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

    main.DB_PATH = str(tmp_path / "test_runtime_e2e.db")
    main._init_db()
    return main


def _token(sub: str, scope: str = "benchmark:run") -> str:
    payload: dict[str, Any] = {
        "sub": sub,
        "iat": 1700000000,
        "exp": 4102444800,
        "iss": "test-issuer",
        "aud": "test-audience",
        "scope": scope,
    }
    return jwt.encode(payload, "test-secret-0123456789abcdef0123456789ab", algorithm="HS256")


def test_e2e_disconnect_recover_and_seq_consistent(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token = _token("e2e-user")
    session_id = "sess-e2e-recover"

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws1:
            ws1.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "/benchmark",
                        "resume_from_seq": None,
                        "auth_token": token,
                    }
                )
            )
            seen_seqs: list[int] = []
            for _ in range(25):
                frame = ws1.receive_json()
                if isinstance(frame.get("seq"), int):
                    seen_seqs.append(int(frame["seq"]))

        assert seen_seqs, "first connection should receive frames"
        last_seq_before_disconnect = seen_seqs[-1]

        with client.websocket_connect("/ws/agent") as ws2:
            ws2.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "",
                        "resume_from_seq": last_seq_before_disconnect - 5,
                        "auth_token": token,
                    }
                )
            )
            replayed: list[dict[str, Any]] = []
            for _ in range(7):
                replayed.append(ws2.receive_json())

    replay_seqs = [int(frame["seq"]) for frame in replayed if isinstance(frame.get("seq"), int)]
    assert replay_seqs, "reconnected flow should replay missed frames"
    assert replay_seqs == sorted(replay_seqs), "replayed frames must be monotonic"
    assert replay_seqs[0] > (last_seq_before_disconnect - 5), "resume must only include seq > resume_from_seq"


def test_e2e_cross_connection_replay_same_session(tmp_path: Path):
    main = _load_main_module(tmp_path)
    token = _token("e2e-user-2")
    session_id = "sess-e2e-cross-connection"

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws_seed:
            ws_seed.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "hello",
                        "resume_from_seq": None,
                        "auth_token": token,
                    }
                )
            )
            seeded: list[dict[str, Any]] = []
            while True:
                try:
                    seeded.append(ws_seed.receive_json())
                except WebSocketDisconnect:
                    break

        assert seeded, "seed connection should produce at least one frame"

        max_seed_seq = max(int(frame["seq"]) for frame in seeded if isinstance(frame.get("seq"), int))

        with client.websocket_connect("/ws/agent") as ws_resume:
            ws_resume.send_text(
                json.dumps(
                    {
                        "session_id": session_id,
                        "message": "",
                        "resume_from_seq": -1,
                        "auth_token": token,
                    }
                )
            )
            replayed: list[dict[str, Any]] = []
            while True:
                try:
                    replayed.append(ws_resume.receive_json())
                except WebSocketDisconnect:
                    break

    replay_seqs = [int(frame["seq"]) for frame in replayed if isinstance(frame.get("seq"), int)]
    assert replay_seqs, "cross-connection replay should return historical frames"
    assert max(replay_seqs) >= max_seed_seq
