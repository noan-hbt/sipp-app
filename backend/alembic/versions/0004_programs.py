"""programs and chapters

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-07 18:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'programs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('profile', sa.JSON(), nullable=True),
        sa.Column('roadmap', sa.JSON(), nullable=False),
        sa.Column('lite', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_programs_user_id', 'programs', ['user_id'])
    with op.batch_alter_table('sips', schema=None) as batch_op:
        batch_op.add_column(sa.Column('program_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('chapter', sa.Integer(), nullable=True))
        batch_op.create_index('ix_sips_program_id', ['program_id'])
        batch_op.create_foreign_key('fk_sips_program_id', 'programs', ['program_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    with op.batch_alter_table('sips', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sips_program_id', type_='foreignkey')
        batch_op.drop_index('ix_sips_program_id')
        batch_op.drop_column('chapter')
        batch_op.drop_column('program_id')
    op.drop_index('ix_programs_user_id', table_name='programs')
    op.drop_table('programs')
