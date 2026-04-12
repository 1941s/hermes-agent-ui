from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import list_optimization_events, metrics_summary
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import list_optimization_events, metrics_summary  # type: ignore

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/optimization-events")
async def optimization_events(
    current_user: AuthContext = Depends(get_current_user),
    limit: int = 50,
) -> JSONResponse:
    events = list_optimization_events(current_user.user_id, limit=limit)
    return JSONResponse({"items": events})


@router.get("/metrics")
async def tool_metrics(
    current_user: AuthContext = Depends(get_current_user),
    days: int = 14,
) -> JSONResponse:
    return JSONResponse(metrics_summary(current_user.user_id, days=days))
