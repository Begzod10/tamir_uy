"""Add deleted column to rooms table

Revision ID: add_deleted
Revises: 7edc8d1c1fda
Create Date: 2026-07-23 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_deleted'
down_revision = '7edc8d1c1fda'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('rooms', sa.Column('deleted', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index('ix_rooms_deleted', 'rooms', ['deleted'], if_not_exists=True)


def downgrade():
    op.drop_index('ix_rooms_deleted', 'rooms', if_not_exists=True)
    op.drop_column('rooms', 'deleted')
