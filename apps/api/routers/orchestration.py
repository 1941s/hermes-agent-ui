from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import fork_session, get_task_graph, list_graph_revisions
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import fork_session, get_task_graph, list_graph_revisions  # type: ignore

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


class ForkBody(BaseModel):
    parent_session_id: str


@router.get("/sessions/{session_id}/graph")
async def task_graph(
    session_id: str,
    current_user: AuthContext = Depends(get_current_user),
    revision: int | None = None,
) -> JSONResponse:
    _ = current_user
    data = get_task_graph(session_id, revision)
    if data is None:
        raise HTTPException(status_code=404, detail="GRAPH_NOT_FOUND")
    return JSONResponse(data)


@router.get("/sessions/{session_id}/graph/revisions")
async def graph_revisions(session_id: str, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    _ = current_user
    return JSONResponse(list_graph_revisions(session_id))


@router.post("/sessions/fork")
async def fork(body: ForkBody, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    child = fork_session(current_user.user_id, body.parent_session_id)
    return JSONResponse({"child_session_id": child, "parent_session_id": body.parent_session_id})
