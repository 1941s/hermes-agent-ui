from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import (
        clarify_metrics,
        derive_optimization_candidate,
        get_runtime_policy_rules,
        list_optimization_events,
        metrics_summary,
        overview_metrics,
        apply_optimization_changes,
        timeseries_metrics,
        tool_latency_metrics,
        tools_top_metrics,
        trace_events,
    )
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import (  # type: ignore
        clarify_metrics,
        derive_optimization_candidate,
        get_runtime_policy_rules,
        list_optimization_events,
        metrics_summary,
        overview_metrics,
        apply_optimization_changes,
        timeseries_metrics,
        tool_latency_metrics,
        tools_top_metrics,
        trace_events,
    )

router = APIRouter(prefix="/insights", tags=["insights"])


class DeriveOptimizationRequest(BaseModel):
    platform: str = "windows"
    auto_apply: bool = False


class ApplyOptimizationRequest(BaseModel):
    removed: list[str] = Field(default_factory=list)
    added: list[str] = Field(default_factory=list)
    rationale: str | None = None
    session_id: str | None = None
    event_id: int | None = None


@router.get("/optimization-events")
async def optimization_events(
    current_user: AuthContext = Depends(get_current_user),
    limit: int = 50,
) -> JSONResponse:
    events = list_optimization_events(current_user.user_id, limit=limit)
    return JSONResponse({"items": events})


@router.get("/optimization-policy")
async def optimization_policy(
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    rules = get_runtime_policy_rules(current_user.user_id)
    return JSONResponse({"rules": rules, "total": len(rules)})


@router.post("/optimization-derive")
async def optimization_derive(
    payload: DeriveOptimizationRequest,
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    candidate = derive_optimization_candidate(current_user.user_id, platform=payload.platform)
    has_changes = bool(candidate.get("added") or candidate.get("removed"))
    if payload.auto_apply and has_changes:
        applied = apply_optimization_changes(
            current_user.user_id,
            removed=candidate.get("removed", []),
            added=candidate.get("added", []),
            rationale=candidate.get("rationale"),
            session_id=candidate.get("session_id"),
        )
        return JSONResponse({"candidate": candidate, "applied": applied, "auto_applied": True, "has_changes": has_changes})
    return JSONResponse({"candidate": candidate, "auto_applied": False, "has_changes": has_changes})


@router.post("/optimization-apply")
async def optimization_apply(
    payload: ApplyOptimizationRequest,
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    removed = payload.removed
    added = payload.added
    rationale = payload.rationale
    session_id = payload.session_id
    if payload.event_id is not None:
        events = list_optimization_events(current_user.user_id, limit=200)
        target = next((ev for ev in events if int(ev.get("id", -1)) == payload.event_id), None)
        if target:
            removed = list(target.get("removed") or [])
            added = list(target.get("added") or [])
            rationale = target.get("rationale") or rationale
            session_id = target.get("session_id") or session_id
    if not removed and not added:
        raise HTTPException(status_code=400, detail="EMPTY_OPTIMIZATION_CHANGES")
    applied = apply_optimization_changes(
        current_user.user_id,
        removed=removed,
        added=added,
        rationale=rationale,
        session_id=session_id,
    )
    return JSONResponse({"ok": True, "applied": applied})


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
