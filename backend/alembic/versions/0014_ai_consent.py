"""when the user agreed to their requests being sent to AI model providers

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-19 20:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('ai_consent_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'ai_consent_at')
