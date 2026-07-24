"""One-off: create the full schema from the SQLAlchemy models.

The repo's 'initial' Alembic migration only ALTERs existing tables and never
creates them, so on a fresh database `alembic upgrade head` fails. We create
the tables straight from the models, then the caller stamps Alembic to head.
"""
import asyncio

from app.database import Base, engine
import app.models  # noqa: F401  (registers every table on Base.metadata)


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("TABLES CREATED:", sorted(Base.metadata.tables.keys()))


if __name__ == "__main__":
    asyncio.run(main())
