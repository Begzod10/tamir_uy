"""Meshy API integration for image-to-3D model conversion.

Handles task creation, polling, and model retrieval from Meshy AI.
Documentation: https://docs.meshy.ai/
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import structlog

from app.config import settings

log = structlog.get_logger(__name__)


class MeshyError(Exception):
    """Raised when Meshy API call fails."""

    pass


class MeshyClient:
    """Client for Meshy image-to-3D conversion API."""

    def __init__(self) -> None:
        self.api_key = settings.MESHY_API_KEY
        self.base_url = settings.MESHY_API_URL
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def image_to_3d(
        self,
        image_url: str,
        enable_pbr: bool = True,
        style: str = "realistic",
    ) -> dict[str, Any]:
        """Create image-to-3D task.

        Args:
            image_url: Public URL to the image
            enable_pbr: Enable physically-based rendering
            style: Output style ('realistic' or 'stylized')

        Returns:
            Task info with task_id, status, etc.

        Raises:
            MeshyError: If API call fails
        """
        if not self.api_key:
            raise MeshyError("MESHY_API_KEY not configured")

        payload = {
            "image_url": image_url,
            "enable_pbr": enable_pbr,
            "style": style,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/image-to-3d",
                    json=payload,
                    headers=self.headers,
                )
                response.raise_for_status()
                task = response.json()
                log.info("meshy_task_created", task_id=task.get("id"))
                return task
            except httpx.HTTPError as e:
                log.error("meshy_api_error", error=str(e), status=getattr(e.response, "status_code", None))
                raise MeshyError(f"Failed to create Meshy task: {e}") from e

    async def get_task(self, task_id: str) -> dict[str, Any]:
        """Poll task status.

        Args:
            task_id: Meshy task ID

        Returns:
            Task info including status, model URLs, etc.

        Raises:
            MeshyError: If API call fails
        """
        if not self.api_key:
            raise MeshyError("MESHY_API_KEY not configured")

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/image-to-3d/{task_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                log.error("meshy_poll_error", task_id=task_id, error=str(e))
                raise MeshyError(f"Failed to poll Meshy task {task_id}: {e}") from e

    async def wait_for_completion(
        self,
        task_id: str,
        max_polls: int = 60,
        poll_interval: float = 5.0,
    ) -> dict[str, Any]:
        """Poll until task completes or times out.

        Args:
            task_id: Meshy task ID
            max_polls: Maximum number of polls
            poll_interval: Seconds between polls

        Returns:
            Completed task info with model URLs

        Raises:
            MeshyError: If timeout or API error
            TimeoutError: If max_polls exceeded
        """
        for poll_num in range(max_polls):
            try:
                task = await self.get_task(task_id)
                status = task.get("status")

                log.info(
                    "meshy_poll",
                    task_id=task_id,
                    poll=poll_num + 1,
                    status=status,
                )

                if status == "SUCCEEDED":
                    log.info("meshy_completed", task_id=task_id)
                    return task

                if status == "FAILED":
                    error = task.get("error", "Unknown error")
                    log.error("meshy_failed", task_id=task_id, error=error)
                    raise MeshyError(f"Meshy task failed: {error}")

                if poll_num < max_polls - 1:
                    await asyncio.sleep(poll_interval)

            except (MeshyError, asyncio.CancelledError):
                raise

        raise TimeoutError(f"Meshy task {task_id} did not complete within {max_polls * poll_interval}s")

    async def download_model(
        self,
        model_url: str,
        format: str = "glb",
    ) -> bytes:
        """Download 3D model file from Meshy.

        Args:
            model_url: URL to .glb or other format
            format: Expected format ('glb', 'obj', 'fbx', etc.)

        Returns:
            Model file binary data

        Raises:
            MeshyError: If download fails
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.get(model_url)
                response.raise_for_status()
                log.info("meshy_model_downloaded", size_bytes=len(response.content))
                return response.content
            except httpx.HTTPError as e:
                log.error("meshy_download_error", url=model_url, error=str(e))
                raise MeshyError(f"Failed to download model from {model_url}: {e}") from e

    async def convert_image_to_3d(
        self,
        image_url: str,
        wait: bool = True,
        enable_pbr: bool = True,
    ) -> dict[str, Any]:
        """Full pipeline: create task and optionally wait for completion.

        Args:
            image_url: Public URL to room/object image
            wait: Whether to wait for completion (blocking)
            enable_pbr: Enable PBR texturing

        Returns:
            {
                'task_id': str,
                'status': 'SUCCEEDED' | 'RUNNING' | 'FAILED',
                'model_urls': {
                    'glb': str,  # downloadable .glb file
                    'obj': str,  # downloadable .obj file
                    ...
                }
            }

        Raises:
            MeshyError: If conversion fails
        """
        # Create task
        task = await self.image_to_3d(image_url, enable_pbr=enable_pbr)
        task_id = task.get("id")

        if not wait:
            return {"task_id": task_id, "status": "RUNNING"}

        # Wait for completion
        completed = await self.wait_for_completion(task_id)
        return {
            "task_id": task_id,
            "status": completed.get("status"),
            "model_urls": completed.get("model_urls", {}),
        }


# Singleton instance
_meshy_client: MeshyClient | None = None


def get_meshy_client() -> MeshyClient:
    """Get or create Meshy client singleton."""
    global _meshy_client
    if _meshy_client is None:
        _meshy_client = MeshyClient()
    return _meshy_client
