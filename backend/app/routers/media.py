from __future__ import annotations

import uuid as uuid_module

import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, HTTPException, UploadFile, status

from app.api.v1.deps import CurrentUser
from celery_app import app as celery_app
from app.core.storage import upload_file
from app.tasks.media import process_photo

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["media"])

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@router.post(
    "/media/photos",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a room photo; triggers background processing",
)
async def upload_photo(
    file: UploadFile,
    current_user: CurrentUser,
) -> dict:
    """Accept a multipart image upload, validate it, store it in S3, and
    enqueue the ``process_photo`` Celery task.  Returns the Celery job ID and
    the raw photo URL so the client can poll ``/jobs/{job_id}`` for status."""
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type {file.content_type!r}. "
                   f"Accepted: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {_MAX_FILE_SIZE_BYTES // (1024*1024)} MB",
        )
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file received",
        )

    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    photo_key = f"photos/{current_user.id}/{uuid_module.uuid4()}.{ext}"

    try:
        photo_url = upload_file(file_bytes, photo_key, content_type=file.content_type or "image/jpeg")
    except Exception as exc:
        logger.error("s3_upload_failed", key=photo_key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload photo to storage",
        ) from exc

    task = process_photo.delay(photo_key, str(current_user.id))

    logger.info("photo_uploaded", key=photo_key, task_id=task.id, user_id=str(current_user.id))
    return {"job_id": task.id, "photo_url": photo_url}


@router.get(
    "/jobs/{job_id}",
    summary="Poll Celery task status",
)
async def get_job_status(
    job_id: str,
    current_user: CurrentUser,
) -> dict:
    """Return the current state of a background Celery task."""
    result = AsyncResult(job_id, app=celery_app)
    return {
        "job_id": job_id,
        "status": result.status,
        "result": result.result if result.ready() else None,
    }
