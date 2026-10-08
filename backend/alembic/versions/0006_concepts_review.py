"""concept cards for review, llm_calls.user_id

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-08 10:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'concept_cards',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('sip_id', sa.String(length=36), nullable=False),
        sa.Column('lesson_id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('definition', sa.Text(), nullable=False),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('box', sa.Integer(), server_default='0', nullable=False),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reviews', sa.Integer(), server_default='0', nullable=False),
        sa.Column('lapses', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['lesson_id'], ['lessons.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sip_id'], ['sips.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('lesson_id', 'name'),
    )
    op.create_index('ix_concept_cards_user_id', 'concept_cards', ['user_id'])
    op.create_index('ix_concept_cards_sip_id', 'concept_cards', ['sip_id'])
    op.create_index('ix_concept_cards_lesson_id', 'concept_cards', ['lesson_id'])
    op.create_index('ix_concept_cards_due_at', 'concept_cards', ['due_at'])
    with op.batch_alter_table('llm_calls', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(length=36), nullable=True))
        batch_op.create_index('ix_llm_calls_user_id', ['user_id'])


def downgrade() -> None:
    with op.batch_alter_table('llm_calls', schema=None) as batch_op:
        batch_op.drop_index('ix_llm_calls_user_id')
        batch_op.drop_column('user_id')
    op.drop_table('concept_cards')
