from __future__ import annotations

import uuid

from sqlalchemy import Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Norm(Base):
    """
    Coverage norms per material category key.

    Examples
    --------
    material_key = "boyoq"  -> coverage_per_unit = 12.0 m² per litre
    material_key = "oboy"   -> coverage_per_unit =  5.3 m² per rulon
    material_key = "plitka" -> coverage_per_unit =  1.0 m² per m²

    Seed data is managed via Alembic data migrations or a dedicated seeder
    script; this model only defines the table schema.
    """

    __tablename__ = "norms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    material_key: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
        comment="Matches Material.category or a more specific sub-key",
    )
    coverage_per_unit: Mapped[float] = mapped_column(
        Numeric(10, 4),
        nullable=False,
        comment="m² of surface covered by one unit of this material",
    )
    coats: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        comment="Number of coats / layers typically required",
    )
    waste_factor: Mapped[float] = mapped_column(
        Numeric(4, 3),
        nullable=False,
        default=1.0,
        comment="Multiplier to account for off-cuts and waste (e.g. 1.1 = +10%)",
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    params: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment=(
            "Flexible numeric constants: bag_price_uzs, bag_kg, rate_kg_m2, "
            "piece_price_uzs, piece_m, roll_width_m, roll_length_m, pack_m2, "
            "points_default, avg_run_m, slack, price_per_m_uzs, etc."
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Norm key={self.material_key!r} "
            f"coverage={self.coverage_per_unit} coats={self.coats}>"
        )
