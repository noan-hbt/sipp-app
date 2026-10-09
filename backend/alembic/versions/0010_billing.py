"""paddle billing: subscriptions, payments, webhook deliveries

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-09 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def _stamps():
    return [
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
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
    op.create_table(
        'billing_events',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('type', sa.String(60), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('billing_events')
    op.drop_index('ix_billing_records_subscription_id', table_name='billing_records')
    op.drop_index('ix_billing_records_user_id', table_name='billing_records')
    op.drop_table('billing_records')
    op.drop_index('ix_billing_subscriptions_status', table_name='billing_subscriptions')
    op.drop_index('ix_billing_subscriptions_customer_id', table_name='billing_subscriptions')
    op.drop_index('ix_billing_subscriptions_user_id', table_name='billing_subscriptions')
    op.drop_table('billing_subscriptions')
    op.drop_index('ix_users_billing_customer_id', table_name='users')
    op.drop_column('users', 'billing_customer_id')
