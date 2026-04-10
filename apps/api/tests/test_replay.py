from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def _load_main_module(tmp_path: Path):
    api_dir = Path(__file__).resolve().parents[1]
    if str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))
    os.environ["HERMES_UI_SKIP_AGENT_BOOT"] = "1"
    os.environ["HERMES_UI_AUTH_ENABLED"] = "0"
    for module_name in ("main", "config", "auth_dependency"):
        if module_name in sys.modules:
            del sys.modules[module_name]
    import main  # type: ignore

    main.DB_PATH = str(tmp_path / "test_runtime.db")
    main._init_db()
    return main


def test_replay_only_request_returns_idle(tmp_path: Path):
    main = _load_main_module(tmp_path)
    session_id = "sess-replay-only"
    main._persist_frame(session_id, {"session_id": session_id, "seq": 3, "type": "STATUS", "payload": {"state": "thinking"}})
    main._persist_frame(session_id, {"session_id": session_id, "seq": 4, "type": "RESPONSE", "payload": {"content": "x"}})

    with TestClient(main.app) as client:
        with client.websocket_connect("/ws/agent") as ws:
            ws.send_text(json.dumps({"session_id": session_id, "message": "", "resume_from_seq": 3}))
            first = ws.receive_json()
            second = ws.receive_json()

    assert first["seq"] == 4
    assert second["type"] == "STATUS"
    assert second["payload"]["state"] == "idle"


def test_next_seq_progresses_after_replay(tmp_path: Path):
    main = _load_main_module(tmp_path)
    session_id = "sess-next-seq"
    main._persist_frame(session_id, {"session_id": session_id, "seq": 10, "type": "STATUS", "payload": {"state": "idle"}})
    next_seq = main._next_seq_for_session(session_id)
    assert next_seq == 11
