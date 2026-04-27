"""drop scraped_item_file table

Revision ID: a1b2c3d4e5f6
Revises: bb34484787a6
Create Date: 2026-04-27 14:53:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "bb34484787a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("scraped_item_file")


def downgrade() -> None:
    pass