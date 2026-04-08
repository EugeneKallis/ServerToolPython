"""initial schema

Revision ID: e2d0cb685e97
Revises:
Create Date: 2026-03-10 10:00:18.479344

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2d0cb685e97'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # macro_group
    op.create_table(
        'macro_group',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ord', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_primary_key('pk_macro_group', 'macro_group', ['id'])

    # macro
    op.create_table(
        'macro',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ord', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('macro_group_id', sa.Integer(), nullable=True),
        sa.ForeignKey(['macro_group_id'], 'macro_group', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_macro', 'macro', ['id'])

    # command
    op.create_table(
        'command',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ord', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('command', sa.String(), nullable=False),
        sa.Column('macro_id', sa.Integer(), nullable=True),
        sa.ForeignKey(['macro_id'], 'macro', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_command', 'command', ['id'])

    # command_argument
    op.create_table(
        'command_argument',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('arg_name', sa.String(), nullable=False),
        sa.Column('arg_value', sa.String(), nullable=False),
        sa.Column('command_id', sa.Integer(), nullable=False),
        sa.ForeignKey(['command_id'], 'command', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_command_argument', 'command_argument', ['id'])

    # arr_instance
    op.create_table(
        'arr_instance',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('api_key', sa.String(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
    )
    op.create_primary_key('pk_arr_instance', 'arr_instance', ['id'])
    op.create_unique_key('uq_arr_instance_name', 'arr_instance', ['name'])

    # script_run
    op.create_table(
        'script_run',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=False),
        sa.Column('macro_name', sa.String(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=True),
        sa.Column('output', sa.Text(), nullable=True),
    )
    op.create_primary_key('pk_script_run', 'script_run', ['id'])
    op.create_unique_key('uq_script_run_run_id', 'script_run', ['run_id'])
    op.create_index('ix_script_run_macro_name', 'script_run', ['macro_name'])
    op.create_index('ix_script_run_run_id', 'script_run', ['run_id'])

    # shell_history
    op.create_table(
        'shell_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('command', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_primary_key('pk_shell_history', 'shell_history', ['id'])

    # macro_schedule
    op.create_table(
        'macro_schedule',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('macro_id', sa.Integer(), nullable=False),
        sa.Column('cron_expression', sa.String(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('args', sa.Text(), nullable=True),
        sa.ForeignKey(['macro_id'], 'macro', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_macro_schedule', 'macro_schedule', ['id'])

    # scraped_item
    op.create_table(
        'scraped_item',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('image_url', sa.String(), nullable=True),
        sa.Column('magnet_link', sa.String(), nullable=False),
        sa.Column('torrent_link', sa.String(), nullable=True),
        sa.Column('tags', sa.String(), nullable=True),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('is_hidden', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_downloaded', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_primary_key('pk_scraped_item', 'scraped_item', ['id'])
    op.create_unique_key('uq_scraped_item_magnet_link', 'scraped_item', ['magnet_link'])
    op.create_index('ix_scraped_item_source', 'scraped_item', ['source'])

    # scraped_item_file
    op.create_table(
        'scraped_item_file',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('magnet_link', sa.String(), nullable=False),
        sa.Column('file_size', sa.String(), nullable=True),
        sa.Column('seeds', sa.Integer(), nullable=True),
        sa.Column('leechers', sa.Integer(), nullable=True),
        sa.ForeignKey(['item_id'], 'scraped_item', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_scraped_item_file', 'scraped_item_file', ['id'])
    op.create_unique_key('uq_scraped_item_file_magnet_link', 'scraped_item_file', ['magnet_link'])

    # chat_conversation
    op.create_table(
        'chat_conversation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=False, server_default='New Chat'),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_primary_key('pk_chat_conversation', 'chat_conversation', ['id'])

    # chat_message
    op.create_table(
        'chat_message',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKey(['conversation_id'], 'chat_conversation', ['id'], ondelete='CASCADE'),
    )
    op.create_primary_key('pk_chat_message', 'chat_message', ['id'])

    # quick_link
    op.create_table(
        'quick_link',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('ord', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_primary_key('pk_quick_link', 'quick_link', ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('quick_link')
    op.drop_table('chat_message')
    op.drop_table('chat_conversation')
    op.drop_table('scraped_item_file')
    op.drop_table('scraped_item')
    op.drop_table('macro_schedule')
    op.drop_table('shell_history')
    op.drop_table('script_run')
    op.drop_table('arr_instance')
    op.drop_table('command_argument')
    op.drop_table('command')
    op.drop_table('macro')
    op.drop_table('macro_group')
