from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db_path: str
    max_session_frames: int
    replay_retention_hours: int
    max_artifact_chars: int
    max_html_srcdoc_chars: int
    max_replay_frames: int
    auth_enabled: bool
    jwt_secret: str
    jwt_issuer: str
    jwt_audience: str


def load_settings() -> Settings:
    return Settings(
        db_path=os.getenv("HERMES_UI_DB_PATH", os.path.join(os.path.dirname(__file__), "runtime.db")),
        max_session_frames=int(os.getenv("HERMES_UI_MAX_SESSION_FRAMES", "4000")),
        replay_retention_hours=int(os.getenv("HERMES_UI_REPLAY_RETENTION_HOURS", "24")),
        max_artifact_chars=int(os.getenv("HERMES_UI_MAX_ARTIFACT_CHARS", "20000")),
        max_html_srcdoc_chars=int(os.getenv("HERMES_UI_MAX_HTML_SRCDOC_CHARS", "12000")),
        max_replay_frames=int(os.getenv("HERMES_UI_MAX_REPLAY_FRAMES", "2000")),
        auth_enabled=os.getenv("HERMES_UI_AUTH_ENABLED", "1") == "1",
        jwt_secret=os.getenv("HERMES_UI_JWT_SECRET", "replace-me"),
        jwt_issuer=os.getenv("HERMES_UI_JWT_ISSUER", "hermes-ui"),
        jwt_audience=os.getenv("HERMES_UI_JWT_AUDIENCE", "hermes-web"),
    )


SETTINGS = load_settings()
