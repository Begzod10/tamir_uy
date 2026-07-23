"""API endpoints for Meshy image-to-3D conversion integration."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.services.meshy import MeshyError, get_meshy_client

router = APIRouter(prefix="/api/meshy", tags=["meshy"])


class ConvertImageTo3DRequest(BaseModel):
    """Request to convert room image to 3D model."""

    image_url: str = Field(..., description="Public URL to room/object image")
    enable_pbr: bool = Field(
        True, description="Enable physically-based rendering textures"
    )
    wait_for_completion: bool = Field(
        False,
        description="If true, wait for completion (async). If false, return task_id immediately.",
    )


class ConvertImageTo3DResponse(BaseModel):
    """Response with 3D conversion task info."""

    task_id: str
    status: str  # 'RUNNING' | 'SUCCEEDED' | 'FAILED'
    model_urls: dict[str, str] = Field(default_factory=dict)
    message: str = ""


class TaskStatusResponse(BaseModel):
    """Response with task polling info."""

    task_id: str
    status: str
    model_urls: dict[str, str] = Field(default_factory=dict)
    error: str = ""


@router.post("/convert", response_model=ConvertImageTo3DResponse)
async def convert_image_to_3d(
    req: ConvertImageTo3DRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> ConvertImageTo3DResponse:
    """Convert room image to 3D model using Meshy AI.

    Takes a public URL to a room/furniture image and initiates 3D model generation.
    Returns task info for polling status.

    Args:
        req: Image URL and options
        user: Authenticated user

    Returns:
        Task ID and initial status for polling

    Raises:
        HTTPException: If image URL is invalid or Meshy API fails
    """
    if not req.image_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="image_url is required",
        )

    try:
        meshy = get_meshy_client()
        result = await meshy.convert_image_to_3d(
            image_url=req.image_url,
            wait=req.wait_for_completion,
            enable_pbr=req.enable_pbr,
        )

        return ConvertImageTo3DResponse(
            task_id=result.get("task_id", ""),
            status=result.get("status", "RUNNING"),
            model_urls=result.get("model_urls", {}),
            message="Conversion initiated" if result.get("status") == "RUNNING"
            else "Conversion completed",
        )

    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e


@router.get("/task/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
) -> TaskStatusResponse:
    """Poll task status.

    Args:
        task_id: Meshy task ID from convert endpoint
        user: Authenticated user

    Returns:
        Current task status and model URLs if ready

    Raises:
        HTTPException: If task not found or API error
    """
    try:
        meshy = get_meshy_client()
        task = await meshy.get_task(task_id)

        return TaskStatusResponse(
            task_id=task_id,
            status=task.get("status", "UNKNOWN"),
            model_urls=task.get("model_urls", {}),
        )

    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e


@router.post("/wait/{task_id}", response_model=ConvertImageTo3DResponse)
async def wait_for_task(
    task_id: str,
    user: Annotated[User, Depends(get_current_user)],
) -> ConvertImageTo3DResponse:
    """Wait for task completion (blocking up to 5 minutes).

    Args:
        task_id: Meshy task ID
        user: Authenticated user

    Returns:
        Completed task info with model download URLs

    Raises:
        HTTPException: If timeout or task failed
    """
    try:
        meshy = get_meshy_client()
        task = await meshy.wait_for_completion(task_id, max_polls=60, poll_interval=5.0)

        return ConvertImageTo3DResponse(
            task_id=task_id,
            status=task.get("status", "UNKNOWN"),
            model_urls=task.get("model_urls", {}),
            message="3D model ready for download"
            if task.get("status") == "SUCCEEDED"
            else task.get("error", "Unknown error"),
        )

    except TimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"Task did not complete in time: {str(e)}",
        ) from e
    except MeshyError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Meshy API error: {str(e)}",
        ) from e
