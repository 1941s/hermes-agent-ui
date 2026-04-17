from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

try:
    from ..auth_dependency import AuthContext, get_current_user
    from ..sidecar_store import (
        cleanup_shadow_catalog_versions,
        delete_catalog_package,
        dependency_graph_for_packages,
        install_skill,
        install_skill_from_hub,
        inspect_hub_skill,
        search_hub_skills,
        list_catalog_for_user,
        list_enabled_skills,
        list_installs,
        sandbox_run_stub,
        set_skill_enabled,
        uninstall_skill,
    )
except ImportError:
    from auth_dependency import AuthContext, get_current_user  # type: ignore
    from sidecar_store import (  # type: ignore
        cleanup_shadow_catalog_versions,
        delete_catalog_package,
        dependency_graph_for_packages,
        install_skill,
        install_skill_from_hub,
        inspect_hub_skill,
        search_hub_skills,
        list_catalog_for_user,
        list_enabled_skills,
        list_installs,
        sandbox_run_stub,
        set_skill_enabled,
        uninstall_skill,
    )

router = APIRouter(prefix="/skills", tags=["skills"])


class InstallBody(BaseModel):
    manifest: dict[str, Any]


class SandboxBody(BaseModel):
    code: str = Field(default="", max_length=200_000)


class ToggleEnabledBody(BaseModel):
    enabled: bool


class InstallHubBody(BaseModel):
    identifier: str = Field(min_length=1, max_length=200)


@router.get("/catalog")
async def catalog(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    return JSONResponse({"items": list_catalog_for_user(current_user.user_id)})


@router.get("/installed")
async def installed(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    return JSONResponse({"items": list_installs(current_user.user_id)})


@router.post("/install")
async def install(
    payload: dict[str, Any] = Body(...),
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    data = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    manifest = data.get("manifest") if isinstance(data, dict) else None
    if manifest is None and isinstance(data, dict) and isinstance(data.get("body"), dict):
        manifest = data["body"].get("manifest")
    body = InstallBody.model_validate({"manifest": manifest})
    result = install_skill(current_user.user_id, body.manifest)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail={"errors": result.get("errors")})
    return JSONResponse(result)


@router.post("/install-from-hub")
async def install_from_hub(
    payload: dict[str, Any] = Body(...),
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    data = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    identifier = data.get("identifier") if isinstance(data, dict) else None
    if identifier is None and isinstance(data, dict) and isinstance(data.get("body"), dict):
        identifier = data["body"].get("identifier")
    body = InstallHubBody.model_validate({"identifier": identifier})
    result = install_skill_from_hub(current_user.user_id, body.identifier)
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": result.get("error", "HUB_INSTALL_FAILED"),
                "stdout": result.get("stdout"),
                "stderr": result.get("stderr"),
                "hint": result.get("hint"),
                "identifier": body.identifier,
                "tried_identifiers": result.get("tried_identifiers"),
            },
        )
    return JSONResponse(result)


@router.get("/hub/search")
async def hub_search(
    q: str,
    limit: int = 20,
    offset: int = 0,
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    _ = current_user
    result = search_hub_skills(q, limit=limit, offset=offset)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "HUB_SEARCH_FAILED"))
    return JSONResponse(result)


@router.get("/hub/inspect")
async def hub_inspect(identifier: str, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    _ = current_user
    result = inspect_hub_skill(identifier)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "HUB_INSPECT_FAILED"))
    return JSONResponse(result)


@router.post("/catalog/cleanup-shadow-versions")
async def cleanup_catalog_shadow_versions(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    _ = current_user
    return JSONResponse(cleanup_shadow_catalog_versions())


@router.delete("/catalog/{package_name:path}")
async def delete_catalog_item(package_name: str, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    result = delete_catalog_package(current_user.user_id, package_name)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "DELETE_CATALOG_FAILED"))
    return JSONResponse(result)


@router.delete("/installed/{package_name:path}")
async def uninstall(package_name: str, current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    ok = uninstall_skill(current_user.user_id, package_name)
    if not ok:
        raise HTTPException(status_code=404, detail="NOT_INSTALLED")
    return JSONResponse({"ok": True})


@router.patch("/installed/{package_name:path}/enabled")
async def toggle_enabled(
    package_name: str,
    payload: dict[str, Any] = Body(...),
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    data = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    enabled = data.get("enabled") if isinstance(data, dict) else None
    if enabled is None and isinstance(data, dict) and isinstance(data.get("body"), dict):
        enabled = data["body"].get("enabled")
    body = ToggleEnabledBody.model_validate({"enabled": enabled})
    result = set_skill_enabled(current_user.user_id, package_name, body.enabled)
    if not result.get("ok"):
        raise HTTPException(status_code=404, detail=result.get("error", "NOT_INSTALLED"))
    return JSONResponse(result)


@router.get("/enabled")
async def enabled_skills(current_user: AuthContext = Depends(get_current_user)) -> JSONResponse:
    return JSONResponse({"items": list_enabled_skills(current_user.user_id)})


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
    payload: dict[str, Any] = Body(...),
    current_user: AuthContext = Depends(get_current_user),
) -> JSONResponse:
    _ = current_user
    data = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    code = data.get("code") if isinstance(data, dict) else None
    if code is None and isinstance(data, dict) and isinstance(data.get("body"), dict):
        code = data["body"].get("code")
    body = SandboxBody.model_validate({"code": code or ""})
    return JSONResponse(sandbox_run_stub(package_name, body.code))
