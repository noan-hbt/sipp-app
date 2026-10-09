"""habits (daily goal, reminders, push), lesson feedback, notes, module quiz, difficulty

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-09 14:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('daily_goal', sa.Integer(), server_default='1', nullable=False))
    op.add_column('users', sa.Column('reminder_hour', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('timezone', sa.String(64), nullable=True))
    op.add_column('users', sa.Column('push_subscription', sa.JSON(), nullable=True))
    op.add_column('users', sa.Column('reminded_on', sa.String(10), nullable=True))
    op.add_column('sips', sa.Column('difficulty', sa.Integer(), server_default='0', nullable=False))
    op.add_column('modules', sa.Column('quiz_stars', sa.Integer(), nullable=True))
    op.create_table(
        'lesson_feedback',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('lesson_id', sa.String(36), sa.ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True),
        sa.Column('feeling', sa.String(10), nullable=True),
        sa.Column('problem', sa.String(30), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('block', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_lesson_feedback_user_id', 'lesson_feedback', ['user_id'])
    op.create_index('ix_lesson_feedback_lesson_id', 'lesson_feedback', ['lesson_id'])
    op.create_table(
        'notes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('lesson_id', sa.String(36), sa.ForeignKey('lessons.id', ondelete='CASCADE'), nullable=False),
        sa.Column('block', sa.Integer(), nullable=False),
        sa.Column('quote', sa.Text(), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_notes_user_id', 'notes', ['user_id'])
    op.create_index('ix_notes_lesson_id', 'notes', ['lesson_id'])


def downgrade() -> None:
    op.drop_index('ix_notes_lesson_id', table_name='notes')
    op.drop_index('ix_notes_user_id', table_name='notes')
    op.drop_table('notes')
    op.drop_index('ix_lesson_feedback_lesson_id', table_name='lesson_feedback')
    op.drop_index('ix_lesson_feedback_user_id', table_name='lesson_feedback')
    op.drop_table('lesson_feedback')
    op.drop_column('modules', 'quiz_stars')
    op.drop_column('sips', 'difficulty')
    for col in ('reminded_on', 'push_subscription', 'timezone', 'reminder_hour', 'daily_goal'):
        op.drop_column('users', col)
