"""add position to provider models

Revision ID: b7e4d2a9c315
Revises: f1d3c5b7a902
Create Date: 2026-10-15 12:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

revision = "b7e4d2a9c315"
down_revision = "f1d3c5b7a902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("provider_models", sa.Column("position", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("provider_models", "position")
