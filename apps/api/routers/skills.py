from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import (
        dependency_graph_for_packages,
        install_skill,
        list_catalog,
        list_installs,
        sandbox_run_stub,
        uninstall_skill,
    )
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import (  # type: ignore
        dependency_graph_for_packages,
        install_skill,
        list_catalog,
        list_installs,
        sandbox_run_stub,
        uninstall_skill,
    )

router = APIRouter(prefix="/skills", tags=["skills"])


class InstallBody(BaseModel):
    manifest: dict[str, Any]


class SandboxBody(BaseModel):
    code: str = Field(default="", max_length=200_000)


@router.get("/catalog")
async def catalog(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    _ = current_user
    return JSONResponse({"items": list_catalog()})


@router.get("/installed")
async def installed(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    return JSONResponse({"items": list_installs(current_user.user_id)})


@router.post("/install")
async def install(body: InstallBody, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    result = install_skill(current_user.user_id, body.manifest)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail={"errors": result.get("errors")})
    return JSONResponse(result)


@router.delete("/installed/{package_name:path}")
async def uninstall(package_name: str, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    ok = uninstall_skill(current_user.user_id, package_name)
    if not ok:
        raise HTTPException(status_code=404, detail="NOT_INSTALLED")
    return JSONResponse({"ok": True})


@router.get("/dependency-graph")
async def dependency_graph(
    packages: str,
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    _ = current_user
    names = [p.strip() for p in packages.split(",") if p.strip()]
    return JSONResponse(dependency_graph_for_packages(names))


@router.post("/{package_name:path}/sandbox-run")
async def sandbox_run(
    package_name: str,
    body: SandboxBody,
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    _ = current_user
    return JSONResponse(sandbox_run_stub(package_name, body.code))
