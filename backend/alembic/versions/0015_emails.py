"""emails: password reset links, the come-back nudge and its opt-out

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-02 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email_nudges', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('users', sa.Column('nudged_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'password_resets',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_password_resets_user_id', 'password_resets', ['user_id'])
    op.create_index('ix_password_resets_token_hash', 'password_resets', ['token_hash'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_password_resets_token_hash', table_name='password_resets')
    op.drop_index('ix_password_resets_user_id', table_name='password_resets')
    op.drop_table('password_resets')
    op.drop_column('users', 'nudged_at')
    op.drop_column('users', 'email_nudges')
