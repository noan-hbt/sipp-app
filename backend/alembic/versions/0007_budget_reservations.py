"""durable spending attribution and paid-call reservations

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-08 16:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE llm_calls SET user_id = (SELECT sips.user_id FROM sips WHERE sips.id = llm_calls.sip_id) "
        "WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM sips WHERE sips.id = llm_calls.sip_id)"
    ))
    op.add_column('llm_calls', sa.Column('reserved_until', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_llm_calls_reserved_until', 'llm_calls', ['reserved_until'])
    op.create_table('budget_lock', sa.Column('id', sa.Integer(), nullable=False), sa.PrimaryKeyConstraint('id'))
    op.execute(sa.text("INSERT INTO budget_lock (id) VALUES (1)"))
    op.add_column('sips', sa.Column('adjustment_queued', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute(sa.text(
        "UPDATE sips SET adjustment_queued = true WHERE program_id IS NOT NULL "
        "AND EXISTS (SELECT 1 FROM lessons WHERE lessons.sip_id = sips.id) "
        "AND NOT EXISTS (SELECT 1 FROM lessons WHERE lessons.sip_id = sips.id AND lessons.completed_at IS NULL)"
    ))


def downgrade() -> None:
    op.drop_column('sips', 'adjustment_queued')
    op.drop_table('budget_lock')
    op.drop_index('ix_llm_calls_reserved_until', table_name='llm_calls')
    op.drop_column('llm_calls', 'reserved_until')
