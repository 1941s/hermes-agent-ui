from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Header, HTTPException

try:
    from .config import Settings, load_settings
except ImportError:
    from config import Settings, load_settings  # type: ignore


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    scopes: set[str]
    claims: dict[str, Any]


SCOPE_ADMIN_STATS_READ = "admin:stats:read"
SCOPE_BENCHMARK_RUN = "benchmark:run"
SCOPE_INSIGHTS_READ = "insights:read"
SCOPE_SKILLS_READ = "skills:read"
SCOPE_SKILLS_WRITE = "skills:write"
SCOPE_ORCHESTRATION_READ = "orchestration:read"
SCOPE_SESSIONS_FORK = "sessions:fork"


def _parse_scopes(claims: dict[str, Any]) -> set[str]:
    scopes: set[str] = set()
    raw_scope = claims.get("scope")
    if isinstance(raw_scope, str):
        scopes.update(piece.strip() for piece in raw_scope.split(" ") if piece.strip())
    raw_scopes = claims.get("scopes")
    if isinstance(raw_scopes, list):
        scopes.update(str(piece).strip() for piece in raw_scopes if str(piece).strip())
    return scopes


def _decode_jwt(token: str, settings: Settings) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="AUTH_EXPIRED") from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="AUTH_INVALID") from exc


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="AUTH_MISSING")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="AUTH_INVALID")
    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="AUTH_MISSING")
    return token


def require_scope(auth_ctx: AuthContext, required_scope: str) -> None:
    if required_scope not in auth_ctx.scopes:
        raise HTTPException(status_code=403, detail="FORBIDDEN_SCOPE")


def get_current_user(
    auth_token: str | None = None,
    authorization: str | None = Header(default=None, alias="Authorization"),
    settings: Settings | None = None,
) -> AuthContext:
    runtime_settings = settings or load_settings()
    if not runtime_settings.auth_enabled:
        return AuthContext(user_id="anonymous", scopes=set(), claims={})

    token = auth_token
    if token is None:
        token = _extract_bearer_token(authorization)

    claims = _decode_jwt(token, runtime_settings)
    user_id = str(claims.get("sub", "")).strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="AUTH_INVALID")

    return AuthContext(user_id=user_id, scopes=_parse_scopes(claims), claims=claims)
