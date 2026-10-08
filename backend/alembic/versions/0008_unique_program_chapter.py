"""one Sip per program chapter

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa


revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY program_id, chapter ORDER BY "
        "(SELECT COUNT(*) FROM lessons WHERE lessons.sip_id = sips.id AND completed_at IS NOT NULL) DESC, "
        "(SELECT COUNT(*) FROM lessons WHERE lessons.sip_id = sips.id AND status = 'ready') DESC, "
        "CASE status WHEN 'ready' THEN 3 WHEN 'generating' THEN 2 WHEN 'queued' THEN 1 ELSE 0 END DESC, "
        "created_at, id) AS rank FROM sips WHERE program_id IS NOT NULL AND chapter IS NOT NULL) "
        "DELETE FROM sips WHERE id IN (SELECT id FROM ranked WHERE rank > 1)"
    ))
    if op.get_bind().dialect.name == 'sqlite':
        op.create_index('uq_sips_program_chapter', 'sips', ['program_id', 'chapter'], unique=True)
    else:
        op.create_unique_constraint('uq_sips_program_chapter', 'sips', ['program_id', 'chapter'])


def downgrade() -> None:
    if op.get_bind().dialect.name == 'sqlite':
        op.drop_index('uq_sips_program_chapter', table_name='sips')
    else:
        op.drop_constraint('uq_sips_program_chapter', 'sips', type_='unique')
