"""job claim ownership

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-08
"""
from alembic import op
import sqlalchemy as sa


revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('claim_token', sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'claim_token')
