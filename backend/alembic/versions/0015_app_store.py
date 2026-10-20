"""App Store subscriptions through RevenueCat replace Paddle; password reset codes

Paddle never billed anyone in production: its rows are dropped, not converted.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-20 10:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def _stamps():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.drop_index('ix_billing_records_subscription_id', table_name='billing_records')
    op.drop_index('ix_billing_records_user_id', table_name='billing_records')
    op.drop_table('billing_records')
    op.drop_index('ix_billing_subscriptions_status', table_name='billing_subscriptions')
    op.drop_index('ix_billing_subscriptions_customer_id', table_name='billing_subscriptions')
    op.drop_index('ix_billing_subscriptions_user_id', table_name='billing_subscriptions')
    op.drop_table('billing_subscriptions')
    op.execute('DELETE FROM billing_events')
    op.drop_index('ix_users_billing_customer_id', table_name='users')
    # A plain ALTER (SQLite 3.35+ too): a batch copy of users would cascade-delete everything users own.
    op.execute('ALTER TABLE users DROP COLUMN billing_customer_id')

    op.create_table(
        'billing_subscriptions',
        sa.Column('id', sa.String(160), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('product_id', sa.String(100), nullable=True),
        sa.Column('store', sa.String(20), nullable=True),
        sa.Column('sandbox', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('interval', sa.String(10), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('past_due_since', sa.DateTime(timezone=True), nullable=True),
        sa.Column('event_at', sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
    )
    op.create_index('ix_billing_subscriptions_user_id', 'billing_subscriptions', ['user_id'])
    op.create_index('ix_billing_subscriptions_status', 'billing_subscriptions', ['status'])

    op.create_table(
        'password_resets',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code_hash', sa.String(64), nullable=False),
        sa.Column('attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_password_resets_user_id', 'password_resets', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_password_resets_user_id', table_name='password_resets')
    op.drop_table('password_resets')
    op.drop_index('ix_billing_subscriptions_status', table_name='billing_subscriptions')
    op.drop_index('ix_billing_subscriptions_user_id', table_name='billing_subscriptions')
    op.drop_table('billing_subscriptions')
    op.add_column('users', sa.Column('billing_customer_id', sa.String(64), nullable=True))
    op.create_index('ix_users_billing_customer_id', 'users', ['billing_customer_id'])
    op.create_table(
        'billing_subscriptions',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('customer_id', sa.String(64), nullable=True),
        sa.Column('plan', sa.String(20), nullable=False),
        sa.Column('interval', sa.String(10), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('past_due_since', sa.DateTime(timezone=True), nullable=True),
        sa.Column('event_at', sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
    )
    op.create_index('ix_billing_subscriptions_user_id', 'billing_subscriptions', ['user_id'])
    op.create_index('ix_billing_subscriptions_customer_id', 'billing_subscriptions', ['customer_id'])
    op.create_index('ix_billing_subscriptions_status', 'billing_subscriptions', ['status'])
    op.create_table(
        'billing_records',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('subscription_id', sa.String(64), nullable=True),
        sa.Column('transaction_id', sa.String(64), nullable=True),
        sa.Column('action', sa.String(30), nullable=True),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('total', sa.Integer(), nullable=True),
        sa.Column('tax', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(3), nullable=True),
        sa.Column('invoice_number', sa.String(64), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=True),
        *_stamps(),
    )
    op.create_index('ix_billing_records_user_id', 'billing_records', ['user_id'])
    op.create_index('ix_billing_records_subscription_id', 'billing_records', ['subscription_id'])
