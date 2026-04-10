from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal, Union
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class ArtifactSecurityPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sandbox: Literal["zero-privilege"] = "zero-privilege"
    allow: list[str] = Field(default_factory=list)


class FrameType(str, Enum):
    THOUGHT = "THOUGHT"
    TOOL_CALL = "TOOL_CALL"
    ARTIFACT = "ARTIFACT"
    RESPONSE = "RESPONSE"
    HEARTBEAT = "HEARTBEAT"
    ERROR = "ERROR"
    STATUS = "STATUS"


class BaseFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: FrameType
    session_id: str
    trace_id: str = Field(default_factory=lambda: str(uuid4()))
    seq: int = 0
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ThoughtPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    content: str
    source: str = "reasoning"


class ToolCallPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    tool_call_id: str
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: str | None = None


class ResponsePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    content: str
    role: Literal["assistant", "tool", "system"] = "assistant"
    final: bool = False


class ArtifactPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    artifact_id: str = Field(default_factory=lambda: str(uuid4()))
    source_tool: str | None = None
    artifact_type: Literal["markdown", "json", "html", "text", "image_url"] = "text"
    mime: str = "text/plain"
    content: str
    security_policy: ArtifactSecurityPolicy = Field(default_factory=ArtifactSecurityPolicy)


class HeartbeatPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ping: Literal["ping", "pong"] = "ping"


class ErrorPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    code: str
    message: str
    detail: dict[str, Any] | None = None


class StatusPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    state: Literal["thinking", "responding", "idle", "disconnected"]
    message: str | None = None


class ThoughtFrame(BaseFrame):
    type: Literal[FrameType.THOUGHT] = FrameType.THOUGHT
    payload: ThoughtPayload


class ToolCallFrame(BaseFrame):
    type: Literal[FrameType.TOOL_CALL] = FrameType.TOOL_CALL
    payload: ToolCallPayload


class ResponseFrame(BaseFrame):
    type: Literal[FrameType.RESPONSE] = FrameType.RESPONSE
    payload: ResponsePayload


class ArtifactFrame(BaseFrame):
    type: Literal[FrameType.ARTIFACT] = FrameType.ARTIFACT
    payload: ArtifactPayload


class HeartbeatFrame(BaseFrame):
    type: Literal[FrameType.HEARTBEAT] = FrameType.HEARTBEAT
    payload: HeartbeatPayload


class ErrorFrame(BaseFrame):
    type: Literal[FrameType.ERROR] = FrameType.ERROR
    payload: ErrorPayload


class StatusFrame(BaseFrame):
    type: Literal[FrameType.STATUS] = FrameType.STATUS
    payload: StatusPayload


AgentFrame = Annotated[
    Union[
        ThoughtFrame,
        ToolCallFrame,
        ArtifactFrame,
        ResponseFrame,
        HeartbeatFrame,
        ErrorFrame,
        StatusFrame,
    ],
    Field(discriminator="type"),
]


class WsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    auth_token: str | None = None
    message: str = ""
    history: list[dict[str, Any]] = Field(default_factory=list)
    system_prompt: str | None = None
    resume_from_seq: int | None = None
