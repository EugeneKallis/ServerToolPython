"""add_app_settings_jsonb

Revision ID: add_app_settings_jsonb
Revises: a1b2c3d4e5f6
Create Date: 2026-05-09 19:56:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "add_app_settings_jsonb"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create app_settings table with JSONB value column and GIN index
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.execute("CREATE INDEX ix_app_settings_value ON app_settings USING gin (value)")


def downgrade() -> None:
    op.drop_table("app_settings")