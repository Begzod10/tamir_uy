"""Router package — each module exposes a ``router`` APIRouter instance."""

from app.routers import auth, apartments, rooms, catalog, leads, media, estimate, draft_rooms

__all__ = [
    "auth",
    "apartments",
    "rooms",
    "catalog",
    "leads",
    "media",
    "estimate",
    "draft_rooms",
]
