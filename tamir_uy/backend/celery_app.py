from __future__ import annotations

import os

from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery("uytamir")

app.conf.update(
    # Transport
    broker_url=REDIS_URL,
    result_backend=REDIS_URL,
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="Asia/Tashkent",
    enable_utc=True,
    # Task routing
    task_routes={
        "app.tasks.media.*": {"queue": "media"},
        "app.tasks.ai.*": {"queue": "ai-gpu"},
        "app.tasks.*": {"queue": "default"},
    },
    # Reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    # Result expiry (24 h)
    result_expires=86400,
)

app.autodiscover_tasks(["app.tasks"])
