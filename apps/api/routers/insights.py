from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import (
        clarify_metrics,
        list_optimization_events,
        metrics_summary,
        overview_metrics,
        timeseries_metrics,
        tool_latency_metrics,
        tools_top_metrics,
        trace_events,
    )
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import (  # type: ignore
        clarify_metrics,
        list_optimization_events,
        metrics_summary,
        overview_metrics,
        timeseries_metrics,
        tool_latency_metrics,
        tools_top_metrics,
        trace_events,
    )

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


@router.get("/overview")
async def overview(
    current_user: AuthContext = Depends(get_current_user),
    window: str = "24h",
) -> JSONResponse:
    return JSONResponse(overview_metrics(current_user.user_id, window=window))


@router.get("/timeseries")
async def timeseries(
    current_user: AuthContext = Depends(get_current_user),
    window: str = "24h",
    bucket: str = "1h",
) -> JSONResponse:
    return JSONResponse(timeseries_metrics(current_user.user_id, window=window, bucket=bucket))


@router.get("/tools/top")
async def tools_top(
    current_user: AuthContext = Depends(get_current_user),
    window: str = "24h",
    sort: str = "calls",
    limit: int = 20,
) -> JSONResponse:
    return JSONResponse(tools_top_metrics(current_user.user_id, window=window, sort=sort, limit=limit))


@router.get("/tools/{tool_name}/latency")
async def tool_latency(
    tool_name: str,
    current_user: AuthContext = Depends(get_current_user),
    window: str = "24h",
) -> JSONResponse:
    return JSONResponse(tool_latency_metrics(current_user.user_id, tool_name=tool_name, window=window))


@router.get("/traces/{trace_id}")
async def trace_detail(
    trace_id: str,
    current_user: AuthContext = Depends(get_current_user),
    limit: int = 200,
    cursor: int | None = None,
) -> JSONResponse:
    return JSONResponse(trace_events(current_user.user_id, trace_id=trace_id, limit=limit, cursor=cursor))


@router.get("/clarify")
async def clarify(
    current_user: AuthContext = Depends(get_current_user),
    window: str = "24h",
) -> JSONResponse:
    return JSONResponse(clarify_metrics(current_user.user_id, window=window))
