"""when a path and a lesson became ready, and which prompts and models wrote them

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-19 18:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0013'
down_revision = '0012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sips', sa.Column('ready_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sips', sa.Column('meta', sa.JSON(), nullable=True))
    op.add_column('lessons', sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('lessons', sa.Column('meta', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('lessons', 'meta')
    op.drop_column('lessons', 'generated_at')
    op.drop_column('sips', 'meta')
    op.drop_column('sips', 'ready_at')
