"""Media processing Celery tasks – Phase 3 stubs.

These tasks are intentionally left as stubs so the task signatures and queue
routing are established before the full AI pipeline is implemented in Phase 3.
"""
from __future__ import annotations

import logging

from celery_app import app

logger = logging.getLogger(__name__)


@app.task(
    name="app.tasks.media.process_photo",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    queue="media",
)
def process_photo(self, photo_key: str, room_id: str) -> dict:
    """Placeholder task for Phase 3 photo processing pipeline.

    Will eventually:
    - Download the photo from S3
    - Run segmentation / style-transfer via the AI GPU queue
    - Upload processed variants back to S3
    - Update the room record in the database

    Args:
        photo_key: S3 object key of the original uploaded photo.
        room_id:   UUID string of the Room this photo belongs to.

    Returns:
        A status dict that will be stored as the Celery task result.
    """
    logger.info(
        "process_photo invoked (stub) – phase 3 not yet implemented",
        extra={"photo_key": photo_key, "room_id": room_id},
    )
    return {"status": "pending", "photo_key": photo_key, "room_id": room_id}
