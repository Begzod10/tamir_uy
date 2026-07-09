"""
Import every model here so that Alembic's autogenerate can discover all
tables when it inspects `app.database.Base.metadata`.

Import order follows FK dependency: independent tables first.
"""

from app.models.user import User  # noqa: F401
from app.models.store import Store  # noqa: F401
from app.models.apartment import Apartment  # noqa: F401
from app.models.room import Room  # noqa: F401
from app.models.material import Material  # noqa: F401
from app.models.norm import Norm  # noqa: F401
from app.models.furniture import Furniture  # noqa: F401
from app.models.usta import Usta  # noqa: F401
from app.models.lead import Lead  # noqa: F401
from app.models.estimate import Estimate  # noqa: F401
from app.models.draft_room import DraftRoom  # noqa: F401

__all__ = [
    "User",
    "Store",
    "Apartment",
    "Room",
    "Material",
    "Norm",
    "Furniture",
    "Usta",
    "Lead",
    "Estimate",
    "DraftRoom",
]
