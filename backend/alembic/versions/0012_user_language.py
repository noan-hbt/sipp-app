"""user interface language, for reminders

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-19 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('language', sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'language')
