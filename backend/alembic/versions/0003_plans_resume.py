"""plans, lite sips, lesson resume

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-07 12:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('plan', sa.String(length=20), nullable=False, server_default='free'))
        batch_op.add_column(sa.Column('plan_expires_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('trial_started_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('gen_month', sa.String(length=7), nullable=True))
        batch_op.add_column(sa.Column('gen_count', sa.Integer(), nullable=False, server_default='0'))
    with op.batch_alter_table('sips', schema=None) as batch_op:
        batch_op.add_column(sa.Column('lite', sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('resume', sa.JSON(), nullable=True))
    # Accounts created before plans existed are team/test accounts.
    op.execute("UPDATE users SET plan = 'max'")


def downgrade() -> None:
    with op.batch_alter_table('lessons', schema=None) as batch_op:
        batch_op.drop_column('resume')
    with op.batch_alter_table('sips', schema=None) as batch_op:
        batch_op.drop_column('lite')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('gen_count')
        batch_op.drop_column('gen_month')
        batch_op.drop_column('trial_started_at')
        batch_op.drop_column('plan_expires_at')
        batch_op.drop_column('plan')
