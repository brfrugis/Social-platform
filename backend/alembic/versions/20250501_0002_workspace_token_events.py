"""workspace_token_events for per-customer Ollama usage.

Revision ID: 20250501_0002
Revises: 20250501_0001
Create Date: 2026-05-01

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20250501_0002"
down_revision: Union[str, Sequence[str], None] = "20250501_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workspace_token_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("principal_id", sa.String(length=128), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workspace_token_events_customer_id"),
        "workspace_token_events",
        ["customer_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workspace_token_events_operation"),
        "workspace_token_events",
        ["operation"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workspace_token_events_created_at"),
        "workspace_token_events",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_workspace_token_events_customer_created",
        "workspace_token_events",
        ["customer_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_token_events_customer_created", table_name="workspace_token_events")
    op.drop_index(op.f("ix_workspace_token_events_created_at"), table_name="workspace_token_events")
    op.drop_index(op.f("ix_workspace_token_events_operation"), table_name="workspace_token_events")
    op.drop_index(op.f("ix_workspace_token_events_customer_id"), table_name="workspace_token_events")
    op.drop_table("workspace_token_events")
