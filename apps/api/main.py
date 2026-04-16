from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

# 配置文件加载
_api_dir = Path(__file__).resolve().parent
_repo_root = _api_dir.parent.parent
load_dotenv(_repo_root / ".env")
load_dotenv(_api_dir / ".env", override=True)

import asyncio
import json
import logging
import os
import queue
import sqlite3
import threading
import urllib.error
import urllib.request
from contextlib import suppress
from dataclasses import dataclass
from threading import Thread
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

try:
    from .auth_dependency import (
        SCOPE_ADMIN_STATS_READ,
        SCOPE_BENCHMARK_RUN,
        AuthContext,
        get_current_user,
        require_scope,
    )
    from .config import SETTINGS
    from .prompt_service import PromptService
    from .routers import insights as insights_router
    from .routers import orchestration as orchestration_router
    from .routers import skills as skills_router
    from .schema import (
        ErrorFrame,
        ErrorPayload,
        FrameType,
        ArtifactFrame,
        ArtifactPayload,
        HeartbeatFrame,
        HeartbeatPayload,
        MetaFrame,
        MetaPayload,
        OptimizationFrame,
        OptimizationPayload,
        ResponseFrame,
        ResponsePayload,
        StatusFrame,
        StatusPayload,
        SubagentFrame,
        SubagentPayload,
        ThoughtFrame,
        ThoughtPayload,
        ToolCallFrame,
        ToolCallPayload,
        WsRequest,
    )
except ImportError:
    from auth_dependency import (  # type: ignore
        SCOPE_ADMIN_STATS_READ,
        SCOPE_BENCHMARK_RUN,
        AuthContext,
        get_current_user,
        require_scope,
    )
    from config import SETTINGS  # type: ignore
    from prompt_service import PromptService  # type: ignore
    from routers import insights as insights_router  # type: ignore
    from routers import orchestration as orchestration_router  # type: ignore
    from routers import skills as skills_router  # type: ignore
    from schema import (  # type: ignore
        ErrorFrame,
        ErrorPayload,
        FrameType,
        ArtifactFrame,
        ArtifactPayload,
        HeartbeatFrame,
        HeartbeatPayload,
        MetaFrame,
        MetaPayload,
        OptimizationFrame,
        OptimizationPayload,
        ResponseFrame,
        ResponsePayload,
        StatusFrame,
        StatusPayload,
        SubagentFrame,
        SubagentPayload,
        ThoughtFrame,
        ThoughtPayload,
        ToolCallFrame,
        ToolCallPayload,
        WsRequest,
    )

LOGGER = logging.getLogger("hermes.api")
logging.basicConfig(level=logging.INFO)
DB_PATH = os.getenv("HERMES_UI_DB_PATH", os.path.join(os.path.dirname(__file__), "runtime.db"))
MAX_SESSION_FRAMES = SETTINGS.max_session_frames
REPLAY_RETENTION_HOURS = SETTINGS.replay_retention_hours
MAX_ARTIFACT_CHARS = SETTINGS.max_artifact_chars
MAX_HTML_SRCDOC_CHARS = SETTINGS.max_html_srcdoc_chars
MAX_REPLAY_FRAMES = SETTINGS.max_replay_frames
RUNTIME_COUNTERS: dict[str, int] = {
    "replay_hits": 0,
    "replay_misses": 0,
    "artifact_truncated": 0,
    "artifact_html_blocked": 0,
    "benchmark_sessions": 0,
}


class HermesBootstrapError(RuntimeError):
    pass


class NoopHermesService:
    async def run(self, request: WsRequest, *, user_id: str | None = None) -> AsyncIterator[StreamEvent]:
        _ = user_id
        if request.message.strip():
            yield StreamEvent(
                kind=FrameType.ERROR,
                payload={"code": "AGENT_UNAVAILABLE", "message": "Hermes agent backend is not available."},
            )
        return


_clarify_lock = threading.Lock()
# Session id → queue for user choice while `clarify` tool callback is blocked.
_clarify_pending: dict[str, queue.Queue[str]] = {}
CLARIFY_WAIT_SEC = int(os.getenv("HERMES_CLARIFY_TIMEOUT_SEC", "3600"))


def _explicit_openai_client_kwargs(request: WsRequest) -> dict[str, str]:
    """Take model provider credentials from request payload only (no env fallback)."""
    key = (request.model_api_key or "").strip()
    base = (request.model_base_url or "").strip().rstrip("/")
    if not key or not base:
        return {}
    provider = "anthropic" if "/anthropic" in base.lower() else "openai"
    return {"base_url": base, "api_key": key, "provider": provider}


@dataclass
class StreamEvent:
    kind: FrameType
    payload: dict[str, Any]


class HermesServiceWrapper:
    """
    Streams Hermes intermediate steps in real time.

    Priority order:
    1) LocalAgent.run async-generator (if available in runtime version)
    2) AIAgent callback-driven streaming (current mainline fallback)
    """

    def __init__(self) -> None:
        self._agent_class = self._resolve_agent_class()

    @staticmethod
    def _resolve_agent_class() -> Any:
        # Latest stable hermes-agent currently exposes AIAgent in run_agent.py.
        try:
            from run_agent import AIAgent  # type: ignore

            return AIAgent
        except Exception as exc:  # pragma: no cover
            raise HermesBootstrapError("Failed to import Hermes AIAgent.") from exc

    async def run(self, request: WsRequest, *, user_id: str | None = None) -> AsyncIterator[StreamEvent]:
        # Must not name this `queue` — it shadows `import queue` and breaks
        # `queue.Queue` / `queue.Empty` inside `clarify_callback`.
        event_out: asyncio.Queue[StreamEvent | None] = asyncio.Queue()
        loop = asyncio.get_running_loop()

        def emit(kind: FrameType, payload: dict[str, Any]) -> None:
            async def _put(ev: StreamEvent) -> None:
                await event_out.put(ev)

            fut = asyncio.run_coroutine_threadsafe(_put(StreamEvent(kind=kind, payload=payload)), loop)
            fut.result(timeout=120)

        def worker() -> None:
            def clamp_artifact_content(raw: str) -> tuple[str, bool, int]:
                original_length = len(raw)
                if original_length <= MAX_ARTIFACT_CHARS:
                    return raw, False, original_length
                suffix = "\n\n[TRUNCATED_BY_SERVER]"
                keep = max(0, MAX_ARTIFACT_CHARS - len(suffix))
                return raw[:keep] + suffix, True, original_length

            def sanitize_html_artifact(raw: str) -> tuple[str, bool, str | None]:
                lowered = raw.lower()
                disallowed = ("<script", "<iframe", "<object", "<embed", "<meta", "<link")
                if any(tag in lowered for tag in disallowed):
                    return raw, True, "disallowed_html_tag"
                if len(raw) > MAX_HTML_SRCDOC_CHARS:
                    suffix = "\n\n[HTML_BLOCKED_TOO_LARGE]"
                    keep = max(0, MAX_HTML_SRCDOC_CHARS - len(suffix))
                    return raw[:keep] + suffix, True, "html_too_large"
                return raw, False, None

            def classify_artifact(content: str) -> tuple[str, str]:
                stripped = content.strip()
                if stripped.startswith("```") or "\n#" in stripped:
                    return ("markdown", "text/markdown")
                if stripped.startswith("{") or stripped.startswith("["):
                    return ("json", "application/json")
                if "<html" in stripped.lower() or stripped.lower().startswith("<!doctype"):
                    return ("html", "text/html")
                if stripped.startswith("http://") or stripped.startswith("https://"):
                    lower = stripped.lower()
                    if lower.endswith(".png") or lower.endswith(".jpg") or lower.endswith(".jpeg") or lower.endswith(".webp"):
                        return ("image_url", "text/uri-list")
                return ("text", "text/plain")

            # Callback contracts are aligned with run_agent.AIAgent.
            def reasoning_callback(text: str) -> None:
                if text:
                    emit(FrameType.THOUGHT, {"content": text, "source": "reasoning"})

            def tool_start_callback(tool_call_id: str, name: str, args: dict[str, Any]) -> None:
                emit(
                    FrameType.TOOL_CALL,
                    {
                        "tool_call_id": tool_call_id or str(uuid4()),
                        "name": name,
                        "args": args or {},
                        "result": None,
                    },
                )

            def tool_complete_callback(
                tool_call_id: str,
                name: str,
                args: dict[str, Any],
                result: str,
            ) -> None:
                emit(
                    FrameType.TOOL_CALL,
                    {
                        "tool_call_id": tool_call_id or str(uuid4()),
                        "name": name,
                        "args": args or {},
                        "result": result,
                    },
                )
                if user_id:
                    try:
                        try:
                            from .sidecar_store import increment_tool_metric
                        except ImportError:
                            from sidecar_store import increment_tool_metric  # type: ignore

                        err_like = isinstance(result, str) and (
                            result.strip().upper().startswith("ERROR")
                            or "traceback" in result.lower()
                        )
                        increment_tool_metric(user_id, name, success=not err_like)
                    except Exception:  # pragma: no cover
                        LOGGER.debug("increment_tool_metric failed", exc_info=True)
                result_text = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False)
                safe_content, truncated, original_length = clamp_artifact_content(result_text)
                artifact_type, mime = classify_artifact(result_text)
                html_blocked = False
                html_block_reason: str | None = None
                if artifact_type == "html":
                    safe_content, html_blocked, html_block_reason = sanitize_html_artifact(safe_content)
                emit(
                    FrameType.ARTIFACT,
                    {
                        "source_tool": name,
                        "artifact_type": artifact_type,
                        "mime": mime,
                        "content": safe_content,
                        "truncated": truncated,
                        "original_length": original_length,
                        "security_policy": {
                            "sandbox": "zero-privilege",
                            "allow": [],
                        },
                        "blocked": html_blocked,
                        "block_reason": html_block_reason,
                    },
                )
                if truncated:
                    RUNTIME_COUNTERS["artifact_truncated"] += 1
                if html_blocked:
                    RUNTIME_COUNTERS["artifact_html_blocked"] += 1

            def stream_delta_callback(text: str) -> None:
                if text:
                    emit(FrameType.RESPONSE, {"content": text, "role": "assistant", "final": False})

            def clarify_callback(question: str, choices: list[str] | None) -> str:
                sid = request.session_id
                with _clarify_lock:
                    if sid in _clarify_pending:
                        return json.dumps(
                            {"error": "Another clarify is already waiting for this session."},
                            ensure_ascii=False,
                        )
                    q: queue.Queue[str] = queue.Queue(maxsize=4)
                    _clarify_pending[sid] = q
                _ = (question, choices)
                try:
                    emit(
                        FrameType.STATUS,
                        {
                            "state": "waiting_clarify",
                            "message": "请在界面中点选一项以继续…",
                        },
                    )
                    if CLARIFY_WAIT_SEC <= 0:
                        pick = q.get()
                    else:
                        pick = q.get(timeout=float(CLARIFY_WAIT_SEC))
                    return pick
                except queue.Empty:
                    return json.dumps(
                        {"error": "Timed out waiting for clarify selection."},
                        ensure_ascii=False,
                    )
                finally:
                    with _clarify_lock:
                        _clarify_pending.pop(sid, None)

            try:
                model_name = (request.model_name or "").strip()
                if not model_name:
                    raise ValueError("model_name is required from UI settings.")
                agent_kw: dict[str, Any] = {
                    "model": model_name,
                    "reasoning_callback": reasoning_callback,
                    "tool_start_callback": tool_start_callback,
                    "tool_complete_callback": tool_complete_callback,
                    "stream_delta_callback": stream_delta_callback,
                    "clarify_callback": clarify_callback,
                    "platform": "web",
                    "quiet_mode": True,
                }
                agent_kw.update(_explicit_openai_client_kwargs(request))
                agent = self._agent_class(**agent_kw)
                result = agent.run_conversation(
                    user_message=request.message,
                    system_message=request.system_prompt,
                    conversation_history=[h.model_dump() for h in request.history],
                )
                final_text = result.get("final_response", "") if isinstance(result, dict) else str(result)
                emit(FrameType.RESPONSE, {"content": final_text, "role": "assistant", "final": True})
            except Exception as exc:
                emit(
                    FrameType.ERROR,
                    {"code": "AGENT_RUNTIME_ERROR", "message": str(exc), "detail": {"type": type(exc).__name__}},
                )
            finally:
                async def _end() -> None:
                    await event_out.put(None)

                try:
                    asyncio.run_coroutine_threadsafe(_end(), loop).result(timeout=30)
                except Exception:  # pragma: no cover
                    loop.call_soon_threadsafe(event_out.put_nowait, None)

        Thread(target=worker, daemon=True).start()

        while True:
            event = await event_out.get()
            if event is None:
                break
            yield event


app = FastAPI(title="Hermes Agent API", version="0.1.0")
app.include_router(insights_router.router)
app.include_router(skills_router.router)
app.include_router(orchestration_router.router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("HERMES_UI_SKIP_AGENT_BOOT", "0") == "1":
    service: Any = NoopHermesService()
else:
    service = HermesServiceWrapper()
prompt_service = PromptService()


class ModelConnectionTestRequest(BaseModel):
    model_base_url: str
    model_api_key: str


@app.on_event("startup")
async def on_startup() -> None:
    _init_db()


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"ok": True})


@app.post("/model/connection-test")
async def model_connection_test(payload: ModelConnectionTestRequest) -> JSONResponse:
    base = payload.model_base_url.strip().rstrip("/")
    key = payload.model_api_key.strip()
    if not base:
        return JSONResponse({"ok": False, "message": "model_base_url is required"})
    if not (base.startswith("https://") or base.startswith("http://")):
        return JSONResponse({"ok": False, "message": "model_base_url must start with http:// or https://"})
    if not key:
        return JSONResponse({"ok": False, "message": "model_api_key is required"})

    provider = "anthropic" if "/anthropic" in base.lower() else "openai"
    common_headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if provider == "anthropic":
        common_headers["x-api-key"] = key
        common_headers["anthropic-version"] = "2023-06-01"
    else:
        common_headers["Authorization"] = f"Bearer {key}"

    def _request(method: str, url: str, body: dict[str, Any] | None = None) -> tuple[bool, int, str]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, method=method, data=data, headers=common_headers)
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                return True, int(resp.status), "ok"
        except urllib.error.HTTPError as exc:
            msg = exc.reason if isinstance(exc.reason, str) else str(exc.reason)
            return False, int(exc.code), msg
        except urllib.error.URLError as exc:
            return False, 0, str(exc.reason)

    if provider == "anthropic":
        # Anthropic-compatible probe: /v1/messages.
        ok, status, detail = _request(
            "POST",
            f"{base}/v1/messages",
            {
                "model": "claude-3-5-haiku-latest",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}],
            },
        )
        if ok:
            return JSONResponse({"ok": True, "status": status, "message": "Anthropic provider connection is healthy."})
        if status in (401, 403):
            return JSONResponse(
                {
                    "ok": False,
                    "status": status,
                    "message": f"Anthropic authentication failed ({status} {detail}).",
                }
            )
        if status in (400, 404, 405, 422, 429) or status >= 500:
            return JSONResponse(
                {
                    "ok": True,
                    "status": status,
                    "message": "Anthropic endpoint is reachable; request was rejected due to model or payload constraints.",
                }
            )
        return JSONResponse(
            {
                "ok": False,
                "status": status,
                "message": f"Anthropic endpoint rejected credentials or path ({status} {detail}).",
            }
        )

    # OpenAI-compatible probe 1: most providers support /models.
    ok, status, detail = _request("GET", f"{base}/models")
    if ok:
        return JSONResponse({"ok": True, "status": status, "message": "Model provider connection is healthy."})
    if status in (401, 403):
        return JSONResponse({"ok": False, "status": status, "message": f"Provider authentication failed ({status} {detail})."})
    if status not in (404, 405):
        # Non-auth errors (e.g. 429/5xx) still indicate endpoint is reachable.
        reachable = status in (400, 422, 429) or status >= 500
        return JSONResponse(
            {
                "ok": reachable,
                "status": status,
                "message": "Model provider is reachable." if reachable else f"Provider rejected request ({status} {detail}).",
            }
        )

    # Probe 2: fallback for gateways that do not expose /models.
    ok2, status2, detail2 = _request(
        "POST",
        f"{base}/chat/completions",
        {
            "model": "qwen-plus",
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "temperature": 0,
        },
    )
    if ok2:
        return JSONResponse({"ok": True, "status": status2, "message": "Model provider connection is healthy."})
    if status2 in (401, 403):
        return JSONResponse({"ok": False, "status": status2, "message": f"Provider authentication failed ({status2} {detail2})."})
    if status2 in (400, 404, 405, 422, 429) or status2 >= 500:
        # 4xx like 400/422 may come from payload/model mismatch, but network + auth path is working.
        return JSONResponse(
            {
                "ok": True,
                "status": status2,
                "message": "Model provider endpoint is reachable; request was rejected due to payload or model constraints.",
            }
        )
    return JSONResponse({"ok": False, "status": status2, "message": f"Provider rejected credentials or endpoint ({status2} {detail2})."})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception) -> JSONResponse:
    LOGGER.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"error": "INTERNAL_SERVER_ERROR"})


def _normalize_error_event_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Hermes may emit `detail` as a list; ErrorPayload requires dict | None."""
    out = dict(payload)
    d = out.get("detail")
    if isinstance(d, list):
        out["detail"] = {"errors": d}
    elif isinstance(d, str):
        out["detail"] = {"message": d}
    elif d is not None and not isinstance(d, dict):
        out["detail"] = {"value": repr(d)}
    return out


def _to_ws_frame(
    session_id: str,
    trace_id: str,
    seq: int,
    event: StreamEvent,
) -> dict[str, Any]:
    if event.kind == FrameType.THOUGHT:
        frame = ThoughtFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ThoughtPayload(**event.payload),
        )
    elif event.kind == FrameType.TOOL_CALL:
        frame = ToolCallFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ToolCallPayload(**event.payload),
        )
    elif event.kind == FrameType.RESPONSE:
        frame = ResponseFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ResponsePayload(**event.payload),
        )
    elif event.kind == FrameType.ARTIFACT:
        frame = ArtifactFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ArtifactPayload(**event.payload),
        )
    elif event.kind == FrameType.ERROR:
        frame = ErrorFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ErrorPayload(**_normalize_error_event_payload(event.payload)),
        )
    elif event.kind == FrameType.OPTIMIZATION:
        frame = OptimizationFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=OptimizationPayload(**event.payload),
        )
    elif event.kind == FrameType.SUBAGENT:
        frame = SubagentFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=SubagentPayload(**event.payload),
        )
    elif event.kind == FrameType.META:
        frame = MetaFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=MetaPayload(**event.payload),
        )
    elif event.kind == FrameType.STATUS:
        frame = StatusFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=StatusPayload(**event.payload),
        )
    else:
        frame = StatusFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=StatusPayload(state="idle"),
        )
    return frame.model_dump(mode="json")


def _db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def _init_db() -> None:
    with _db_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ws_frames (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                frame_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ws_frames_session_seq ON ws_frames(session_id, seq)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_owners (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        try:
            from .sidecar_store import init_sidecar_tables, seed_demo_data
        except ImportError:
            from sidecar_store import init_sidecar_tables, seed_demo_data  # type: ignore

        init_sidecar_tables(conn)
        seed_demo_data(conn)


def _persist_frame(session_id: str, frame: dict[str, Any]) -> None:
    seq = int(frame.get("seq", -1))
    with _db_connect() as conn:
        conn.execute(
            "INSERT INTO ws_frames(session_id, seq, frame_json) VALUES (?, ?, ?)",
            (session_id, seq, json.dumps(frame, ensure_ascii=False)),
        )
        conn.execute(
            """
            DELETE FROM ws_frames
            WHERE session_id = ?
              AND id NOT IN (
                SELECT id FROM ws_frames
                WHERE session_id = ?
                ORDER BY seq DESC, id DESC
                LIMIT ?
              )
            """,
            (session_id, session_id, MAX_SESSION_FRAMES),
        )
        conn.execute(
            "DELETE FROM ws_frames WHERE created_at < datetime('now', ?)",
            (f"-{REPLAY_RETENTION_HOURS} hours",),
        )


def _load_frames_after_seq(session_id: str, resume_from_seq: int) -> list[dict[str, Any]]:
    with _db_connect() as conn:
        cursor = conn.execute(
            """
            SELECT frame_json
            FROM ws_frames
            WHERE session_id = ? AND seq > ?
            ORDER BY seq ASC, id ASC
            LIMIT ?
            """,
            (session_id, resume_from_seq, MAX_REPLAY_FRAMES),
        )
        rows = cursor.fetchall()
    frames: list[dict[str, Any]] = []
    for (frame_json,) in rows:
        try:
            frames.append(json.loads(frame_json))
        except json.JSONDecodeError:
            continue
    return frames


def _next_seq_for_session(session_id: str) -> int:
    with _db_connect() as conn:
        row = conn.execute(
            "SELECT COALESCE(MAX(seq), -1) FROM ws_frames WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    max_seq = int(row[0]) if row else -1
    return max_seq + 1


def _bind_or_verify_session_owner(session_id: str, user_id: str) -> bool:
    if not SETTINGS.auth_enabled:
        return True
    with _db_connect() as conn:
        row = conn.execute(
            "SELECT user_id FROM session_owners WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO session_owners(session_id, user_id) VALUES (?, ?)",
                (session_id, user_id),
            )
            return True
        return str(row[0]) == user_id


def _replay_stats_all() -> dict[str, Any]:
    with _db_connect() as conn:
        total_frames = int(conn.execute("SELECT COUNT(*) FROM ws_frames").fetchone()[0])
        total_sessions = int(conn.execute("SELECT COUNT(DISTINCT session_id) FROM ws_frames").fetchone()[0])
        oldest = conn.execute("SELECT MIN(created_at) FROM ws_frames").fetchone()[0]
        newest = conn.execute("SELECT MAX(created_at) FROM ws_frames").fetchone()[0]
        top_sessions_rows = conn.execute(
            """
            SELECT session_id, COUNT(*) AS frame_count, MAX(created_at) AS last_seen_at
            FROM ws_frames
            GROUP BY session_id
            ORDER BY last_seen_at DESC
            LIMIT 10
            """
        ).fetchall()
    top_sessions = [
        {
            "session_id": row[0],
            "frame_count": int(row[1]),
            "last_seen_at": row[2],
        }
        for row in top_sessions_rows
    ]
    return {
        "db_path": DB_PATH,
        "scope": "all",
        "total_frames": total_frames,
        "total_sessions": total_sessions,
        "oldest_frame_at": oldest,
        "newest_frame_at": newest,
        "top_sessions": top_sessions,
        "retention_hours": REPLAY_RETENTION_HOURS,
        "max_replay_frames": MAX_REPLAY_FRAMES,
        "max_session_frames": MAX_SESSION_FRAMES,
        "runtime_counters": RUNTIME_COUNTERS,
    }


def _replay_stats_for_user(user_id: str) -> dict[str, Any]:
    with _db_connect() as conn:
        total_frames = int(
            conn.execute(
                """
                SELECT COUNT(*)
                FROM ws_frames wf
                INNER JOIN session_owners so ON so.session_id = wf.session_id
                WHERE so.user_id = ?
                """,
                (user_id,),
            ).fetchone()[0]
        )
        total_sessions = int(
            conn.execute(
                "SELECT COUNT(*) FROM session_owners WHERE user_id = ?",
                (user_id,),
            ).fetchone()[0]
        )
        oldest = conn.execute(
            """
            SELECT MIN(wf.created_at)
            FROM ws_frames wf
            INNER JOIN session_owners so ON so.session_id = wf.session_id
            WHERE so.user_id = ?
            """,
            (user_id,),
        ).fetchone()[0]
        newest = conn.execute(
            """
            SELECT MAX(wf.created_at)
            FROM ws_frames wf
            INNER JOIN session_owners so ON so.session_id = wf.session_id
            WHERE so.user_id = ?
            """,
            (user_id,),
        ).fetchone()[0]
        top_sessions_rows = conn.execute(
            """
            SELECT wf.session_id, COUNT(*) AS frame_count, MAX(wf.created_at) AS last_seen_at
            FROM ws_frames wf
            INNER JOIN session_owners so ON so.session_id = wf.session_id
            WHERE so.user_id = ?
            GROUP BY wf.session_id
            ORDER BY last_seen_at DESC
            LIMIT 10
            """,
            (user_id,),
        ).fetchall()
    top_sessions = [
        {
            "session_id": row[0],
            "frame_count": int(row[1]),
            "last_seen_at": row[2],
        }
        for row in top_sessions_rows
    ]
    return {
        "scope": "user",
        "user_id": user_id,
        "total_frames": total_frames,
        "total_sessions": total_sessions,
        "oldest_frame_at": oldest,
        "newest_frame_at": newest,
        "top_sessions": top_sessions,
        "retention_hours": REPLAY_RETENTION_HOURS,
        "max_replay_frames": MAX_REPLAY_FRAMES,
        "max_session_frames": MAX_SESSION_FRAMES,
    }


@app.get("/replay/stats")
async def replay_stats(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    if SCOPE_ADMIN_STATS_READ in current_user.scopes:
        return JSONResponse(_replay_stats_all())
    return JSONResponse(_replay_stats_for_user(current_user.user_id))


@app.websocket("/ws/agent")
async def ws_agent(websocket: WebSocket) -> None:
    await websocket.accept()
    heartbeat_task: asyncio.Task[None] | None = None
    # Must not block on `service.run` while holding the only `receive_text()` — otherwise
    # `clarify_pick` can never be read and the clarify callback times out or deadlocks.
    incoming: asyncio.Queue[str | None] = asyncio.Queue()

    async def ws_reader() -> None:
        try:
            while True:
                await incoming.put(await websocket.receive_text())
        except WebSocketDisconnect:
            await incoming.put(None)
        except Exception:
            await incoming.put(None)

    reader_task = asyncio.create_task(ws_reader())

    async def send_heartbeat(session_id: str, trace_id: str) -> None:
        seq = 0
        while True:
            await asyncio.sleep(15)
            hb = HeartbeatFrame(
                session_id=session_id,
                trace_id=trace_id,
                seq=seq,
                payload=HeartbeatPayload(ping="ping"),
            )
            seq += 1
            await websocket.send_text(json.dumps(hb.model_dump(mode="json")))

    async def send_and_store(session_id: str, frame: dict[str, Any]) -> None:
        await websocket.send_text(json.dumps(frame))
        _persist_frame(session_id, frame)

    async def send_ws_error(session_id: str, code: str, message: str, detail: dict[str, Any] | None = None) -> None:
        frame = ErrorFrame(
            session_id=session_id,
            trace_id=str(uuid4()),
            seq=0,
            payload=ErrorPayload(code=code, message=message, detail=detail),
        )
        await websocket.send_text(json.dumps(frame.model_dump(mode="json")))

    async def consume_agent_stream(req: WsRequest, user_id: str, trace_id: str, seq: int) -> int:
        """Stream `service.run` while still dequeuing `clarify_pick` / control messages from `incoming`."""
        agen = service.run(req, user_id=user_id).__aiter__()
        ev_task = asyncio.create_task(agen.__anext__())
        while True:
            msg_task = asyncio.create_task(incoming.get())
            done, _ = await asyncio.wait({ev_task, msg_task}, return_when=asyncio.FIRST_COMPLETED)
            if ev_task in done:
                msg_task.cancel()
                with suppress(asyncio.CancelledError):
                    await msg_task
                try:
                    event = ev_task.result()
                except StopAsyncIteration:
                    break
                frame = _to_ws_frame(req.session_id, trace_id, seq, event)
                seq += 1
                await send_and_store(req.session_id, frame)
                ev_task = asyncio.create_task(agen.__anext__())
            else:
                raw_inc = msg_task.result()
                if raw_inc is None:
                    ev_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await ev_task
                    raise WebSocketDisconnect()
                try:
                    data = json.loads(raw_inc)
                except json.JSONDecodeError:
                    continue
                if isinstance(data, dict) and data.get("type") == "HEARTBEAT":
                    continue
                try:
                    req_inc = WsRequest.model_validate(data)
                except ValidationError:
                    continue
                pick = (req_inc.clarify_pick or "").strip()
                if not pick:
                    await send_ws_error(
                        req.session_id,
                        "AGENT_BUSY",
                        "Agent is still running; only clarify_pick is allowed until the turn completes.",
                    )
                    continue
                try:
                    auth_inc = get_current_user(auth_token=req_inc.auth_token, authorization=None)
                except HTTPException as http_exc:
                    detail = http_exc.detail
                    code = detail if isinstance(detail, str) else "AUTH_FAILED"
                    await send_ws_error(req_inc.session_id, code, "Authentication failed")
                    continue
                if auth_inc.user_id != user_id or req_inc.session_id != req.session_id:
                    await send_ws_error(req.session_id, "SESSION_FORBIDDEN", "Session mismatch for clarify_pick")
                    continue
                if not _bind_or_verify_session_owner(req_inc.session_id, auth_inc.user_id):
                    await send_ws_error(req.session_id, "SESSION_FORBIDDEN", "Session owner mismatch")
                    continue
                with _clarify_lock:
                    q = _clarify_pending.get(req.session_id)
                if q is None:
                    await send_ws_error(
                        req.session_id,
                        "NO_PENDING_CLARIFY",
                        "No clarify is waiting for this session.",
                    )
                    continue
                try:
                    q.put_nowait(pick)
                except queue.Full:
                    await send_ws_error(req.session_id, "CLARIFY_OVERFLOW", "Clarify queue full.")
                continue
        return seq

    async def run_benchmark_stream(session_id: str, trace_id: str, seq_start: int) -> int:
        seq = seq_start
        for i in range(600):
            thought = ThoughtFrame(
                session_id=session_id,
                trace_id=trace_id,
                seq=seq,
                payload=ThoughtPayload(content=f"benchmark-thought-{i}", source="benchmark"),
            ).model_dump(mode="json")
            await send_and_store(session_id, thought)
            seq += 1
            if i % 5 == 0:
                tool = ToolCallFrame(
                    session_id=session_id,
                    trace_id=trace_id,
                    seq=seq,
                    payload=ToolCallPayload(
                        tool_call_id=f"bench-tool-{i}",
                        name="benchmark_tool",
                        args={"index": i},
                        result=f"ok-{i}",
                    ),
                ).model_dump(mode="json")
                await send_and_store(session_id, tool)
                seq += 1
            if i % 20 == 0:
                await asyncio.sleep(0)
        done = ResponseFrame(
            session_id=session_id,
            trace_id=trace_id,
            seq=seq,
            payload=ResponsePayload(content="Benchmark stream complete.", role="assistant", final=True),
        ).model_dump(mode="json")
        await send_and_store(session_id, done)
        seq += 1
        return seq

    try:
        while True:
            raw = await incoming.get()
            if raw is None:
                break
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_ws_error("unknown", "BAD_JSON", "Invalid JSON body")
                continue

            if isinstance(data, dict) and data.get("type") == "HEARTBEAT":
                continue

            try:
                req = WsRequest.model_validate(data)
            except ValidationError as exc:
                sid = data.get("session_id", "unknown") if isinstance(data, dict) else "unknown"
                frame = ErrorFrame(
                    session_id=str(sid),
                    trace_id=str(uuid4()),
                    seq=0,
                    payload=ErrorPayload(
                        code="BAD_REQUEST",
                        message=prompt_service.render("errors/bad_request.j2"),
                        detail={"errors": exc.errors(include_url=False)},
                    ),
                )
                try:
                    await websocket.send_text(json.dumps(frame.model_dump(mode="json")))
                except (RuntimeError, WebSocketDisconnect):
                    pass
                continue

            try:
                auth_ctx = get_current_user(auth_token=req.auth_token, authorization=None)
                user_id = auth_ctx.user_id
            except HTTPException as http_exc:
                detail = http_exc.detail
                code = detail if isinstance(detail, str) else "AUTH_FAILED"
                await send_ws_error(req.session_id, code, "Authentication failed")
                return

            if not _bind_or_verify_session_owner(req.session_id, user_id):
                await send_ws_error(req.session_id, "SESSION_FORBIDDEN", "Session owner mismatch")
                return

            pick = (req.clarify_pick or "").strip()
            if pick:
                with _clarify_lock:
                    q = _clarify_pending.get(req.session_id)
                if q is None:
                    await send_ws_error(
                        req.session_id,
                        "NO_PENDING_CLARIFY",
                        "No clarify is waiting for this session.",
                    )
                    continue
                try:
                    q.put_nowait(pick)
                except queue.Full:
                    await send_ws_error(req.session_id, "CLARIFY_OVERFLOW", "Clarify queue full.")
                continue

            trace_id = str(uuid4())
            seq = _next_seq_for_session(req.session_id)

            if req.resume_from_seq is not None:
                replay_frames = _load_frames_after_seq(req.session_id, req.resume_from_seq)
                if replay_frames:
                    RUNTIME_COUNTERS["replay_hits"] += 1
                else:
                    RUNTIME_COUNTERS["replay_misses"] += 1
                for replay in replay_frames:
                    await websocket.send_text(json.dumps(replay))

                if not req.message.strip():
                    idle_frame = StatusFrame(
                        session_id=req.session_id,
                        trace_id=trace_id,
                        seq=seq,
                        payload=StatusPayload(
                            state="idle",
                            message=prompt_service.render("agent/replay_completed_status.j2"),
                        ),
                    ).model_dump(mode="json")
                    await websocket.send_text(json.dumps(idle_frame))
                    continue

            if req.message.strip().startswith("/benchmark"):
                try:
                    require_scope(auth_ctx, SCOPE_BENCHMARK_RUN)
                except HTTPException:
                    await send_ws_error(
                        req.session_id,
                        "FORBIDDEN_SCOPE",
                        "Missing required scope",
                        {"required_scope": SCOPE_BENCHMARK_RUN},
                    )
                    continue
                RUNTIME_COUNTERS["benchmark_sessions"] += 1
                await run_benchmark_stream(req.session_id, trace_id, seq)
                continue

            if req.message.strip():
                missing: list[str] = []
                if not (req.model_base_url or "").strip():
                    missing.append("model_base_url")
                if not (req.model_api_key or "").strip():
                    missing.append("model_api_key")
                if not (req.model_name or "").strip():
                    missing.append("model_name")
                if missing:
                    await send_ws_error(
                        req.session_id,
                        "MODEL_CONFIG_REQUIRED",
                        "Model API configuration is required from UI settings.",
                        {"missing_fields": missing},
                    )
                    continue

            if heartbeat_task is not None and not heartbeat_task.done():
                heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat_task
                heartbeat_task = None

            thinking_frame = StatusFrame(
                session_id=req.session_id,
                trace_id=trace_id,
                seq=seq,
                payload=StatusPayload(
                    state="thinking",
                    message=prompt_service.render("agent/think_status.j2"),
                ),
            ).model_dump(mode="json")
            await send_and_store(req.session_id, thinking_frame)
            seq += 1

            heartbeat_task = asyncio.create_task(send_heartbeat(req.session_id, trace_id))

            await consume_agent_stream(req, user_id, trace_id, seq)
    except WebSocketDisconnect:
        LOGGER.info("WebSocket disconnected.")
    except Exception as exc:
        LOGGER.exception("WebSocket handler error: %s", exc)
        frame = ErrorFrame(
            session_id="unknown",
            trace_id=str(uuid4()),
            seq=0,
            payload=ErrorPayload(
                code="WS_INTERNAL_ERROR",
                message=str(exc),
                detail={"exception_type": type(exc).__name__},
            ),
        )
        try:
            await websocket.send_text(json.dumps(frame.model_dump(mode="json")))
        except (RuntimeError, WebSocketDisconnect):
            pass
    finally:
        reader_task.cancel()
        with suppress(asyncio.CancelledError):
            await reader_task
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            with suppress(asyncio.CancelledError):
                await heartbeat_task
        with suppress(RuntimeError):
            await websocket.close()
