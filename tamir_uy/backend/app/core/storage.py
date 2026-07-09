from __future__ import annotations

import boto3
from botocore.client import Config

from app.config import settings

_s3_client = None


def _get_s3():
    """Return (and lazily create) the boto3 S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
    return _s3_client


def upload_file(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    """Upload *file_bytes* to S3 under *key* and return the public URL."""
    s3 = _get_s3()
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
        ACL="public-read",
    )
    if settings.S3_ENDPOINT_URL:
        public_url = f"{settings.S3_ENDPOINT_URL}/{settings.S3_BUCKET}/{key}"
    else:
        public_url = (
            f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"
        )
    return public_url


def delete_file(key: str) -> None:
    """Remove an object from S3 by *key*."""
    s3 = _get_s3()
    s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)


def get_presigned_url(key: str, expires: int = 3600) -> str:
    """Return a pre-signed download URL for *key* valid for *expires* seconds."""
    s3 = _get_s3()
    url: str = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )
    return url
